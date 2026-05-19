import { and, asc, eq, gte, lte } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { withWrite } from "../transaction"
import {
  dailyMetrics,
  dailyScores,
  sleepDetections,
  sleepStages,
  nightFeatures,
  signalSamples,
  activityDetections,
  baselineProfile,
  sleepPlans,
} from "../schema"
import { getActiveUserId, peekActiveUserId } from "../session"
import { notifyTable } from "../observable"

// Upserts backend-derived rows into their mirror tables. Always stamps
// _origin='backend' so the conflict policy (backend wins over local)
// is enforced uniformly.

function backendMirror() {
  return {
    _syncedAt: Date.now(),
    _localCreatedAt: Date.now(),
    _origin: "backend" as const,
  }
}

// The backend returns TypeORM entities where:
//   - Date columns (nightDate, updatedAt, etc.) are ISO strings → convert to epoch ms
//   - jsonb columns (epochTimeline) are parsed objects → stringify for TEXT storage
//   - undefined values → strip (ExpoSQLite cannot bind undefined)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        if (v instanceof Date) return [k, v.getTime()]
        if (typeof v === "string" && ISO_DATE_RE.test(v)) return [k, new Date(v).getTime()]
        if (v !== null && typeof v === "object") return [k, JSON.stringify(v)]
        return [k, v]
      }),
  )
}

async function upsertMany(
  db: NoopDatabase,
  table: any,
  tableName: string,
  rows: any[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = backendMirror()
  // One transaction for the whole page — pre-op-sqlite this was N
  // implicit transactions and a SQLITE_BUSY landmine; now it's also a
  // ~Nx speedup since we fsync once instead of N times.
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      const clean = normalizeRow(row)
      await tx
        .insert(table)
        .values({ ...clean, userId, ...mirror })
        .onConflictDoUpdate({
          target: table.id,
          set: { ...clean, ...mirror, _origin: "backend" },
        })
    }
  })
  notifyTable(tableName)
}

export const upsertDailyMetrics = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, dailyMetrics, "daily_metrics", rows)
export const upsertDailyScores = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, dailyScores, "daily_scores", rows)
export const upsertSleepDetections = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, sleepDetections, "sleep_detections", rows)
export const upsertSleepStages = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, sleepStages, "sleep_stages", rows)
export const upsertNightFeatures = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, nightFeatures, "night_features", rows)
export const upsertSignalSamples = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, signalSamples, "signal_samples", rows)
export const upsertActivityDetections = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, activityDetections, "activity_detections", rows)
export const upsertBaselineProfile = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, baselineProfile, "baseline_profile", rows)
export const upsertSleepPlans = (db: NoopDatabase, rows: any[]) =>
  upsertMany(db, sleepPlans, "sleep_plans", rows)

// Common read helpers used by screens

export async function listDailyMetricsByRange(
  db: NoopDatabase,
  fromDayDate: number,
  toDayDate: number,
) {
  const userId = getActiveUserId()
  return db
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.userId, userId),
        gte(dailyMetrics.dayDate, fromDayDate),
        lte(dailyMetrics.dayDate, toDayDate),
      ),
    )
    .orderBy(asc(dailyMetrics.dayDate))
}

export async function getSleepDetectionByNight(db: NoopDatabase, nightDate: number) {
  const userId = getActiveUserId()
  const rows = await db
    .select()
    .from(sleepDetections)
    .where(and(eq(sleepDetections.userId, userId), eq(sleepDetections.nightDate, nightDate)))
  return rows[0] ?? null
}

export async function getSleepStagesByNight(db: NoopDatabase, nightDate: number) {
  const userId = getActiveUserId()
  const rows = await db
    .select()
    .from(sleepStages)
    .where(and(eq(sleepStages.userId, userId), eq(sleepStages.nightDate, nightDate)))
  return rows[0] ?? null
}

export async function getBaselineProfile(db: NoopDatabase) {
  const userId = getActiveUserId()
  const rows = await db.select().from(baselineProfile).where(eq(baselineProfile.userId, userId))
  return rows[0] ?? null
}

export async function getSleepPlan(db: NoopDatabase) {
  const userId = getActiveUserId()
  const rows = await db.select().from(sleepPlans).where(eq(sleepPlans.userId, userId))
  return rows[0] ?? null
}
