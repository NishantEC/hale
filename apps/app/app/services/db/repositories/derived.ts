import { and, asc, eq, gte, lte } from "drizzle-orm"
import type { InferInsertModel } from "drizzle-orm"
import type { ActivityBoutDetail } from "../../api/viewModels"
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
    _localCreatedAt: Date.now(),
    _origin: "backend" as const,
  }
}

// Upserts device-computed rows into their mirror tables, stamped
// _origin='local'. The on-device pipeline writes here so its results
// accumulate as the device's own history (the cutover source of truth),
// kept distinct from backend-synced rows.
function localMirror() {
  return {
    _localCreatedAt: Date.now(),
    _origin: "local" as const,
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

export interface LocalNightFeatureRow {
  id: string
  nightDate: number
  restingHeartRate: number
  rmssd: number
  sdnn: number
  respiratoryRate: number
  continuity: number
  regularity: number
  validCoverage: number
  confidenceRaw: number
  sleepEstimateHours: number
  sourceBlend: string
  updatedAt: number
}

export interface LocalSleepDetectionRow {
  id: string
  nightDate: number
  bedtime: number
  wakeTime: number
  durationHours: number
  interruptionCount: number
  continuity: number
  regularity: number
  validCoverage: number
  confidence: number
  updatedAt: number
}

export async function upsertLocalNightFeatures(
  db: NoopDatabase,
  rows: LocalNightFeatureRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(nightFeatures)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          // Preserve _localCreatedAt from the original insert; refresh the
          // payload and keep the row local-origin.
          target: nightFeatures.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("night_features")
}

export async function upsertLocalSleepDetections(
  db: NoopDatabase,
  rows: LocalSleepDetectionRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(sleepDetections)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          target: sleepDetections.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("sleep_detections")
}

// Local-origin upserts for the remaining device-computed derived tables, so
// the full FullDayOutput can become the source of truth. Row types are
// derived from the schema (minus the mirror columns this layer stamps), so
// they stay in lockstep with the table definition without any `any`.
type MirrorKeys = "_origin" | "_localCreatedAt" | "userId"

export type LocalDailyMetricRow = Omit<InferInsertModel<typeof dailyMetrics>, MirrorKeys>
export type LocalDailyScoreRow = Omit<InferInsertModel<typeof dailyScores>, MirrorKeys>
export type LocalSleepStageRow = Omit<InferInsertModel<typeof sleepStages>, MirrorKeys>
export type LocalActivityDetectionRow = Omit<InferInsertModel<typeof activityDetections>, MirrorKeys>
export type LocalBaselineProfileRow = Omit<InferInsertModel<typeof baselineProfile>, MirrorKeys>

export async function upsertLocalDailyMetrics(
  db: NoopDatabase,
  rows: LocalDailyMetricRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(dailyMetrics)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          target: dailyMetrics.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("daily_metrics")
}

export async function upsertLocalDailyScores(
  db: NoopDatabase,
  rows: LocalDailyScoreRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(dailyScores)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          target: dailyScores.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("daily_scores")
}

export async function upsertLocalSleepStages(
  db: NoopDatabase,
  rows: LocalSleepStageRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(sleepStages)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          target: sleepStages.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("sleep_stages")
}

export async function upsertLocalActivityDetections(
  db: NoopDatabase,
  rows: LocalActivityDetectionRow[],
): Promise<void> {
  if (rows.length === 0) return
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    for (const row of rows) {
      await tx
        .insert(activityDetections)
        .values({ ...row, userId, ...mirror })
        .onConflictDoUpdate({
          target: activityDetections.id,
          set: { ...row, _origin: "local" as const },
        })
    }
  })
  notifyTable("activity_detections")
}

export async function upsertLocalBaselineProfile(
  db: NoopDatabase,
  row: LocalBaselineProfileRow,
): Promise<void> {
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    await tx
      .insert(baselineProfile)
      .values({ ...row, userId, ...mirror })
      .onConflictDoUpdate({
        target: baselineProfile.id,
        set: { ...row, _origin: "local" as const },
      })
  })
  notifyTable("baseline_profile")
}

export type LocalSleepPlanRow = Omit<InferInsertModel<typeof sleepPlans>, MirrorKeys>

export async function upsertLocalSleepPlan(
  db: NoopDatabase,
  row: LocalSleepPlanRow,
): Promise<void> {
  const userId = peekActiveUserId()
  if (!userId) return
  const mirror = localMirror()
  await withWrite(db, async (tx) => {
    await tx
      .insert(sleepPlans)
      .values({ ...row, userId, ...mirror })
      .onConflictDoUpdate({
        target: sleepPlans.id,
        set: { ...row, _origin: "local" as const },
      })
  })
  notifyTable("sleep_plans")
}

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

// Local read for the activity-bout detail screen. The on-device
// `activityDetections` table holds the bout summary but none of the
// server detail's heavy curves (hrCurve / zone splits / motion), so those
// map to empty arrays — the screen already guards every one of them. Epoch-ms
// columns become ISO strings to match the `ActivityBoutDetail` wire shape the
// screen renders. `intensity` / `source` are free-text columns whose values
// are produced by the same pipeline as the union members, narrowed here at the
// read boundary.
export async function getActivityBoutById(
  db: NoopDatabase,
  id: string,
): Promise<ActivityBoutDetail | null> {
  const userId = getActiveUserId()
  const rows = await db
    .select()
    .from(activityDetections)
    .where(and(eq(activityDetections.id, id), eq(activityDetections.userId, userId)))
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    durationMinutes: row.durationMinutes,
    activityType: row.activityType,
    intensity: row.intensity as ActivityBoutDetail["intensity"],
    source: row.source as ActivityBoutDetail["source"],
    confidence: row.confidence,
    heartRateAvg: row.heartRateAvg,
    heartRateMax: row.heartRateMax,
    strainScore: row.strainScore,
    hrCurve: [],
    zonePercents: [],
    zoneMinutes: [],
  }
}

// Local mutators for activity confirm/dismiss/delete. The detail screen and
// the pending-activity cards drive these in place of the now-dead backend
// endpoints. Both scope to the active user so a row can't be touched across
// accounts, and notify the activity_detections table so observers refresh.
export async function setActivityConfirmed(
  db: NoopDatabase,
  id: string,
  confirmedType?: string,
): Promise<void> {
  const userId = getActiveUserId()
  const set: { source: string; updatedAt: number; activityType?: string } = {
    source: "confirmed",
    updatedAt: Date.now(),
  }
  if (confirmedType !== undefined) set.activityType = confirmedType
  await withWrite(db, async (tx) => {
    await tx
      .update(activityDetections)
      .set(set)
      .where(and(eq(activityDetections.id, id), eq(activityDetections.userId, userId)))
  })
  notifyTable("activity_detections")
}

export async function deleteActivityDetection(db: NoopDatabase, id: string): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx
      .delete(activityDetections)
      .where(and(eq(activityDetections.id, id), eq(activityDetections.userId, userId)))
  })
  notifyTable("activity_detections")
}
