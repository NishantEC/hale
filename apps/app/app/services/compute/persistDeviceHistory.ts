import type { NoopDatabase } from "../db"
import {
  type LocalActivityDetectionRow,
  type LocalBaselineProfileRow,
  type LocalDailyMetricRow,
  type LocalDailyScoreRow,
  type LocalNightFeatureRow,
  type LocalSleepDetectionRow,
  type LocalSleepStageRow,
  upsertLocalActivityDetections,
  upsertLocalBaselineProfile,
  upsertLocalDailyMetrics,
  upsertLocalDailyScores,
  upsertLocalNightFeatures,
  upsertLocalSleepDetections,
  upsertLocalSleepStages,
} from "../db/repositories/derived"

// ──────────────────────────────────────────────────────────────────
// Persist the on-device pipeline's full output into local SQLite as
// `_origin='local'` rows — the device's own derived store that becomes the
// source of truth at cutover. Timestamps arrive as RFC3339 ISO strings from
// the Rust DTOs (chrono serde) and are stored as epoch-ms integers. Each row
// id is keyed on its day/night/bout so re-running a day upserts in place
// rather than accumulating duplicates.
// ──────────────────────────────────────────────────────────────────

/** Subset of the Rust `NightFeatureSetV1` we persist locally. */
export interface DeviceNightFeature {
  /** RFC3339 UTC string */
  nightDate: string
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
}

/** Subset of the Rust `SleepDetectionSummaryV1` we persist locally. */
export interface DeviceSleepDetection {
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

/** Rust `SleepStageSummaryDto`. */
export interface DeviceSleepStage {
  nightDate: string
  remMinutes: number
  coreMinutes: number
  deepMinutes: number
  awakeMinutes: number
  unknownMinutes: number
  confidence: number
  source: string
  epochMinutes: number
}

/** Rust `DailyWellnessScoreDto`. */
export interface DeviceDailyScore {
  dayDate: string
  dailyBalance: number
  loadPressure: number
  sleepReserveHours: number
  confidence: string
  recommendation: string
  detail: string
}

/** Rust `ActivityBoutV1` (fields without a local column are ignored). */
export interface DeviceActivityBout {
  startTime: string
  endTime: string
  durationMinutes: number
  activityType: string
  intensity: string
  confidence: number
  heartRateAvg: number
  heartRateMax: number
  strainScore: number
  source: string
  cadenceHz: number | null
}

/** Rust `BaselineProfileV1`. */
export interface DeviceBaseline {
  restingHeartRate: number
  rmssd: number
  sdnn: number
  nightsUsed: number
  maxHeartRate: number | null
}

/** Rust `PersistedDailyMetricV1` (the reference day's metrics). */
export interface DeviceDailyMetric {
  strainScore: number | null
  sleepConsistencyScore: number | null
  detectedSleepNights: number
  skinTempAvgCelsius: number | null
  skinTempDeltaCelsius: number | null
  stressAverage: number | null
  spo2Average: number | null
  lfHfRatioAverage: number | null
  recoveryIndex: number | null
  trainingLoadRatio: number | null
  trainingLoadRiskZone: string | null
  spo2DipCount: number | null
  odiPerHour: number | null
  lowestSpo2: number | null
  coreTemperatureEstimate: number | null
  circadianNadir: number | null
  sleepArchitectureScore: number | null
  activityBouts: DeviceActivityBout[]
}

/** The full `FullDayOutput` from the on-device pipeline. */
export interface FullDayOutput {
  nightFeatures?: DeviceNightFeature[]
  sleepDetections?: DeviceSleepDetection[]
  sleepStages?: DeviceSleepStage[]
  dailyScores?: DeviceDailyScore[]
  activityBouts?: DeviceActivityBout[]
  baseline?: DeviceBaseline
  dailyMetrics?: DeviceDailyMetric
}

/** Backward-compatible alias for the night/detection-only subset. */
export type DeviceHistoryOutput = Pick<FullDayOutput, "nightFeatures" | "sleepDetections">

function isoToMs(iso: string): number {
  return new Date(iso).getTime()
}

function dayKeyToMs(referenceDate: string): number {
  return Date.parse(`${referenceDate}T00:00:00.000Z`)
}

function roundOrNull(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v)
}

