/**
 * IMU packet parser for WHOOP strap.
 *
 * Parses PacketType 51 (RealtimeIMUStream) and 52 (HistoricalIMUStream).
 * Each packet contains 100 samples of 6-axis data (accel + gyro).
 *
 * NOTE: IMU data uses BIG-ENDIAN i16, unlike the rest of the protocol.
 *
 * Layout (1188+ bytes):
 *   [0:4]     u32 LE   sequence
 *   [4:8]     u32 LE   unix timestamp (seconds)
 *   [8:10]    u16 LE   subseconds
 *   [10:85]   reserved
 *   [85:285]  i16 BE × 100  Accel X (÷1875 → g)
 *   [285:485] i16 BE × 100  Accel Y
 *   [485:685] i16 BE × 100  Accel Z
 *   [688:888] i16 BE × 100  Gyro X (÷15 → dps)
 *   [888:1088] i16 BE × 100 Gyro Y
 *   [1088:1288] i16 BE × 100 Gyro Z
 */

import { PacketType, WhoopPacket } from './packet-types';

export interface IMUSample {
  timestamp: Date;
  accelX: number; // g
  accelY: number; // g
  accelZ: number; // g
  gyroX: number;  // degrees/sec
  gyroY: number;  // degrees/sec
  gyroZ: number;  // degrees/sec
}

const MIN_IMU_SIZE = 1188;
const SAMPLE_COUNT = 100;
const ACCEL_SENSITIVITY = 1875.0;
const GYRO_SENSITIVITY = 15.0;

const ACCEL_X_OFFSET = 85;
const ACCEL_Y_OFFSET = 285;
const ACCEL_Z_OFFSET = 485;
const GYRO_X_OFFSET = 688;
const GYRO_Y_OFFSET = 888;
const GYRO_Z_OFFSET = 1088;

export function parseIMUPacket(packet: WhoopPacket): IMUSample[] | null {
  if (
    packet.type !== PacketType.RealtimeIMUStream &&
    packet.type !== PacketType.HistoricalIMUStream
  ) {
    return null;
  }

  const data = packet.data;
  if (data.length < MIN_IMU_SIZE) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.length);

  const unixSeconds = view.getUint32(4, true); // LE
  const subseconds = view.getUint16(8, true);  // LE
  const baseTimestamp = new Date(
    unixSeconds * 1000 + Math.floor((subseconds / 65536) * 1000),
  );

  // ~52 Hz → ~19.2ms per sample
  const sampleIntervalMs = 1000 / 52;
  const samples: IMUSample[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const accelX = view.getInt16(ACCEL_X_OFFSET + i * 2, false) / ACCEL_SENSITIVITY; // BE
    const accelY = view.getInt16(ACCEL_Y_OFFSET + i * 2, false) / ACCEL_SENSITIVITY;
    const accelZ = view.getInt16(ACCEL_Z_OFFSET + i * 2, false) / ACCEL_SENSITIVITY;
    const gyroX = view.getInt16(GYRO_X_OFFSET + i * 2, false) / GYRO_SENSITIVITY;
    const gyroY = view.getInt16(GYRO_Y_OFFSET + i * 2, false) / GYRO_SENSITIVITY;
    const gyroZ = view.getInt16(GYRO_Z_OFFSET + i * 2, false) / GYRO_SENSITIVITY;

    samples.push({
      timestamp: new Date(baseTimestamp.getTime() + i * sampleIntervalMs),
      accelX,
      accelY,
      accelZ,
      gyroX,
      gyroY,
      gyroZ,
    });
  }

  return samples;
}
