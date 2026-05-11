import type { NoopDatabase } from "../db"
import {
  claimOutboundBatch,
  markOutboundSynced,
  recordOutboundFailure,
} from "../db/repositories/outboundQueue"
import { markRawSensorRecordsSynced } from "../db/repositories/rawSensorRecord"

export interface DrainOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize: number
}

export async function drainOnce(db: NoopDatabase, opts: DrainOptions): Promise<void> {
  const batch = await claimOutboundBatch(db, opts.batchSize)
  if (batch.length === 0) return

  // Group by tableName so each POST carries a single-table bulk payload.
  const groups = new Map<string, typeof batch>()
  for (const row of batch) {
    const list = groups.get(row.tableName) ?? []
    list.push(row)
    groups.set(row.tableName, list)
  }

  for (const [tableName, rows] of groups) {
    const payloads = rows.map((r) => r.payload)
    try {
      await opts.post(tableName, payloads)
      await markOutboundSynced(
        db,
        rows.map((r) => r.id),
      )
      // Mirror the queue's "synced" state onto the originating table
      // for tables that track _syncedAt locally. Keeps the backfill
      // helper from re-enqueueing rows that already shipped.
      if (tableName === "raw_sensor_records") {
        await markRawSensorRecordsSynced(
          db,
          rows.map((r) => r.rowId),
          Date.now(),
        )
      }
    } catch (err: any) {
      for (const r of rows) {
        await recordOutboundFailure(db, r.id, err?.message ?? "unknown error")
      }
    }
  }
}
