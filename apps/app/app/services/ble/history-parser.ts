import { HistoricalRecord, PacketType, WhoopPacket } from './packet-types';

const MIN_V12V24_SIZE = 77;

/**
 * Parse a single V12V24 historical sensor record from binary data.
 *
 * Binary layout (77+ bytes):
 * Offset 0-3:   sequenceNumber (Uint32LE)
 * Offset 4-7:   unix timestamp seconds (Uint32LE)
 * Offset 8-9:   subseconds (Uint16LE)
 * Offset 14:    heartRate (Uint8)
 * Offset 15:    rrCount (Uint8, 0-4)
 * Offset 16-17: rr[0] (Uint16LE, milliseconds)
 * Offset 18-19: rr[1] (Uint16LE)
 * Offset 20-21: rr[2] (Uint16LE)
 * Offset 22-23: rr[3] (Uint16LE)
 * Offset 33-36: gravityX (Float32LE, m/s²)
 * Offset 37-40: gravityY (Float32LE)
 * Offset 41-44: gravityZ (Float32LE)
 * Offset 48:    skinContact (Uint8, non-zero = worn)
 * Offset 61-62: spo2Red (Uint16LE)
 * Offset 63-64: spo2IR (Uint16LE)
 * Offset 65-66: skinTempRaw (Uint16LE)
 * Offset 73-74: respRateRaw (Uint16LE)
 */
export function parseHistoricalRecord(
  data: Uint8Array,
  offset: number = 0,
): HistoricalRecord | null {
  if (data.length - offset < MIN_V12V24_SIZE) return null;

  const view = new DataView(data.buffer, data.byteOffset + offset, Math.min(data.length - offset, 256));

  const sequenceNumber = view.getUint32(0, true);
  const unixSeconds = view.getUint32(4, true);
  const subseconds = view.getUint16(8, true);

  // Validate timestamp (between 2020 and 2030)
  if (unixSeconds < 1577836800 || unixSeconds > 1893456000) return null;

  const timestamp = new Date(unixSeconds * 1000 + Math.floor(subseconds / 65536 * 1000));
  const heartRate = view.getUint8(14);
  const rrCount = Math.min(view.getUint8(15), 4);

  const rrIntervals: number[] = [];
  for (let i = 0; i < rrCount; i++) {
    const rr = view.getUint16(16 + i * 2, true);
    if (rr > 0 && rr < 3000) { // Valid RR range: 0-3000ms
      rrIntervals.push(rr);
    }
  }

  const gravityX = view.getFloat32(33, true);
  const gravityY = view.getFloat32(37, true);
  const gravityZ = view.getFloat32(41, true);
  const skinContact = view.getUint8(48) !== 0;
  const spo2Red = view.getUint16(61, true);
  const spo2IR = view.getUint16(63, true);
  const skinTempRaw = view.getUint16(65, true);
  const respRateRaw = view.getUint16(73, true);
  const ppgGreen = view.getUint16(26, true);
  const ppgRedIr = view.getUint16(28, true);
  const ambientLight = view.getUint16(67, true);
  const ledDrive1 = view.getUint16(69, true);
  const ledDrive2 = view.getUint16(71, true);
  const signalQuality = view.getUint16(75, true);

  return {
    sequenceNumber,
    timestamp,
    subseconds,
    heartRate,
    rrIntervals,
    gravityX,
    gravityY,
    gravityZ,
    skinContact,
    spo2Red,
    spo2IR,
    skinTempRaw,
    respRateRaw,
    ppgGreen,
    ppgRedIr,
    ambientLight,
    ledDrive1,
    ledDrive2,
    signalQuality,
  };
}

const GENERIC_RECORD_SIZE = 24;

