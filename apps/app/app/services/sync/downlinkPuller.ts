import type { NoopDatabase } from "../db"
import { getSyncCursor, setLastSyncAt } from "../db/repositories/syncState"
import {
  upsertDailyMetrics,
  upsertDailyScores,
  upsertSleepDetections,
  upsertSleepStages,
  upsertNightFeatures,
  upsertSignalSamples,
  upsertActivityDetections,
  upsertBaselineProfile,
  upsertSleepPlans,
} from "../db/repositories/derived"

type Upserter = (db: NoopDatabase, rows: any[]) => Promise<void>

const UPSERTERS: Record<string, Upserter> = {
  daily_metrics: upsertDailyMetrics,
  daily_scores: upsertDailyScores,
  sleep_detections: upsertSleepDetections,
  sleep_stages: upsertSleepStages,
  night_features: upsertNightFeatures,
  signal_samples: upsertSignalSamples,
  activity_detections: upsertActivityDetections,
  baseline_profile: upsertBaselineProfile,
  sleep_plans: upsertSleepPlans,
}

export interface PullOptions {
  apiGet: (path: string) => Promise<{
    rows: any[]
    hasMore: boolean
    nextCursorAt?: number | null
    nextCursorId?: string | null
  }>
  tables: string[]
  pageSize?: number
}

// Pulls new rows from the backend since each table's keyset cursor
// (updatedAt, id). Server pages with (updatedAt > since) OR (updatedAt =
// since AND id > cursorId) so tied-updatedAt batches at the page
// boundary can't drop rows from the device mirror (codex adversarial
// review 2026-05-21, finding #2).

export async function pullDownlink(db: NoopDatabase, opts: PullOptions): Promise<void> {
  const pageSize = opts.pageSize ?? 1000
  for (const tableName of opts.tables) {
    const upserter = UPSERTERS[tableName]
    if (!upserter) continue
    let { lastSyncAt: since, lastSyncedRowId: cursorId } = await getSyncCursor(db, tableName)
    for (;;) {
      const params = new URLSearchParams()
      params.set("since", String(since))
      params.set("limit", String(pageSize))
      if (cursorId) params.set("cursorId", cursorId)
      const path = `/sync/${tableName}?${params.toString()}`
      const res = await opts.apiGet(path)
      const rows = res.rows
      if (rows.length === 0) break
      await upserter(db, rows)

      // Prefer the server-issued cursor when present. Old server builds
      // (pre-keyset) don't return one — fall back to max(updatedAt)
      // across rows so we still make forward progress.
      let nextAt = res.nextCursorAt ?? null
      let nextId = res.nextCursorId ?? null
      if (nextAt == null) {
        let maxUpdatedAt = since
        let tailId: string | null = null
        for (const r of rows) {
          const raw = (r as any).updatedAt
          const ts =
            typeof raw === "number"
              ? raw
              : raw
                ? new Date(raw).getTime()
                : NaN
          if (Number.isFinite(ts) && ts >= maxUpdatedAt) {
            maxUpdatedAt = ts
            tailId = typeof (r as any).id === "string" ? (r as any).id : tailId
          }
        }
        nextAt = maxUpdatedAt
        nextId = tailId
      }
      since = nextAt
      cursorId = nextId
      await setLastSyncAt(db, tableName, since, undefined, cursorId)
      if (!res.hasMore) break
    }
  }
}
