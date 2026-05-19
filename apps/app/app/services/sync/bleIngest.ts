import type { NoopDatabase } from "../db"
import { withWrite } from "../db/transaction"
import {
  insertRawSensorRecord,
  insertRawSensorRecordTx,
  RawSensorRecordInput,
} from "../db/repositories/rawSensorRecord"
import { notifyTable } from "../db/observable"
import { peekActiveUserId } from "../db/session"
import type { HistoricalRecord } from "../ble/packet-types"

// Map a decoded BLE HistoricalRecord to the SQLite RawSensorRecordInput shape.
//
// ID is timestamp-only — the strap emits multiple packet formats per sample
// (V12/V24 full sensor + generic HR-only) with different sequence numbers.
// Including seq in the ID would make every format land as a separate row,
// which is what produced the 3-6-rows-per-timestamp corruption pattern.
// With ts-only IDs, the upsert in insertRawSensorRecord merges them.
//
// Heart-rate validity: WHOOP occasionally sends a packet whose byte 14 is
// not actually HR (some kind of metadata/status frame the spec calls
// "generic" but which doesn't follow generic layout either). Those land as
// HR=6 / HR=10 etc. We treat anything outside 30–250 bpm as missing so
// merges don't overwrite a valid HR with junk.
export function historicalRecordToRawRow(r: HistoricalRecord): RawSensorRecordInput {
  const ts = r.timestamp.getTime()
  const rrAvg =
    r.rrIntervals.length > 0
      ? r.rrIntervals.reduce((a, b) => a + b, 0) / r.rrIntervals.length
      : null
  const hasGravity =
    r.gravityX != null && r.gravityY != null && r.gravityZ != null
  const gravityMagnitude = hasGravity
    ? Math.sqrt(r.gravityX! ** 2 + r.gravityY! ** 2 + r.gravityZ! ** 2)
    : null
  const heartRate = r.heartRate >= 30 && r.heartRate <= 250 ? r.heartRate : 0
  return {
    id: `ts-${ts}`,
    timestamp: ts,
    heartRate,
    rrAverageMs: rrAvg,
    spo2Red: r.spo2Red,
    spo2IR: r.spo2IR,
    skinTempRaw: r.skinTempRaw,
    gravityMagnitude,
    gravityX: r.gravityX,
    gravityY: r.gravityY,
    gravityZ: r.gravityZ,
    respRateRaw: r.respRateRaw,
    skinContact: r.skinContact == null ? null : r.skinContact ? 1 : 0,
    ppgGreen: r.ppgGreen,
    ppgRedIr: r.ppgRedIr,
    ambientLight: r.ambientLight,
    ledDrive1: r.ledDrive1,
    ledDrive2: r.ledDrive2,
    signalQuality: r.signalQuality,
  }
}

// Write-local-first BLE ingest: the raw record lands in SQLite immediately
// and an uplink is queued for the drainer. Use this in place of any direct
// POST of decoded BLE records to the backend.

export async function ingestBleRecord(
  db: NoopDatabase,
  record: RawSensorRecordInput,
): Promise<void> {
  if (!peekActiveUserId()) return
  // insertRawSensorRecord internally enqueues the outbound row inside the
  // same SQLite transaction, so a crash between the two writes can't leave
  // a row visible without an upload entry.
  await insertRawSensorRecord(db, record)
}

// Batch ingest: wraps the entire set of inserts in ONE SQLite transaction
// and fires notifyTable exactly once at the end. The previous per-record
// transaction + per-record notify pattern was deadlocking subscribers'
// async refetches against the next iteration's COMMIT, producing the
// `cannot commit transaction - SQL statements in progress` failure on
// every record after the first.
export async function ingestBleRecords(
  db: NoopDatabase,
  records: RawSensorRecordInput[],
): Promise<{ ok: number; failed: number }> {
  const userId = peekActiveUserId()
  if (!userId) return { ok: 0, failed: 0 }
  if (records.length === 0) return { ok: 0, failed: 0 }
  try {
    await withWrite(db, async (tx) => {
      for (const r of records) {
        await insertRawSensorRecordTx(tx, r, userId)
      }
    })
    notifyTable("raw_sensor_records")
    return { ok: records.length, failed: 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[ingestBleRecords] batch of ${records.length} failed to persist:`,
      msg,
    )
    return { ok: 0, failed: records.length }
  }
}