/**
 * Build the night_features + sleep_detections rows. Pure (no I/O) so the
 * mapping — ISO→ms, stable `local:<nightMs>` id, dropped fields — stays
 * unit-testable.
 */
export function buildLocalHistoryRows(
  output: DeviceHistoryOutput,
  now: number = Date.now(),
): { nightFeatureRows: LocalNightFeatureRow[]; sleepDetectionRows: LocalSleepDetectionRow[] } {
  const nightFeatureRows: LocalNightFeatureRow[] = (output.nightFeatures ?? []).map((f) => {
    const nightDate = isoToMs(f.nightDate)
    // night_features has no pnn50 column locally — intentionally dropped.
    return {
      id: `local:${nightDate}`,
      nightDate,
      restingHeartRate: f.restingHeartRate,
      rmssd: f.rmssd,
      sdnn: f.sdnn,
      respiratoryRate: f.respiratoryRate,
      continuity: f.continuity,
      regularity: f.regularity,
      validCoverage: f.validCoverage,
      confidenceRaw: f.confidenceRaw,
      sleepEstimateHours: f.sleepEstimateHours,
      sourceBlend: f.sourceBlend,
      updatedAt: now,
    }
  })

  const sleepDetectionRows: LocalSleepDetectionRow[] = (output.sleepDetections ?? []).map((d) => {
    const nightDate = isoToMs(d.nightDate)
    return {
      id: `local:${nightDate}`,
      nightDate,
      bedtime: isoToMs(d.bedtime),
      wakeTime: isoToMs(d.wakeTime),
      durationHours: d.durationHours,
      interruptionCount: d.interruptionCount,
      continuity: d.continuity,
      regularity: d.regularity,
      validCoverage: d.validCoverage,
      confidence: d.confidence,
      updatedAt: now,
    }
  })

  return { nightFeatureRows, sleepDetectionRows }
}

interface FullDayRows {
  nightFeatureRows: LocalNightFeatureRow[]
  sleepDetectionRows: LocalSleepDetectionRow[]
  sleepStageRows: LocalSleepStageRow[]
  dailyScoreRows: LocalDailyScoreRow[]
  activityRows: LocalActivityDetectionRow[]
  dailyMetricRows: LocalDailyMetricRow[]
  baselineRow: LocalBaselineProfileRow | null
}

/**
 * Map a full `FullDayOutput` to local-origin rows for every derived table.
 * `referenceDate` ("YYYY-MM-DD") keys the single daily_metrics row.
 */
