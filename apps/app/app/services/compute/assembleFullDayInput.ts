import { and, asc, eq, gte, lt, lte } from "drizzle-orm"

import type { NoopDatabase } from "../db"
import { deviceEvents, nightFeatures, rawSensorRecords, sleepDetections } from "../db/schema"

// ──────────────────────────────────────────────────────────────────
// TS mirrors of the Rust serde DTOs (apps/compute-engine).
//   - types.rs        SignalSampleV1, HistoricalSensorRecordV1
//   - full_pipeline.rs DeviceEventV1, FullDayInput
// Every struct is `#[serde(rename_all = "camelCase")]`, so the wire keys
// are camelCase. Timestamps are `DateTime<Utc>` → chrono's default serde
// is RFC3339 ISO strings (e.g. "2026-06-03T12:00:00.000Z"), NOT epoch ms.
// The one explicit rename is HistoricalSensorRecordV1.spo2_ir → "spo2IR".
// ──────────────────────────────────────────────────────────────────

export interface SignalSampleV1 {
  /** RFC3339 UTC string */
  timestamp: string
  heartRate: number
  ibiMs: number | null
  source: string
  motionScore: number | null
  qualityScore: number
}

export interface HistoricalSensorRecordV1 {
  /** RFC3339 UTC string */
  timestamp: string
  heartRate: number
  rrAverageMs: number | null
  spo2Red: number | null
  spo2IR: number | null
  skinTempRaw: number | null
  gravityMagnitude: number | null
  gravityX: number | null
  gravityY: number | null
  gravityZ: number | null
  respRateRaw: number | null
  skinContact: boolean | null
  ppgGreen: number | null
  ppgRedIr: number | null
  ambientLight: number | null
  ledDrive1: number | null
  ledDrive2: number | null
  signalQuality: number | null
}

export interface DeviceEventV1 {
  eventNumber: number
  /** RFC3339 UTC string */
  capturedAt: string
}

export interface NightFeatureSetV1 {
  /** RFC3339 UTC string */
  nightDate: string
  restingHeartRate: number
  rmssd: number
  sdnn: number
  pnn50: number
  respiratoryRate: number
  continuity: number
  regularity: number
  validCoverage: number
  confidenceRaw: number
  sleepEstimateHours: number
  sourceBlend: string
}

export interface SleepDetectionSummaryV1 {
  /** RFC3339 UTC string */
  nightDate: string
  /** RFC3339 UTC string */
  bedtime: string
  /** RFC3339 UTC string */
  wakeTime: string
  durationHours: number
  interruptionCount: number
  continuity: number
  regularity: number
  validCoverage: number
  confidence: number
}

export interface FullDayInput {
  samples: SignalSampleV1[]
  sensorRecords: HistoricalSensorRecordV1[]
  deviceEvents: DeviceEventV1[]
  priorNightFeatures: NightFeatureSetV1[]
  priorSleepDetections: SleepDetectionSummaryV1[]
  /** "YYYY-MM-DD" */
  referenceDate: string
  timeZone: string
}

const DAY_MS = 86_400_000

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * Collapse rows that share a calendar night (UTC) to a single entry, keeping
 * the freshest by `updatedAt`. The local night_features / sleep_detections
 * tables key on `id` (not night_date), so re-syncs and re-computations leave
 * multiple rows per night; feeding them all double-counts the 7-day rolling
 * `detected_sleep_nights` and skews the baseline history.
 */
function dedupeByNight<T extends { nightDate: number; updatedAt: number }>(rows: T[]): T[] {
  const byDay = new Map<number, T>()
  for (const r of rows) {
    const dayKey = Math.floor(r.nightDate / DAY_MS)
    const prev = byDay.get(dayKey)
    if (prev === undefined || r.updatedAt > prev.updatedAt) byDay.set(dayKey, r)
  }
  return [...byDay.values()].sort((a, b) => a.nightDate - b.nightDate)
}

/**
 * Build a `FullDayInput` for the on-device Rust pipeline from local DB rows.
 *
 * Queries the trailing `windowDays` window — [referenceDate 00:00 UTC −
 * windowDays, end of referenceDate UTC] — so the baseline has enough
 * history, filtered to `userId`. Local epoch-ms timestamps are encoded as
 * RFC3339 UTC strings to match the Rust `DateTime<Utc>` serde.
 */
