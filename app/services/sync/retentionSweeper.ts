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

  // raw_sensor_records / realtime_samples use `timestamp`
  for (const t of [rawSensorRecords, realtimeSamples]) {
    await db
      .delete(t)
      .where(
        and(
          eq((t as any).userId, userId),
          isNotNull((t as any)._syncedAt),
          lt((t as any).timestamp, cutoff),
        ),
      )
  }

  // device_events / console_logs use `capturedAt`
  for (const t of [deviceEvents, consoleLogs]) {
    await db
      .delete(t)
      .where(
        and(
          eq((t as any).userId, userId),
          isNotNull((t as any)._syncedAt),
          lt((t as any).capturedAt, cutoff),
        ),
      )
  }
}
