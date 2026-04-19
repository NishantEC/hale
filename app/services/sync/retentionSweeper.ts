import { and, eq, isNotNull, lt } from "drizzle-orm"
import type { NoopDatabase } from "../db"
import { rawSensorRecords, realtimeSamples, deviceEvents, consoleLogs } from "../db/schema"
import { getActiveUserId } from "../db/session"

export interface SweepOptions {
  rawDays: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Deletes synced raw rows older than the configured retention window.
// Pending uplink rows (_syncedAt IS NULL) are preserved regardless of
// age so no data is lost before it reaches the backend.

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
}
