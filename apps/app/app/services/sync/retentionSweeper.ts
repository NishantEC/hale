import { and, eq, isNotNull, lt, sql } from "drizzle-orm"
import type { NoopDatabase } from "../db"
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

  await db
    .delete(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        isNotNull(rawSensorRecords._syncedAt),
        lt(rawSensorRecords.timestamp, cutoff),
      ),
    )

  await db
    .delete(realtimeSamples)
    .where(
      and(
        eq(realtimeSamples.userId, userId),
        isNotNull(realtimeSamples._syncedAt),
        lt(realtimeSamples.capturedAt, cutoff),
      ),
    )

  await db
    .delete(deviceEvents)
    .where(
      and(
        eq(deviceEvents.userId, userId),
        isNotNull(deviceEvents._syncedAt),
        lt(deviceEvents.capturedAt, cutoff),
      ),
    )

  await db
    .delete(consoleLogs)
    .where(
      and(
        eq(consoleLogs.userId, userId),
        isNotNull(consoleLogs._syncedAt),
        lt(consoleLogs.capturedAt, cutoff),
      ),
    )

  const viewCacheDays = opts.viewCacheDays ?? DEFAULT_VIEW_CACHE_DAYS
  if (viewCacheDays > 0) {
    const viewCacheCutoff = Date.now() - viewCacheDays * MS_PER_DAY
    await db
      .delete(viewCache)
      .where(
        and(
          eq(viewCache.userId, userId),
          lt(viewCache.updatedAt, viewCacheCutoff),
        ),
      )
  }

  // WAL truncation. Without this, the -wal file grows monotonically and
  // doubles the on-disk footprint after a month of continuous use.
  // PASSIVE first (cheap, non-blocking); fall through to TRUNCATE if a
  // checkpoint is overdue. Errors are non-fatal — the next sweep retries.
  try {
    await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`)
  } catch (err) {
    console.warn("[retention] wal_checkpoint failed", err)
  }
}
