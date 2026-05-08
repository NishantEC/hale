import { SOF, PacketType, WhoopPacket } from './packet-types';

// ---------------------------------------------------------------------------
// CRC8 (polynomial 0x07)
// ---------------------------------------------------------------------------
export function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc;
}

// ---------------------------------------------------------------------------
// CRC32 (reflected polynomial 0xEDB88320)
// ---------------------------------------------------------------------------
const crc32Table: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
    table[i] = crc;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (~crc) >>> 0;
}

// ---------------------------------------------------------------------------
// Frame encoding
// ---------------------------------------------------------------------------
export function encodeFrame(packet: WhoopPacket): Uint8Array {
  const payload = new Uint8Array(3 + packet.data.length);
  payload[0] = packet.type;
  payload[1] = packet.sequence;
  payload[2] = packet.command;
  payload.set(packet.data, 3);

  const length = payload.length + 4; // payload + 4 bytes for CRC32
  const lengthBytes = new Uint8Array([length & 0xff, (length >> 8) & 0xff]);
  const lengthCrc = crc8(lengthBytes);

  const checksum = crc32(payload);
  const crc32Bytes = new Uint8Array([
    checksum & 0xff,
    (checksum >>> 8) & 0xff,
    (checksum >>> 16) & 0xff,
    (checksum >>> 24) & 0xff,
  ]);

  // SOF(1) + length(2) + lengthCRC(1) + payload + crc32(4)
  const frame = new Uint8Array(4 + payload.length + 4);
  frame[0] = SOF;
  frame[1] = lengthBytes[0];
  frame[2] = lengthBytes[1];
  frame[3] = lengthCrc;
  frame.set(payload, 4);
  frame.set(crc32Bytes, 4 + payload.length);

  return frame;
}

// ---------------------------------------------------------------------------
// Frame decoding
// ---------------------------------------------------------------------------
export function decodeFrame(frame: Uint8Array): WhoopPacket | null {
  if (frame.length < 8 || frame[0] !== SOF) {
    return null;
  }

  // Read length (LE16)
  const length = frame[1] | (frame[2] << 8);

  // Verify CRC8 over length bytes
  const lengthBytes = new Uint8Array([frame[1], frame[2]]);
  if (crc8(lengthBytes) !== frame[3]) {
    return null;
  }

  const payloadLength = length - 4;
  if (payloadLength < 3 || frame.length < 4 + length) {
    return null;
  }

  // Extract payload
  const payload = frame.slice(4, 4 + payloadLength);

  // Verify CRC32
  const expectedCrc =
    frame[4 + payloadLength] |
    (frame[4 + payloadLength + 1] << 8) |
    (frame[4 + payloadLength + 2] << 16) |
    ((frame[4 + payloadLength + 3] << 24) >>> 0);
  const actualCrc = crc32(payload);
  if ((expectedCrc >>> 0) !== (actualCrc >>> 0)) {
    return null;
  }

  return {
    type: payload[0] as PacketType,
    sequence: payload[1],
    command: payload[2],
    data: payload.slice(3),
  };
}

// ---------------------------------------------------------------------------
// Base64 utilities (no atob/btoa dependency)
// ---------------------------------------------------------------------------
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS[i]] = i;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  // Strip padding
  const cleaned = base64.replace(/=+$/, '');
  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const result = new Uint8Array(byteLength);

  let idx = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = B64_LOOKUP[cleaned[i]] ?? 0;
    const b = B64_LOOKUP[cleaned[i + 1]] ?? 0;
    const c = B64_LOOKUP[cleaned[i + 2]] ?? 0;
    const d = B64_LOOKUP[cleaned[i + 3]] ?? 0;

    result[idx++] = (a << 2) | (b >> 4);
    if (idx < byteLength) result[idx++] = ((b & 0x0f) << 4) | (c >> 2);
    if (idx < byteLength) result[idx++] = ((c & 0x03) << 6) | d;
  }

  return result;
}

export function uint8ArrayToBase64(data: Uint8Array): string {
  let result = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i];
    const b = i + 1 < data.length ? data[i + 1] : 0;
    const c = i + 2 < data.length ? data[i + 2] : 0;

    result += B64_CHARS[a >> 2];
    result += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
    result += i + 1 < data.length ? B64_CHARS[((b & 0x0f) << 2) | (c >> 6)] : '=';
    result += i + 2 < data.length ? B64_CHARS[c & 0x3f] : '=';
  }

  return result;
}
