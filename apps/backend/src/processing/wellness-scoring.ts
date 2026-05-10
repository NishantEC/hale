import {
  SignalSample,
  NightFeatureSet,
  BaselineProfile,
  SleepDetectionSummary,
  DailyWellnessScore,
} from './interfaces';
import { percentile, average, standardDeviation, clamp } from './utils';
import { confidenceLevel } from './ppg-quality-gate';

type NightFeatureBuildOptions = {
  bedtime?: Date | null;
  wakeTime?: Date | null;
  continuity?: number | null;
  regularity?: number | null;
  validCoverage?: number | null;
  sleepEstimateHours?: number | null;
  sourceBlend?: string | null;
  /**
   * Mean respiratory rate (breaths/min) from the strap's `respRateRaw`
   * field, averaged across in-window epochs. When supplied, replaces the
   * HR-stddev fallback that only exists for samples without a real RR.
   */
  respiratoryRate?: number | null;
};

export function buildNightFeatureSet(
  samples: SignalSample[],
  referenceDate: Date,
  baseline: BaselineProfile,
  options: NightFeatureBuildOptions = {},
): NightFeatureSet {
  const windowStart =
    options.bedtime ?? new Date(referenceDate.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd = options.wakeTime ?? referenceDate;

  const nightSamples = samples.filter(
    s => s.timestamp >= windowStart && s.timestamp <= windowEnd,
  );

  const expectedSamples = estimateExpectedSamples(
    nightSamples,
    windowStart,
    windowEnd,
  );
  const detectedCoverage =
    expectedSamples <= 0 ? 0 : Math.min(1.0, nightSamples.length / expectedSamples);
  const validCoverage = clamp(options.validCoverage ?? detectedCoverage, 0, 1);

  const heartRates = nightSamples.map(s => s.heartRate);
  const ibis = nightSamples.map(s =>
    s.ibiMs !== null ? s.ibiMs : 60000 / s.heartRate,
  );

  const restingHeartRate =
    heartRates.length > 0 ? percentile(heartRates, 0.15) : 0;

  // RMSSD: sqrt of mean of squared successive differences
  const rmssd = computeRMSSD(ibis);

  // SDNN: standard deviation of IBIs
  const sdnn = ibis.length >= 2 ? standardDeviation(ibis) : 0;

  // pNN50: % of consecutive IBIs differing by > 50 ms
  const pnn50 = computePNN50(ibis);

  // Respiratory rate: prefer real `respRateRaw` mean from strap when the
  // caller supplies it; otherwise fall back to a HR-stddev heuristic.
  const hrStdDev =
    heartRates.length >= 2 ? standardDeviation(heartRates) : 0;
  const respiratoryRate =
    options.respiratoryRate != null && Number.isFinite(options.respiratoryRate)
      ? clamp(options.respiratoryRate, 6, 30)
      : clamp(14.0 + hrStdDev * 0.65, 10, 22);

  // Continuity: gap penalty for gaps > 8 minutes
  const continuity = clamp(
    options.continuity ?? estimateContinuity(nightSamples),
    0,
    1,
  );

  // Regularity
  const regularity = clamp(
    options.regularity ??
      (baseline.nightsUsed === 0
        ? 0.65
        : Math.max(
            0,
            1 - Math.abs(restingHeartRate - baseline.restingHeartRate) / 25,
          )),
    0,
    1,
  );

  // Confidence
  const avgQuality =
    nightSamples.length > 0
      ? average(nightSamples.map(s => s.qualityScore))
      : 0;
  const confidenceRaw = Math.min(1, validCoverage * 0.6 + avgQuality * 0.4);

  // Sleep estimate
  const observedWindowHours = Math.max(
    0,
    (windowEnd.getTime() - windowStart.getTime()) / 3_600_000,
  );
  const sleepEstimateHours = clamp(
    options.sleepEstimateHours ??
      (observedWindowHours > 0 ? observedWindowHours : validCoverage * 10.5),
    2,
    14,
  );

  // Source blend
  const sourceBlend = options.sourceBlend ?? computeSourceBlend(nightSamples);

  return {
    nightDate: referenceDate,
    restingHeartRate,
    rmssd,
    sdnn,
    pnn50,
    respiratoryRate,
    continuity,
    regularity,
    validCoverage,
    confidenceRaw,
    sleepEstimateHours,
    sourceBlend,
  };
}

export function applyingSleepDurationFallback(
  featureSet: NightFeatureSet,
  durationHours: number,
): NightFeatureSet {
  const clampedDuration = clamp(durationHours, 2, 14);
  const boostedCoverage = Math.max(featureSet.validCoverage, 0.7);
  const boostedConfidence = Math.max(featureSet.confidenceRaw, 0.65);

  return {
    ...featureSet,
    sleepEstimateHours: clampedDuration,
    validCoverage: boostedCoverage,
    confidenceRaw: boostedConfidence,
  };
}

export function effectiveSleepFeatureSet(
  featureSet: NightFeatureSet,
  sleepSummary: SleepDetectionSummary | null,
): NightFeatureSet {
  if (!sleepSummary || featureSet.validCoverage < 0.35) {
    return featureSet;
  }

  const continuityDiff = Math.abs(
    featureSet.continuity - sleepSummary.continuity,
  );
  const regularityDiff = Math.abs(
    featureSet.regularity - sleepSummary.regularity,
  );

  let confidenceAdjustment = 0;
  if (continuityDiff < 0.15 && regularityDiff < 0.15) {
    confidenceAdjustment = 0.1;
  } else if (continuityDiff > 0.4 || regularityDiff > 0.4) {
    confidenceAdjustment = -0.15;
  }

  const mergedContinuity =
    (featureSet.continuity + sleepSummary.continuity) / 2;
  const mergedRegularity =
    (featureSet.regularity + sleepSummary.regularity) / 2;
  const mergedCoverage = Math.max(
    featureSet.validCoverage,
    sleepSummary.validCoverage,
  );
  const mergedConfidence = clamp(
    featureSet.confidenceRaw + confidenceAdjustment,
    0,
    1,
  );
  const mergedSleepEstimate =
    sleepSummary.durationHours > 0
      ? sleepSummary.durationHours
      : featureSet.sleepEstimateHours;

  return {
    ...featureSet,
    continuity: mergedContinuity,
    regularity: mergedRegularity,
    validCoverage: mergedCoverage,
    confidenceRaw: mergedConfidence,
    sleepEstimateHours: mergedSleepEstimate,
  };
}

export function recomputeBaselineProfile(
  features: NightFeatureSet[],
): BaselineProfile {
  const valid = features.filter(
    feature =>
      feature.validCoverage >= 0.35 &&
      feature.restingHeartRate > 0 &&
      feature.rmssd >= 0 &&
      feature.sdnn >= 0,
  );

  if (valid.length === 0) {
    return {
      restingHeartRate: 0,
      rmssd: 0,
      sdnn: 0,
      nightsUsed: 0,
      isWarmedUp: false,
      maxHeartRate: null,
    };
  }

  const maxRestingHR = Math.max(...valid.map(feature => feature.restingHeartRate));
  const maxHeartRate = maxRestingHR > 0 ? Math.round(maxRestingHR * 1.5) : null;

  return {
    restingHeartRate: average(valid.map(feature => feature.restingHeartRate)),
    rmssd: average(valid.map(feature => feature.rmssd)),
    sdnn: average(valid.map(feature => feature.sdnn)),
    nightsUsed: valid.length,
    isWarmedUp: valid.length >= 5,
    maxHeartRate,
  };
}

/**
 * Reverse-engineered WHOOP recovery weights (see
 * research/whoop-features-deep-dive.md §3.3). The strap weights HRV
 * heaviest because it's the most sensitive autonomic-balance signal;
 * RHR catches lingering fatigue/illness; sleep duration is a tiebreaker.
 */
const RECOVERY_WEIGHTS = { hrv: 0.7, rhr: 0.2, sleep: 0.1 };
const RECOVERY_HISTORY_WINDOW_DAYS = 60;
const RECOVERY_MIN_HISTORY = 7;

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Compute the daily-balance (recovery) component from per-metric
 * z-scores against the user's own rolling 60-night baseline. Returns
 * a value in [0, 100]. Returns null when history is too short to be
 * statistically meaningful — caller should fall back to a continuity-
 * only score in that case.
 */
function computeRecoveryZScore(
  featureSet: NightFeatureSet,
  history: NightFeatureSet[],
  targetSleepMinutes: number,
): number | null {
  // Use up to RECOVERY_HISTORY_WINDOW_DAYS prior nights with valid data.
  // Exclude tonight to avoid the leak-into-baseline pitfall.
  const tonight = featureSet.nightDate.getTime();
  const cutoff = tonight - RECOVERY_HISTORY_WINDOW_DAYS * 86_400_000;
  const valid = history
    .filter(
      (f) =>
        f.nightDate.getTime() < tonight &&
        f.nightDate.getTime() >= cutoff &&
        f.validCoverage >= 0.35 &&
        f.restingHeartRate > 0 &&
        f.rmssd > 0,
    )
    .sort((a, b) => b.nightDate.getTime() - a.nightDate.getTime());

  if (valid.length < RECOVERY_MIN_HISTORY) return null;

  const hrvStats = meanStd(valid.map((f) => f.rmssd));
  const rhrStats = meanStd(valid.map((f) => f.restingHeartRate));
  const sleepStats = meanStd(valid.map((f) => f.sleepEstimateHours));

  // z-scores. RHR is inverted (lower = better recovery).
  const safeStd = (s: number) => (s > 0.5 ? s : 0.5);
  const hrvZ = clamp(
    (featureSet.rmssd - hrvStats.mean) / safeStd(hrvStats.std),
    -3,
    3,
  );
  const rhrZ = clamp(
    -(featureSet.restingHeartRate - rhrStats.mean) / safeStd(rhrStats.std),
    -3,
    3,
  );
  const sleepZ = clamp(
    (featureSet.sleepEstimateHours - sleepStats.mean) /
      safeStd(sleepStats.std),
    -3,
    3,
  );

  // Sleep-target attainment as a secondary clamp on the sleep term —
  // someone who slept 4h still gets penalized even if their baseline
  // is also short.
  const targetHours = targetSleepMinutes / 60;
  const targetMiss = clamp(featureSet.sleepEstimateHours / targetHours, 0, 1);
  const sleepTerm = sleepZ * targetMiss;

  const combined =
    RECOVERY_WEIGHTS.hrv * hrvZ +
    RECOVERY_WEIGHTS.rhr * rhrZ +
    RECOVERY_WEIGHTS.sleep * sleepTerm;

  // Map the weighted z-score onto 0–100 with 65 as the personal
  // neutral. ±2σ pure z gives ~95/35.
  return clamp(Math.round(65 + combined * 15), 0, 100);
}

export function computeDailyScore(
  featureSet: NightFeatureSet,
  baseline: BaselineProfile,
  targetSleepMinutes: number,
  history: NightFeatureSet[] = [],
): DailyWellnessScore {
  // Preferred path: per-user z-score against rolling 60-night history.
  // Fallback path: when history is too short, lean on within-night
  // continuity/regularity since absolute deltas vs an empty baseline
  // produce nonsense (a healthy 59 bpm became a 88-point penalty).
  const zScoreRecovery = computeRecoveryZScore(
    featureSet,
    history,
    targetSleepMinutes,
  );

  const continuityBoost = (featureSet.continuity - 0.5) * 35;
  const regularityBoost = (featureSet.regularity - 0.5) * 20;

  const fallbackRecovery = clamp(
    Math.round(65 + continuityBoost + regularityBoost),
    0,
    100,
  );

  const dailyBalance = zScoreRecovery ?? fallbackRecovery;

  // loadPressure scaling kept consistent regardless of which recovery
  // path fired — uses the gap from typical-good (70).
  const rhrPenalty = baseline.isWarmedUp
    ? Math.max(0, featureSet.restingHeartRate - baseline.restingHeartRate) * 1.5
    : 0;

  const loadPressure = clamp(
    Math.round(35 + Math.max(0, 70 - dailyBalance) + rhrPenalty * 0.8),
    0,
    100,
  );

  const sleepReserve =
    featureSet.sleepEstimateHours - targetSleepMinutes / 60;

  let recommendation: 'Restore' | 'Steady' | 'Build';
  if (dailyBalance < 42 || sleepReserve < -1.1) {
    recommendation = 'Restore';
  } else if (dailyBalance > 72 && loadPressure < 58) {
    recommendation = 'Build';
  } else {
    recommendation = 'Steady';
  }

  const confidence = confidenceLevel(featureSet.confidenceRaw);

  const detail = `Balance ${dailyBalance}, Load ${loadPressure}, Sleep reserve ${sleepReserve.toFixed(1)}h`;

  return {
    dayDate: featureSet.nightDate,
    dailyBalance,
    loadPressure,
    sleepReserveHours: sleepReserve,
    confidence,
    recommendation,
    detail,
  };
}

// --- Internal helpers ---

function computeRMSSD(ibis: number[]): number {
  if (ibis.length < 2) return 0;
  let sumSquaredDiffs = 0;
  for (let i = 1; i < ibis.length; i++) {
    const diff = ibis[i] - ibis[i - 1];
    sumSquaredDiffs += diff * diff;
  }
  return Math.sqrt(sumSquaredDiffs / (ibis.length - 1));
}

/**
 * pNN50: percentage of pairs of successive IBIs that differ by more
 * than 50 ms. Sensitive to vagal/parasympathetic activity.
 * Reference: Mietus et al. 2002 (Heart Rate Variability standards).
 */
function computePNN50(ibis: number[]): number {
  if (ibis.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < ibis.length; i++) {
    if (Math.abs(ibis[i] - ibis[i - 1]) > 50) count++;
  }
  return (count / (ibis.length - 1)) * 100;
}

function estimateContinuity(samples: SignalSample[]): number {
  if (samples.length < 2) return 0.5;

  const sorted = [...samples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  let gapCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gapMinutes =
      (sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()) /
      60000;
    if (gapMinutes > 8) {
      gapCount++;
    }
  }

  const totalSamples = sorted.length;
  return clamp(1 - gapCount / Math.max(1, totalSamples / 8), 0, 1);
}

function estimateExpectedSamples(
  samples: SignalSample[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const windowSeconds = Math.max(
    1,
    (windowEnd.getTime() - windowStart.getTime()) / 1000,
  );
  if (samples.length < 2) {
    return Math.max(1, Math.round(windowSeconds / 60));
  }

  const intervals: number[] = [];
  for (let index = 1; index < samples.length; index++) {
    const deltaSeconds =
      (samples[index].timestamp.getTime() -
        samples[index - 1].timestamp.getTime()) /
      1000;
    if (deltaSeconds > 0 && deltaSeconds <= 300) {
      intervals.push(deltaSeconds);
    }
  }

  const sampleIntervalSeconds =
    intervals.length > 0
      ? intervals.sort((left, right) => left - right)[
          Math.floor(intervals.length / 2)
        ]
      : 60;

  return Math.max(1, Math.round(windowSeconds / sampleIntervalSeconds));
}

function computeSourceBlend(samples: SignalSample[]): string {
  if (samples.length === 0) return 'none';

  let strapCount = 0;
  let healthkitCount = 0;
  for (const s of samples) {
    if (s.source.toLowerCase().includes('strap')) {
      strapCount++;
    } else {
      healthkitCount++;
    }
  }

  if (strapCount > 0 && healthkitCount > 0) {
    return `strap:${strapCount},healthkit:${healthkitCount}`;
  } else if (strapCount > 0) {
    return `strap:${strapCount}`;
  } else {
    return `healthkit:${healthkitCount}`;
  }
}
