#!/usr/bin/env python3
"""
Standalone Mac-side BLE recovery test for WHOOP 4.0 (Gen4) strap.

Mimics chukfinley/whoopsi's smart-sync flow byte-for-byte:
  1. Connect to the strap (no app needed)
  2. Subscribe to CMD_FROM, EVENTS, DATA characteristics
  3. Send the same init sequence whoopsi sends
  4. Try FORCE_TRIM(0, 0) to rewind the trim watermark
  5. Issue SEND_HISTORICAL_DATA and count records that flow back

Purpose: prove (or disprove) that whoopsi's FORCE_TRIM recovery actually
works on Gen4 firmware, independent of our React Native app. If this
script pulls thousands of records, whoopsi's technique works and our
app's Maverick framing has a subtle bug. If it pulls ~150 (same as our
normal sync), Gen4 firmware genuinely doesn't honor FORCE_TRIM and the
data is unreachable.

Setup:
  python3 -m venv .venv
  source .venv/bin/activate
  pip install bleak
  python whoop_recovery.py

Strap must NOT be actively connected to any phone while this runs.
Disable Bluetooth on both phones first.
"""

import asyncio
import binascii
import struct
import sys
from zlib import crc32

from bleak import BleakClient, BleakScanner
from bleak.backends.characteristic import BleakGATTCharacteristic

# Gen4 (WHOOP 4.0) GATT — same UUIDs as whoopsi's GEN4_*
SERVICE_UUID = "61080001-8d6d-82b8-614a-1c8cb0f8dcc6"
CMD_TO_UUID = "61080002-8d6d-82b8-614a-1c8cb0f8dcc6"
CMD_FROM_UUID = "61080003-8d6d-82b8-614a-1c8cb0f8dcc6"
EVENTS_UUID = "61080004-8d6d-82b8-614a-1c8cb0f8dcc6"
DATA_UUID = "61080005-8d6d-82b8-614a-1c8cb0f8dcc6"

# Command codes (Maverick numbering per whoopsi; cross-gen)
CMD_ABORT_HISTORICAL = 0x14
CMD_SEND_HISTORICAL_DATA = 0x16
CMD_HISTORICAL_DATA_RESULT = 0x17
CMD_FORCE_TRIM = 0x19
CMD_GET_BATTERY_LEVEL = 0x1A
CMD_FORCE_TRIM_SAFE_FORWARD_ONLY = 0x19  # alias to make the guard explicit
CMD_SET_READ_POINTER = 0x21
CMD_GET_DATA_RANGE = 0x22
CMD_GET_EXTENDED_BATTERY_INFO = 0x62
CMD_GET_HELLO_EXT = 0x91

# Frame constants
SOF = 0xAA
REVISION = 0x01
CMD_TYPE_COMMAND = 0x23
TRIM_ALL_SENTINEL = 0xFEFEFEFE


def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc & 0xFFFF


_seq = 0


def next_seq() -> int:
    global _seq
    s = _seq
    _seq = (_seq + 1) & 0xFF
    return s


def crc8(data: bytes, poly: int = 0x07) -> int:
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def build_legacy(cmd: int, params: bytes = b"") -> bytes:
    """Our React Native app's framing — the one Gen4 actually speaks.
    Frame: SOF + length(2 LE) + crc8(length) + [type, seq, cmd, params] + CRC32 LE
    """
    # payload = type + seq + cmd + params
    payload_inner = bytes([CMD_TYPE_COMMAND, next_seq(), cmd]) + params
    length = len(payload_inner) + 4  # +4 for CRC32 footer
    length_bytes = bytes([length & 0xFF, (length >> 8) & 0xFF])
    lcrc = crc8(length_bytes)
    pcrc = crc32(payload_inner) & 0xFFFFFFFF
    frame = bytes([SOF]) + length_bytes + bytes([lcrc]) + payload_inner + struct.pack("<I", pcrc)
    return frame


