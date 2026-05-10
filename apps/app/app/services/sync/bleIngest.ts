import type { NoopDatabase } from "../db"
import {
  insertRawSensorRecord,
  RawSensorRecordInput,
} from "../db/repositories/rawSensorRecord"
import { enqueueOutbound } from "../db/repositories/outboundQueue"
import type { HistoricalRecord } from "../ble/packet-types"

// Map a decoded BLE HistoricalRecord to the SQLite RawSensorRecordInput shape.
// Deterministic id: seq+timestamp so replays dedupe in the outbound queue.
export function historicalRecordToRawRow(r: HistoricalRecord): RawSensorRecordInput {
  const ts = r.timestamp.getTime()
  const rrAvg =
    r.rrIntervals.length > 0
      ? r.rrIntervals.reduce((a, b) => a + b, 0) / r.rrIntervals.length
      : null
  const gravityMagnitude = Math.sqrt(r.gravityX ** 2 + r.gravityY ** 2 + r.gravityZ ** 2)
  return {
    id: `${r.sequenceNumber}-${ts}`,
    timestamp: ts,
    heartRate: r.heartRate,
    rrAverageMs: rrAvg,
    spo2Red: r.spo2Red ?? null,
    spo2IR: r.spo2IR ?? null,
    skinTempRaw: r.skinTempRaw ?? null,
    gravityMagnitude,
    gravityX: r.gravityX ?? null,
    gravityY: r.gravityY ?? null,
    gravityZ: r.gravityZ ?? null,
    respRateRaw: r.respRateRaw ?? null,
    skinContact: r.skinContact ? 1 : 0,
    ppgGreen: r.ppgGreen ?? null,
    ppgRedIr: r.ppgRedIr ?? null,
    ambientLight: r.ambientLight ?? null,
    ledDrive1: r.ledDrive1 ?? null,
    ledDrive2: r.ledDrive2 ?? null,
    signalQuality: r.signalQuality ?? null,
  }
}

// Write-local-first BLE ingest: the raw record lands in SQLite immediately
// and an uplink is queued for the drainer. Use this in place of any direct
// POST of decoded BLE records to the backend.

export async function ingestBleRecord(
  db: NoopDatabase,
  record: RawSensorRecordInput,
): Promise<void> {
  await insertRawSensorRecord(db, record)
  await enqueueOutbound(db, {
    tableName: "raw_sensor_records",
    rowId: record.id,
    payload: record,
  })
}

export async function ingestBleRecords(
  db: NoopDatabase,
  records: RawSensorRecordInput[],
): Promise<{ ok: number; failed: number }> {
  // Per-record try/catch so one bad row doesn't kill the entire batch.
  // Returns counts so the caller can surface partial failure visibly.
  let ok = 0
  let failed = 0
  for (const r of records) {
    try {
      await ingestBleRecord(db, r)
      ok++
    } catch (err) {
      failed++
      console.warn(
        "[ingestBleRecord] failed",
        r.id,
        err instanceof Error ? err.message : err,
      )
    }
  }
  if (failed > 0) {
    console.warn(
      `[ingestBleRecords] ${failed}/${records.length} records failed to persist`,
    )
  }
  return { ok, failed }
}