export function buildFullDayRows(
  output: FullDayOutput,
  referenceDate: string,
  now: number = Date.now(),
): FullDayRows {
  const { nightFeatureRows, sleepDetectionRows } = buildLocalHistoryRows(output, now)

  const sleepStageRows: LocalSleepStageRow[] = (output.sleepStages ?? []).map((s) => {
    const nightDate = isoToMs(s.nightDate)
    return {
      id: `local:${nightDate}`,
      nightDate,
      remMinutes: Math.round(s.remMinutes),
      coreMinutes: Math.round(s.coreMinutes),
      deepMinutes: Math.round(s.deepMinutes),
      awakeMinutes: Math.round(s.awakeMinutes),
      unknownMinutes: Math.round(s.unknownMinutes),
      confidence: s.confidence,
      source: s.source,
      epochMinutes: Math.round(s.epochMinutes),
      updatedAt: now,
    }
  })

  const dailyScoreRows: LocalDailyScoreRow[] = (output.dailyScores ?? []).map((sc) => {
    const dayDate = isoToMs(sc.dayDate)
    return {
      id: `local:${dayDate}`,
      dayDate,
      dailyBalance: Math.round(sc.dailyBalance),
      loadPressure: Math.round(sc.loadPressure),
      sleepReserveHours: sc.sleepReserveHours,
      confidence: sc.confidence,
      recommendation: sc.recommendation,
      detail: sc.detail,
      updatedAt: now,
    }
  })

  const bouts = output.activityBouts ?? output.dailyMetrics?.activityBouts ?? []
  const activityRows: LocalActivityDetectionRow[] = bouts.map((b) => {
    const startTime = isoToMs(b.startTime)
    return {
      id: `local:${startTime}`,
      startTime,
      endTime: isoToMs(b.endTime),
      durationMinutes: b.durationMinutes,
      activityType: b.activityType,
      intensity: b.intensity,
      confidence: b.confidence,
      heartRateAvg: b.heartRateAvg,
      heartRateMax: b.heartRateMax,
      strainScore: b.strainScore,
      cadenceHz: b.cadenceHz,
      source: b.source,
      updatedAt: now,
    }
  })

  const dailyMetricRows: LocalDailyMetricRow[] = []
  const m = output.dailyMetrics
  if (m) {
    const dayDate = dayKeyToMs(referenceDate)
    const activeMinutes = bouts.reduce((sum, b) => sum + b.durationMinutes, 0)
    dailyMetricRows.push({
      id: `local:${dayDate}`,
      dayDate,
      stressAverage: m.stressAverage,
      spo2Average: m.spo2Average,
      skinTempAvgCelsius: m.skinTempAvgCelsius,
      skinTempDeltaCelsius: m.skinTempDeltaCelsius,
      strainScore: m.strainScore,
      sleepConsistencyScore: m.sleepConsistencyScore,
      detectedSleepNights: Math.round(m.detectedSleepNights),
      lfHfRatioAverage: m.lfHfRatioAverage,
      recoveryIndex: m.recoveryIndex,
      trainingLoadRatio: m.trainingLoadRatio,
      trainingLoadRiskZone: m.trainingLoadRiskZone,
      spo2DipCount: roundOrNull(m.spo2DipCount),
      odiPerHour: m.odiPerHour,
      lowestSpo2: m.lowestSpo2,
      coreTemperatureEstimate: m.coreTemperatureEstimate,
      circadianNadir: roundOrNull(m.circadianNadir),
      sleepArchitectureScore: m.sleepArchitectureScore,
      activeMinutes: bouts.length > 0 ? activeMinutes : null,
      activityCount: bouts.length,
      updatedAt: now,
    })
  }

  const baselineRow: LocalBaselineProfileRow | null = output.baseline
    ? {
        id: "local:baseline",
        restingHeartRate: output.baseline.restingHeartRate,
        rmssd: output.baseline.rmssd,
        sdnn: output.baseline.sdnn,
        nightsUsed: Math.round(output.baseline.nightsUsed),
        maxHeartRate: output.baseline.maxHeartRate,
        updatedAt: now,
      }
    : null

  return {
    nightFeatureRows,
    sleepDetectionRows,
    sleepStageRows,
    dailyScoreRows,
    activityRows,
    dailyMetricRows,
    baselineRow,
  }
}

/**
 * Persist a `FullDayOutput`'s night-features and sleep-detections as the
 * device's own local-origin history. Idempotent per night. (Subset kept for
 * the rolling baseline-history path and its tests.)
 */
export async function persistDeviceHistory(
  db: NoopDatabase,
  output: DeviceHistoryOutput,
): Promise<void> {
  const { nightFeatureRows, sleepDetectionRows } = buildLocalHistoryRows(output)
  await upsertLocalNightFeatures(db, nightFeatureRows)
  await upsertLocalSleepDetections(db, sleepDetectionRows)
}

/**
 * Persist a full `FullDayOutput` across every derived table as the device's
 * own local-origin source of truth. Idempotent per day/night/bout.
 */
export async function persistFullDay(
  db: NoopDatabase,
  output: FullDayOutput,
  referenceDate: string,
  now: number = Date.now(),
): Promise<void> {
  const rows = buildFullDayRows(output, referenceDate, now)
  await upsertLocalNightFeatures(db, rows.nightFeatureRows)
  await upsertLocalSleepDetections(db, rows.sleepDetectionRows)
  await upsertLocalSleepStages(db, rows.sleepStageRows)
  await upsertLocalDailyScores(db, rows.dailyScoreRows)
  await upsertLocalActivityDetections(db, rows.activityRows)
  await upsertLocalDailyMetrics(db, rows.dailyMetricRows)
  if (rows.baselineRow) await upsertLocalBaselineProfile(db, rows.baselineRow)
}