def build_maverick(cmd: int, params: bytes = b"") -> bytes:
    """Port of whoopsi WhoopProtocol.buildCommand — Maverick framing.
    Gen4 firmware does NOT accept this; kept for comparison only.
    """
    raw_payload_len = 3 + len(params)
    pad = 0 if raw_payload_len % 4 == 0 else 4 - (raw_payload_len % 4)
    payload_len = raw_payload_len + pad
    length_field = payload_len + 4
    total_len = 8 + payload_len + 4

    frame = bytearray(total_len)
    frame[0] = SOF
    frame[1] = REVISION
    frame[2] = length_field & 0xFF
    frame[3] = (length_field >> 8) & 0xFF
    frame[4] = 0x00
    frame[5] = 0x01
    hcrc = crc16_modbus(bytes(frame[0:6]))
    frame[6] = hcrc & 0xFF
    frame[7] = (hcrc >> 8) & 0xFF
    frame[8] = CMD_TYPE_COMMAND
    frame[9] = next_seq()
    frame[10] = cmd & 0xFF
    frame[11 : 11 + len(params)] = params
    # padding bytes already zero

    payload = bytes(frame[8 : 8 + payload_len])
    pcrc = crc32(payload) & 0xFFFFFFFF
    struct.pack_into("<I", frame, 8 + payload_len, pcrc)
    return bytes(frame)


# ── Choose framing for the test. Toggle to compare. ──
build = build_legacy  # ← Gen4 uses legacy framing; switch to build_maverick to test failure mode


def force_trim(sector: int, offset: int, padded: bool = False) -> bytes:
    """FORCE_TRIM(sector, offset). The official Whoop 4.0 app sends 9 bytes:
    [sector_LE(4), offset_LE(4), 0x00] — observed in bWanShiTong's blog post
    where the erase command shows `19 fefefefefefefefe 00` (9 data bytes).
    Whoopsi's 8-byte format may be wrong for Gen4 — the strap may require
    the trailing padding byte for 4-byte payload alignment. Toggle `padded`.
    """
    if sector == TRIM_ALL_SENTINEL or offset == TRIM_ALL_SENTINEL:
        raise ValueError("Refusing TRIM_ALL sentinel — permanently consumes data!")
    params = struct.pack("<II", sector, offset)
    if padded:
        params = params + b"\x00"  # 9 bytes total — matches official app
    return build(CMD_FORCE_TRIM, params)


def force_trim_all() -> bytes:
    """ABSOLUTELY DO NOT USE. Listed for the safety guard above."""
    raise RuntimeError("Refused — TRIM_ALL permanently consumes data for this bond.")


def historical_data_result(sector_bytes: bytes, offset_bytes: bytes) -> bytes:
    """ACK after each burst. Copies raw sector:offset from 0x31 event."""
    assert len(sector_bytes) == 4 and len(offset_bytes) == 4
    params = b"\x01" + sector_bytes + offset_bytes
    return build(CMD_HISTORICAL_DATA_RESULT, params)


def hex_str(data: bytes) -> str:
    return " ".join(f"{b:02x}" for b in data)


# ────────────────────────────────────────────────────────────────────
# Response parsers — Gen4 uses legacy framing; try that first, fall back
# to Maverick. Either way, returns {cmd_type, seq, cmd, params}.
# ────────────────────────────────────────────────────────────────────
def parse_legacy(data: bytes):
    if len(data) < 8 or data[0] != SOF:
        return None
    length = struct.unpack_from("<H", data, 1)[0]
    payload_end = 4 + (length - 4)  # SOF+len+crc8 = 4, length includes payload + CRC32
    if payload_end <= 4 or len(data) < payload_end + 4:
        return None
    payload = data[4:payload_end]
    if len(payload) < 3:
        return None
    return {
        "cmd_type": payload[0],
        "seq": payload[1],
        "cmd": payload[2],
        "params": payload[3:],
    }


