import { inArray } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { withWrite, type WriteTx } from "../transaction"
import {
  consoleLogs,
  deviceEvents,
  journalEntries,
  outboundQueue,
  rawSensorRecords,
  realtimeSamples,
} from "../schema"

const MIRROR_TABLES = {
  raw_sensor_records: rawSensorRecords,
  realtime_samples: realtimeSamples,
  device_events: deviceEvents,
  console_logs: consoleLogs,
  journal_entries: journalEntries,
} as const

export type MirroredTableName = keyof typeof MIRROR_TABLES

export function isMirroredTable(tableName: string): tableName is MirroredTableName {
  return tableName in MIRROR_TABLES
}

const CHUNK = 500

// Single-tx delete from outbound_queue + set _syncedAt on the mirror row.
// Before this helper, the two writes lived in separate transactions — a
// failure between them stranded mirror rows with _syncedAt=null forever,
// causing backfill to perpetually re-POST and retention to never sweep
// them. Journal-entry tombstones have no mirror row to update; the
// update-where-id-matches is naturally a no-op on the deleted row.
export async function markUploadedTx(
  tx: WriteTx,
  tableName: string,
  queueIds: string[],
  rowIds: string[],
  syncedAt: number,
): Promise<void> {
  if (queueIds.length > 0) {
    for (let i = 0; i < queueIds.length; i += CHUNK) {
      const slice = queueIds.slice(i, i + CHUNK)
      await tx.delete(outboundQueue).where(inArray(outboundQueue.id, slice))
    }
  }
  if (!isMirroredTable(tableName) || rowIds.length === 0) return
  const table = MIRROR_TABLES[tableName]
  for (let i = 0; i < rowIds.length; i += CHUNK) {
    const slice = rowIds.slice(i, i + CHUNK)
    await tx
      .update(table)
      .set({ _syncedAt: syncedAt })
      .where(inArray(table.id, slice))
  }
}

export async function markUploaded(
  db: NoopDatabase,
  tableName: string,
  queueIds: string[],
  rowIds: string[],
  syncedAt: number,
): Promise<void> {
  if (queueIds.length === 0 && rowIds.length === 0) return
  await withWrite(db, async (tx) => {
    await markUploadedTx(tx, tableName, queueIds, rowIds, syncedAt)
  })
}
