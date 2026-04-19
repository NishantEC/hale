import type { NoopDatabase } from "../db"
import { getLastSyncAt, setLastSyncAt } from "../db/repositories/syncState"
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
  apiGet: (path: string) => Promise<{ rows: any[]; hasMore: boolean }>
  tables: string[]
  pageSize?: number
}

// Pulls new rows from the backend since each table's lastSyncAt cursor.
// Advances the cursor to the max updatedAt of each page. Loops until the
// backend reports no more data for a table.

export async function pullDownlink(db: NoopDatabase, opts: PullOptions): Promise<void> {
  const pageSize = opts.pageSize ?? 1000
  for (const tableName of opts.tables) {
    const upserter = UPSERTERS[tableName]
    if (!upserter) continue
    let since = await getLastSyncAt(db, tableName)
    for (;;) {
      const path = `/sync/${tableName}?since=${since}&limit=${pageSize}`
      const { rows, hasMore } = await opts.apiGet(path)
      if (rows.length === 0) break
      await upserter(db, rows)
      const maxUpdatedAt = Math.max(...rows.map((r: any) => r.updatedAt ?? since))
      since = maxUpdatedAt
      await setLastSyncAt(db, tableName, since)
      if (!hasMore) break
    }
  }
}