def parse_maverick(data: bytes):
    if len(data) < 12 or data[0] != SOF:
        return None
    length = struct.unpack_from("<H", data, 2)[0]
    payload_end = len(data) - 4
    if payload_end <= 8:
        return None
    payload = data[8:payload_end]
    if len(payload) < 3:
        return None
    return {
        "cmd_type": payload[0],
        "seq": payload[1],
        "cmd": payload[2],
        "params": payload[3:],
    }


def parse_response(data: bytes):
    # Try legacy first (Gen4), fall back to Maverick.
    return parse_legacy(data) or parse_maverick(data)


# Counters / state
sensor_packets = 0
event_packets = 0
last_cmd_responses: dict[int, bytes] = {}
last_history_sector: bytes | None = None
last_history_offset: bytes | None = None
history_complete = False
history_end_event = asyncio.Event()


def parse_aa01_inner(data: bytes) -> bytes | None:
    """Extract the inner payload of an AA01-framed packet on data/events.
    Auto-detect legacy vs Maverick based on byte[1]: 0x01 = Maverick (REVISION),
    otherwise legacy (length low byte).
    """
    if len(data) < 8 or data[0] != SOF:
        return None
    if data[1] == 0x01:
        # Maverick framing
        length = struct.unpack_from("<H", data, 2)[0]
        if len(data) < 8 + (length - 4):
            return None
        return data[8 : 8 + (length - 4)]
    else:
        # Legacy framing
        length = struct.unpack_from("<H", data, 1)[0]
        if len(data) < 4 + (length - 4):
            return None
        return data[4 : 4 + (length - 4)]


def make_cmd_handler(client: BleakClient):
    async def handler(_: BleakGATTCharacteristic, data: bytearray):
        raw = bytes(data)
        # Always dump raw bytes so we can see what's actually coming back
        print(f"  <<< CMD raw ({len(raw)}B): {hex_str(raw)}")
        pkt = parse_response(raw)
        if pkt is None:
            print(f"      (no valid Whoop frame — neither legacy nor Maverick decoded)")
            return
        cmd = pkt["cmd"]
        last_cmd_responses[cmd] = pkt["params"]
        print(
            f"      decoded: cmd=0x{cmd:02x} seq={pkt['seq']} params({len(pkt['params'])}B): "
            f"{hex_str(pkt['params'])[:90]}"
        )

    return handler


def events_handler(_: BleakGATTCharacteristic, data: bytearray):
    """0x31 events live here: HISTORY_START, HISTORY_END, HISTORY_COMPLETE.
    Also dump raw so we can see what unsolicited events the strap sends.
    """
    global event_packets, last_history_sector, last_history_offset, history_complete
    event_packets += 1
    raw = bytes(data)
    print(f"  <<< EVENT raw ({len(raw)}B): {hex_str(raw)[:120]}")
    inner = parse_aa01_inner(raw)
    if inner is None or len(inner) < 3:
        return
    pkt_type = inner[0]
    if pkt_type != 0x31:
        # Non-history event — just dump and continue
        print(f"      (non-0x31 event, type=0x{pkt_type:02x})")
        return
    meta_type = inner[2]
    label = {1: "HISTORY_START", 2: "HISTORY_END", 3: "HISTORY_COMPLETE"}.get(
        meta_type, f"meta={meta_type}"
    )
    print(f"      0x31 {label} inner({len(inner)}B): {hex_str(inner)[:90]}")
    if meta_type == 2 and len(inner) >= 21:
        last_history_sector = bytes(inner[13:17])
        last_history_offset = bytes(inner[17:21])
        history_end_event.set()
    elif meta_type == 3:
        history_complete = True
        history_end_event.set()


def data_handler(_: BleakGATTCharacteristic, data: bytearray):
    """Sensor data packets (0x2F)."""
    global sensor_packets
    sensor_packets += 1


