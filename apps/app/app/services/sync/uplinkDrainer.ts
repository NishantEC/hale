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

export interface DrainLoopOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize?: number
  maxMs?: number
}

export async function drainLoop(
  db: NoopDatabase,
  opts: DrainLoopOptions,
): Promise<{ drained: number }> {
  const { post, batchSize = 200, maxMs } = opts
  const deadline = maxMs != null ? Date.now() + maxMs : Infinity

  // Backfill unsynced raw sensor records into the outbound queue before draining.
  try {
    const { backfillUnsyncedRawSensorRecords } = await import(
      "../db/repositories/rawSensorRecord"
    )
    await backfillUnsyncedRawSensorRecords(db, batchSize)
  } catch (err) {
    console.warn("[drainLoop] backfill failed", err)
  }

  let totalDrained = 0
  while (Date.now() < deadline) {
    const { queueDepth } = await import("../db/repositories/outboundQueue")
    const before = await queueDepth(db)
    if (before === 0) break
    await drainOnce(db, { post, batchSize })
    const after = await queueDepth(db)
    totalDrained += Math.max(0, before - after)
    if (after >= before) break
  }
  return { drained: totalDrained }
}