export async function assembleFullDayInput(
  db: NoopDatabase,
  userId: string,
  referenceDate: string,
  timeZone: string,
  windowDays = 60,
): Promise<FullDayInput> {
  const refStartMs = Date.parse(`${referenceDate}T00:00:00.000Z`)
  // Raw + signal samples: only the reference day + prior night/day are needed
  // for this day's stages. The full 60-day history is NOT loaded as raw (that
  // exceeds the JS string limit) — the baseline's history is supplied as
  // pre-computed priorNightFeatures instead.
  const RAW_LOOKBACK_DAYS = 2
  const windowStartMs = refStartMs - RAW_LOOKBACK_DAYS * DAY_MS
  const historyStartMs = refStartMs - windowDays * DAY_MS
  const windowEndMs = refStartMs + DAY_MS - 1

  const rawRows = await db
    .select()
    .from(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        gte(rawSensorRecords.timestamp, windowStartMs),
        lte(rawSensorRecords.timestamp, windowEndMs),
      ),
    )
    .orderBy(asc(rawSensorRecords.timestamp))

  const eventRows = await db
    .select()
    .from(deviceEvents)
    .where(
      and(
        eq(deviceEvents.userId, userId),
        gte(deviceEvents.capturedAt, windowStartMs),
        lte(deviceEvents.capturedAt, windowEndMs),
      ),
    )
    .orderBy(asc(deviceEvents.capturedAt))

  // Trailing night-features history feeding the baseline. The reference day's
  // own night-feature is recomputed from raw, so take strictly prior nights.
  // Tiny payload (~60 small rows).
  const nightFeatureRows = await db
    .select()
    .from(nightFeatures)
    .where(
      and(
        eq(nightFeatures.userId, userId),
        gte(nightFeatures.nightDate, historyStartMs),
        lt(nightFeatures.nightDate, refStartMs),
      ),
    )
    .orderBy(asc(nightFeatures.nightDate))

  // Trailing sleep-detections (~7 days) so the 7-day rolling
  // detected_sleep_nights count is correct; the reference night is recomputed
  // from raw and merged over these (computed wins).
  const sleepDetectionRows = await db
    .select()
    .from(sleepDetections)
    .where(
      and(
        eq(sleepDetections.userId, userId),
        gte(sleepDetections.nightDate, refStartMs - 7 * DAY_MS),
        lte(sleepDetections.nightDate, windowEndMs),
      ),
    )
    .orderBy(asc(sleepDetections.nightDate))

  // Derive the HR/HRV signal samples from the local raw records. The strap
  // captures heartRate + rrAverageMs (≈ ibiMs), so the pipeline gets its
  // HRV/RHR input from data the device owns. The legacy signal_samples table
  // is server-downlinked only and goes stale once sync is removed, which would
  // otherwise zero out RHR/rmssd for every recent night.
  const samples: SignalSampleV1[] = rawRows.map((r) => ({
    timestamp: toIso(r.timestamp),
    heartRate: r.heartRate ?? 0,
    ibiMs: r.rrAverageMs,
    source: "strap-raw",
    motionScore: null,
    qualityScore: r.skinContact == null ? 0 : r.skinContact !== 0 ? 1 : 0,
  }))

  const sensorRecords: HistoricalSensorRecordV1[] = rawRows.map((r) => ({
    timestamp: toIso(r.timestamp),
    heartRate: r.heartRate,
    rrAverageMs: r.rrAverageMs,
    spo2Red: r.spo2Red,
    spo2IR: r.spo2IR,
    skinTempRaw: r.skinTempRaw,
    gravityMagnitude: r.gravityMagnitude,
    gravityX: r.gravityX,
    gravityY: r.gravityY,
    gravityZ: r.gravityZ,
    respRateRaw: r.respRateRaw,
    skinContact: r.skinContact == null ? null : r.skinContact !== 0,
    ppgGreen: r.ppgGreen,
    ppgRedIr: r.ppgRedIr,
    ambientLight: r.ambientLight,
    ledDrive1: r.ledDrive1,
    ledDrive2: r.ledDrive2,
    signalQuality: r.signalQuality,
  }))

  const events: DeviceEventV1[] = eventRows.map((r) => ({
    eventNumber: r.eventNumber,
    capturedAt: toIso(r.capturedAt),
  }))

  const priorNightFeatures: NightFeatureSetV1[] = dedupeByNight(nightFeatureRows).map((r) => ({
    nightDate: toIso(r.nightDate),
    restingHeartRate: r.restingHeartRate,
    rmssd: r.rmssd,
    sdnn: r.sdnn,
    pnn50: 0, // not persisted locally; baseline uses RHR/rmssd/sdnn
    respiratoryRate: r.respiratoryRate,
    continuity: r.continuity,
    regularity: r.regularity,
    validCoverage: r.validCoverage,
    confidenceRaw: r.confidenceRaw,
    sleepEstimateHours: r.sleepEstimateHours,
    sourceBlend: r.sourceBlend,
  }))

  const priorSleepDetections: SleepDetectionSummaryV1[] = dedupeByNight(sleepDetectionRows).map((r) => ({
    nightDate: toIso(r.nightDate),
    bedtime: toIso(r.bedtime ?? r.nightDate),
    wakeTime: toIso(r.wakeTime ?? r.nightDate),
    durationHours: r.durationHours,
    interruptionCount: r.interruptionCount,
    continuity: r.continuity,
    regularity: r.regularity,
    validCoverage: r.validCoverage,
    confidence: r.confidence,
  }))

  return {
    samples,
    sensorRecords,
    deviceEvents: events,
    priorNightFeatures,
    priorSleepDetections,
    referenceDate,
    timeZone,
  }
}