# ────────────────────────────────────────────────────────────────────
# Main flow
# ────────────────────────────────────────────────────────────────────
async def find_strap():
    print("Scanning for WHOOP straps (8 seconds)…")
    devices = await BleakScanner.discover(timeout=8.0, return_adv=True)
    candidates = []
    for addr, (device, adv) in devices.items():
        name = (device.name or adv.local_name or "").lower()
        if "whoop" in name or any(SERVICE_UUID.lower() in u.lower() for u in adv.service_uuids or []):
            candidates.append((device, adv))
    if not candidates:
        print("  No WHOOP found. Make sure phone Bluetooth is OFF.")
        return None
    for i, (d, a) in enumerate(candidates):
        print(f"  [{i}] {d.address} name={d.name!r} rssi={a.rssi}")
    return candidates[0][0]


async def write(client, frame: bytes, label: str):
    print(f"  >>> {label} ({len(frame)}B): {hex_str(frame)}")
    await client.write_gatt_char(CMD_TO_UUID, frame, response=True)


async def wait_for_cmd(cmd: int, timeout: float = 3.0) -> bytes | None:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if cmd in last_cmd_responses:
            return last_cmd_responses.pop(cmd)
        await asyncio.sleep(0.05)
    return None


def decode_data_range(params: bytes) -> dict | None:
    """Decode GET_DATA_RANGE response params. Legacy framing strips 4
    fewer bytes than Maverick does, so offsets shift. Our React Native
    app empirically extracts: start@11, end@15, rollover@23 (relative
    to the start of params in legacy framing).
    """
    if len(params) < 27:
        return None
    return {
        "start": struct.unpack_from("<I", params, 11)[0],
        "end": struct.unpack_from("<I", params, 15)[0],
        "rollover": struct.unpack_from("<I", params, 23)[0],
    }


