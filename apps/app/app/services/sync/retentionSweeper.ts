import { and, eq, lt, sql } from "drizzle-orm"
import type { NoopDatabase } from "../db"
import { withWrite } from "../db/transaction"
import { viewCache } from "../db/schema"
import { getActiveUserId } from "../db/session"

export interface SweepOptions {
  // View cache rows older than `viewCacheDays` are deleted. They get
  // refreshed on the next pull, so this is just a disk-usage guard.
  // Defaults to 30 days when omitted.
  viewCacheDays?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_VIEW_CACHE_DAYS = 30

// Trims the local view_cache and runs a SQLite WAL checkpoint so the
// -wal file doesn't accumulate indefinitely. Raw sensor data is kept on
// device indefinitely now that there is no backend to uplink to.

export async function sweepRetention(db: NoopDatabase, opts: SweepOptions = {}): Promise<void> {
  const userId = getActiveUserId()
  const viewCacheDays = opts.viewCacheDays ?? DEFAULT_VIEW_CACHE_DAYS
  const viewCacheCutoff = viewCacheDays > 0 ? Date.now() - viewCacheDays * MS_PER_DAY : null

  if (viewCacheCutoff != null) {
    await withWrite(db, async (tx) => {
      await tx
        .delete(viewCache)
        .where(
          and(
            eq(viewCache.userId, userId),
            lt(viewCache.updatedAt, viewCacheCutoff),
          ),
        )
    })
  }

  // WAL truncation. PASSIVE is non-blocking; op-sqlite also runs
  // wal_autocheckpoint in the background, so this is belt-and-suspenders.
  // Errors are non-fatal — the next sweep retries.
  try {
    await db.run(sql`PRAGMA wal_checkpoint(PASSIVE)`)
  } catch (err) {
    console.warn("[retention] wal_checkpoint failed", err)
  }
}
