import { CommandNumber, EventNumber, PacketType, WhoopPacket } from './packet-types';

/**
 * Battery-related packet parsers.
 *
 * Three sources of truth, in increasing reactivity:
 *   1. Command 26 response — polled (whoomp.js uses 30 s cadence).
 *   2. Event 3 (BatteryLevel) — strap-pushed unsolicited (~4 min).
 *   3. Event 63 (ExtendedBatteryInformation) — pushed alongside #2.
 *
 * All three return values are sanity-bounded to Li-ion physical
 * limits; out-of-range readings return null so we never display
 * obviously-broken data.
 */

function readUint16LE(data: Uint8Array, offset: number): number | null {
  if (offset + 1 >= data.length) return null;
  return data[offset] | (data[offset + 1] << 8);
}

export const BATTERY_SOC_MAX_TENTHS = 1100;
export const BATTERY_VOLTAGE_MIN_MV = 2500;
export const BATTERY_VOLTAGE_MAX_MV = 4500;
export const BATTERY_TEMP_MIN_TENTHS = 50;
export const BATTERY_TEMP_MAX_TENTHS = 700;

function clampSocTenths(t: number | null): number | null {
  return t != null && t <= BATTERY_SOC_MAX_TENTHS ? t / 10 : null;
}

function clampVoltage(mv: number | null): number | null {
  return mv != null && mv >= BATTERY_VOLTAGE_MIN_MV && mv <= BATTERY_VOLTAGE_MAX_MV ? mv : null;
}

function clampTemperature(t: number | null): number | null {
  return t != null && t >= BATTERY_TEMP_MIN_TENTHS && t <= BATTERY_TEMP_MAX_TENTHS ? t / 10 : null;
}

/** Parse a cmd-26 (GetBatteryLevel) command response — SOC percentage. */
export function parseBatteryLevel(packet: WhoopPacket): number | null {
  if (packet.command !== CommandNumber.GetBatteryLevel) return null;
  if (packet.data.length < 4) return null;
  const raw = readUint16LE(packet.data, 2);
  if (raw == null) return null;
  return raw / 10;
}

export interface BatteryLevelEvent {
  socPct: number | null;
  voltageMv: number | null;
}

/** Parse an event-3 (BatteryLevel) push — SOC + voltage. */
export function parseBatteryLevelEvent(packet: WhoopPacket): BatteryLevelEvent | null {
  if (packet.type !== PacketType.Event) return null;
  if (packet.command !== EventNumber.BatteryLevel) return null;
  if (packet.data.length < 16) return null;
  return {
    socPct: clampSocTenths(readUint16LE(packet.data, 10)),
    voltageMv: clampVoltage(readUint16LE(packet.data, 14)),
  };
}

export interface ExtendedBatteryEvent {
  voltageMv: number | null;
  temperatureC: number | null;
  iconLevel: number | null;
  socPct: number | null;
}

/** Parse an event-63 (ExtendedBatteryInformation) push — V/T/icon/SOC. */
export function parseExtendedBatteryEvent(packet: WhoopPacket): ExtendedBatteryEvent | null {
  if (packet.type !== PacketType.Event) return null;
  if (packet.command !== EventNumber.ExtendedBatteryInformation) return null;
  if (packet.data.length < 27) return null;
  const icon = packet.data[21];
  return {
    voltageMv: clampVoltage(readUint16LE(packet.data, 14)),
    temperatureC: clampTemperature(readUint16LE(packet.data, 16)),
    iconLevel: icon >= 0 && icon <= 7 ? icon : null,
    socPct: clampSocTenths(readUint16LE(packet.data, 25)),
  };
}