async def main():
    global sensor_packets, event_packets, last_cmd_responses, history_complete

    device = await find_strap()
    if not device:
        sys.exit(1)

    print(f"\nConnecting to {device.address}…")
    async with BleakClient(device.address) as client:
        print(f"Connected. MTU: {client.mtu_size}")

        print("Subscribing CMD/EVENTS/DATA notifications…")
        await client.start_notify(CMD_FROM_UUID, make_cmd_handler(client))
        await client.start_notify(EVENTS_UUID, events_handler)
        await client.start_notify(DATA_UUID, data_handler)
        await asyncio.sleep(0.5)

        # ── Init sequence (LEGACY framing — what Gen4 actually speaks) ──
        print(f"\n── INIT (framing={build.__name__}) ──")
        await write(client, build(CMD_ABORT_HISTORICAL, b"\x00"), "ABORT_HISTORICAL")
        await asyncio.sleep(0.3)
        await write(client, build(CMD_GET_BATTERY_LEVEL, b"\x00"), "GET_BATTERY_LEVEL")
        await wait_for_cmd(CMD_GET_BATTERY_LEVEL, 2.0)

        # ── Data range BEFORE force_trim ──
        print("\n── GET_DATA_RANGE (before FORCE_TRIM) ──")
        await write(client, build(CMD_GET_DATA_RANGE, b"\x00"), "GET_DATA_RANGE")
        params = await wait_for_cmd(CMD_GET_DATA_RANGE, 3.0)
        before = decode_data_range(params) if params else None
        print(f"  decoded: {before}")

        # ── FORCE_TRIM(0, 0) — 8 bytes (whoopsi-style) ──
        print("\n── FORCE_TRIM(0, 0) [8-byte payload, whoopsi style] ──")
        await write(client, force_trim(0, 0, padded=False), "FORCE_TRIM(0,0) 8B")
        trim_rsp = await wait_for_cmd(CMD_FORCE_TRIM, 3.0)
        print(f"  response: {hex_str(trim_rsp) if trim_rsp else '(no response)'}")
        await asyncio.sleep(1.0)

        # ── FORCE_TRIM(0, 0) — 9 bytes (matches actual Whoop 4.0 app per blog) ──
        print("\n── FORCE_TRIM(0, 0) [9-byte payload, blog-documented format] ──")
        await write(client, force_trim(0, 0, padded=True), "FORCE_TRIM(0,0) 9B")
        trim_rsp = await wait_for_cmd(CMD_FORCE_TRIM, 3.0)
        print(f"  response: {hex_str(trim_rsp) if trim_rsp else '(no response)'}")
        await asyncio.sleep(1.5)

        # ── FORCE_TRIM(10, 0) — sector 10 (historical buffer), 9 bytes ──
        print("\n── FORCE_TRIM(10, 0) [sector 10, 9-byte payload] ──")
        await write(client, force_trim(10, 0, padded=True), "FORCE_TRIM(10,0) 9B")
        trim_rsp = await wait_for_cmd(CMD_FORCE_TRIM, 3.0)
        print(f"  response: {hex_str(trim_rsp) if trim_rsp else '(no response)'}")
        await asyncio.sleep(1.5)

        # ── Data range AFTER force_trim ──
        print("\n── GET_DATA_RANGE (after FORCE_TRIM) ──")
        await write(client, build(CMD_GET_DATA_RANGE, b"\x00"), "GET_DATA_RANGE")
        params = await wait_for_cmd(CMD_GET_DATA_RANGE, 3.0)
        after = decode_data_range(params) if params else None
        print(f"  decoded: {after}")
        if before and after:
            moved = after["start"] - before["start"]
            print(f"  Δstart = {moved}  ({'REWOUND' if moved < -10 else 'forward drift / unchanged'})")

        # ── Sync loop: SEND_HISTORICAL_DATA once, then ACK each burst ──
        print("\n── SEND_HISTORICAL_DATA — counting records that flow back ──")
        history_complete = False
        sensor_packets = 0
        await write(client, build(CMD_SEND_HISTORICAL_DATA, b"\x00"), "SEND_HISTORICAL_DATA")

        burst_count = 0
        max_bursts = 200  # 200 bursts × ~50 records each = 10k records = ~6 days
        start_time = asyncio.get_event_loop().time()
        while burst_count < max_bursts and not history_complete:
            history_end_event.clear()
            try:
                await asyncio.wait_for(history_end_event.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                print(f"  No more bursts — stopping after {burst_count} bursts, {sensor_packets} sensor packets")
                break
            burst_count += 1
            if history_complete:
                print(f"  HISTORY_COMPLETE — final: {burst_count} bursts, {sensor_packets} packets")
                break
            # ACK with the raw sector:offset from the HISTORY_END event
            if last_history_sector and last_history_offset:
                ack = historical_data_result(last_history_sector, last_history_offset)
                await client.write_gatt_char(CMD_TO_UUID, ack, response=True)
                if burst_count % 5 == 0:
                    print(
                        f"  ACK'd burst {burst_count} (sector={hex_str(last_history_sector)} "
                        f"offset={hex_str(last_history_offset)}) — running total: {sensor_packets} packets"
                    )

        elapsed = asyncio.get_event_loop().time() - start_time
        print(f"\n══ FINAL ══")
        print(f"  Bursts received  : {burst_count}")
        print(f"  Sensor packets   : {sensor_packets}")
        print(f"  Events           : {event_packets}")
        print(f"  Elapsed          : {elapsed:.1f}s")
        if sensor_packets > 1000:
            print(f"  ✅ Pulled {sensor_packets} packets — whoopsi's FORCE_TRIM technique works on this strap!")
            print(f"     Port the exact Maverick framing + flow to the React Native app.")
        elif sensor_packets > 0:
            print(f"  ⚠️  Only {sensor_packets} packets — same as normal incremental sync.")
            print(f"     Gen4 firmware does NOT honor FORCE_TRIM for pre-trim recovery.")
            print(f"     The 11-day window is genuinely unreachable from any client.")
        else:
            print(f"  ❌ Zero packets — strap may have disconnected or rejected SEND_HISTORICAL.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