function parseV12V24Record(data: Uint8Array, offset: number): HistoricalRecord | null {
  if (data.length - offset < MIN_V12V24_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset + offset, MIN_V12V24_SIZE);
  const unixSeconds = view.getUint32(4, true);
  if (unixSeconds < 1577836800 || unixSeconds > 1893456000) return null;
  const subseconds = view.getUint16(8, true);
  const rrCount = Math.min(view.getUint8(15), 4);
  const rrIntervals: number[] = [];
  for (let i = 0; i < rrCount; i++) {
    const rr = view.getUint16(16 + i * 2, true);
    if (rr > 0 && rr < 3000) rrIntervals.push(rr);
  }
  return {
    sequenceNumber: view.getUint32(0, true),
    timestamp: new Date(unixSeconds * 1000 + Math.floor((subseconds / 65536) * 1000)),
    subseconds,
    heartRate: view.getUint8(14),
    rrIntervals,
    gravityX: view.getFloat32(33, true),
    gravityY: view.getFloat32(37, true),
    gravityZ: view.getFloat32(41, true),
    skinContact: view.getUint8(48) !== 0,
    spo2Red: view.getUint16(61, true),
    spo2IR: view.getUint16(63, true),
    skinTempRaw: view.getUint16(65, true),
    respRateRaw: view.getUint16(73, true),
    ppgGreen: view.getUint16(26, true),
    ppgRedIr: view.getUint16(28, true),
    ambientLight: view.getUint16(67, true),
    ledDrive1: view.getUint16(69, true),
    ledDrive2: view.getUint16(71, true),
    signalQuality: view.getUint16(75, true),
  };
}

function parseGenericRecord(data: Uint8Array, offset: number): HistoricalRecord | null {
  if (data.length - offset < GENERIC_RECORD_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset + offset, GENERIC_RECORD_SIZE);
  const unixSeconds = view.getUint32(4, true);
  if (unixSeconds < 1577836800 || unixSeconds > 1893456000) return null;
  const subseconds = view.getUint16(8, true);
  const rrCount = Math.min(view.getUint8(15), 4);
  const rrIntervals: number[] = [];
  for (let i = 0; i < rrCount; i++) {
    const rr = view.getUint16(16 + i * 2, true);
    if (rr > 0 && rr < 3000) rrIntervals.push(rr);
  }
  // Generic packets carry only HR + RR. Sensor fields are explicitly null
  // so downstream upserts can fill them in from a paired V12/V24 packet
  // for the same timestamp without overwriting real readings with zeros.
  return {
    sequenceNumber: view.getUint32(0, true),
    timestamp: new Date(unixSeconds * 1000 + Math.floor((subseconds / 65536) * 1000)),
    subseconds,
    heartRate: view.getUint8(14),
    rrIntervals,
    gravityX: null,
    gravityY: null,
    gravityZ: null,
    skinContact: null,
    spo2Red: null,
    spo2IR: null,
    skinTempRaw: null,
    respRateRaw: null,
    ppgGreen: null,
    ppgRedIr: null,
    ambientLight: null,
    ledDrive1: null,
    ledDrive2: null,
    signalQuality: null,
  };
}

// Each HistoricalData BLE packet decodes to exactly ONE sensor reading
// — matches the openWhoop-2 reference (decoder.py:164 decode_historical
// returns a single HistoryReading, not a list). The packet's 1917+
// bytes of tail data aren't a concatenation of records; they're the
// packet's framed sensor fields plus padding.
//
// An earlier iteration of this file walked the buffer at a fixed stride
// and emitted "ghost" records whenever the offset 4 bytes happened to
// look like a 2020–2030 unix timestamp. That inflated counts but
// corrupted every trailing record with garbage offsets.
export function parseHistoricalPacketBatch(packet: WhoopPacket): HistoricalRecord[] {
  if (packet.type !== PacketType.HistoricalData) return [];
  const data = new Uint8Array(packet.data);
  const isV12V24 = packet.sequence === 12 || packet.sequence === 24;
  const rec = isV12V24
    ? parseV12V24Record(data, 0)
    : parseGenericRecord(data, 0);
  return rec ? [rec] : [];
}

export function parseHistoricalPacket(packet: WhoopPacket): HistoricalRecord | null {
  const batch = parseHistoricalPacketBatch(packet);
  return batch.length > 0 ? batch[0] : null;
}

/**
 * Parse a batch of consecutive V12V24 records from a binary buffer.
 */
export function parseHistoricalBatch(
  data: Uint8Array,
  recordSize: number = MIN_V12V24_SIZE,
): HistoricalRecord[] {
  const records: HistoricalRecord[] = [];
  let offset = 0;

  while (offset + recordSize <= data.length) {
    const record = parseHistoricalRecord(data, offset);
    if (record) {
      records.push(record);
    }
    offset += recordSize;
  }

  return records;
}
