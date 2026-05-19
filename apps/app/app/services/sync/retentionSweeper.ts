import { and, eq, isNotNull, lt, sql } from "drizzle-orm"
import type { NoopDatabase } from "../db"
import { withWrite } from "../db/transaction"
import {
  consoleLogs,
  deviceEvents,
  rawSensorRecords,
  realtimeSamples,
  viewCache,
} from "../db/schema"
import { getActiveUserId } from "../db/session"

export interface SweepOptions {
  rawDays: number
  // View cache rows older than `viewCacheDays` are deleted. They get
  // refreshed on the next pull, so this is just a disk-usage guard.
  // Defaults to 30 days when omitted.
  viewCacheDays?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_VIEW_CACHE_DAYS = 30

// Deletes synced raw rows older than the configured retention window.
// Pending uplink rows (_syncedAt IS NULL) are preserved regardless of
// age so no data is lost before it reaches the backend. Also trims the
// local view_cache and runs a SQLite WAL checkpoint so the -wal file
// doesn't accumulate indefinitely.

export async function sweepRetention(db: NoopDatabase, opts: SweepOptions): Promise<void> {
  const userId = getActiveUserId()
  if (opts.rawDays <= 0) return // 0 or negative = keep forever
  const cutoff = Date.now() - opts.rawDays * MS_PER_DAY
  const viewCacheDays = opts.viewCacheDays ?? DEFAULT_VIEW_CACHE_DAYS
  const viewCacheCutoff = viewCacheDays > 0 ? Date.now() - viewCacheDays * MS_PER_DAY : null

  // All deletes in ONE atomic writer turn.
  await withWrite(db, async (tx) => {
    await tx
      .delete(rawSensorRecords)
      .where(
        and(
          eq(rawSensorRecords.userId, userId),
          isNotNull(rawSensorRecords._syncedAt),
          lt(rawSensorRecords.timestamp, cutoff),
        ),
      )

    await tx
      .delete(realtimeSamples)
      .where(
        and(
          eq(realtimeSamples.userId, userId),
          isNotNull(realtimeSamples._syncedAt),
          lt(realtimeSamples.capturedAt, cutoff),
        ),
      )

    await tx
      .delete(deviceEvents)
      .where(
        and(
          eq(deviceEvents.userId, userId),
          isNotNull(deviceEvents._syncedAt),
          lt(deviceEvents.capturedAt, cutoff),
        ),
      )

    await tx
      .delete(consoleLogs)
      .where(
        and(
          eq(consoleLogs.userId, userId),
          isNotNull(consoleLogs._syncedAt),
          lt(consoleLogs.capturedAt, cutoff),
        ),
      )

    if (viewCacheCutoff != null) {
      await tx
        .delete(viewCache)
        .where(
          and(
            eq(viewCache.userId, userId),
            lt(viewCache.updatedAt, viewCacheCutoff),
          ),
        )
    }
  })

  // WAL truncation. PASSIVE is non-blocking; op-sqlite also runs
  // wal_autocheckpoint in the background, so this is belt-and-suspenders.
  // Errors are non-fatal — the next sweep retries.
  try {
    await db.run(sql`PRAGMA wal_checkpoint(PASSIVE)`)
  } catch (err) {
    console.warn("[retention] wal_checkpoint failed", err)
  }
}
