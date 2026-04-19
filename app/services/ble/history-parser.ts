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
  return {
    sequenceNumber: view.getUint32(0, true),
    timestamp: new Date(unixSeconds * 1000 + Math.floor((subseconds / 65536) * 1000)),
    subseconds,
    heartRate: view.getUint8(14),
    rrIntervals,
    gravityX: 0,
    gravityY: 0,
    gravityZ: 0,
    skinContact: false,
    spo2Red: 0,
    spo2IR: 0,
    skinTempRaw: 0,
    respRateRaw: 0,
    ppgGreen: 0,
    ppgRedIr: 0,
    ambientLight: 0,
    ledDrive1: 0,
    ledDrive2: 0,
    signalQuality: 0,
  };
}

// Parses ALL records contained in a single HistoricalData packet. Each
// packet from the strap holds 1+ records packed back-to-back:
//   seq ∈ {12, 24} → 77-byte V12/V24 full-sensor records
//   seq otherwise  → 24-byte V7/V9/V18 generic (HR+RR only) records
// The old implementation returned one record per packet, dropping the
// rest of the buffer. For a 1917-byte generic packet that's ~79→1.
export function parseHistoricalPacketBatch(packet: WhoopPacket): HistoricalRecord[] {
  if (packet.type !== PacketType.HistoricalData) return [];
  const data = new Uint8Array(packet.data);
  const isV12V24 = packet.sequence === 12 || packet.sequence === 24;
  const stride = isV12V24 ? MIN_V12V24_SIZE : GENERIC_RECORD_SIZE;
  const parse = isV12V24 ? parseV12V24Record : parseGenericRecord;
  const out: HistoricalRecord[] = [];
  let offset = 0;
  while (offset + stride <= data.length) {
    const rec = parse(data, offset);
    if (rec) out.push(rec);
    offset += stride;
  }
  return out;
}

// Back-compat single-record entry point (deprecated — returns first record only).
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
