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

  // Respiratory rate estimate: 14.0 + (hrStdDev * 0.65), clamped 10-22
  const hrStdDev =
    heartRates.length >= 2 ? standardDeviation(heartRates) : 0;
  const respiratoryRate = clamp(14.0 + hrStdDev * 0.65, 10, 22);

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
    };
  }

  return {
    restingHeartRate: average(valid.map(feature => feature.restingHeartRate)),
    rmssd: average(valid.map(feature => feature.rmssd)),
    sdnn: average(valid.map(feature => feature.sdnn)),
    nightsUsed: valid.length,
    isWarmedUp: valid.length >= 5,
  };
}

export function computeDailyScore(
  featureSet: NightFeatureSet,
  baseline: BaselineProfile,
  targetSleepMinutes: number,
): DailyWellnessScore {
  const rhrPenalty =
    Math.max(0, featureSet.restingHeartRate - baseline.restingHeartRate) * 1.5;
  const hrvBoost = clamp(
    (featureSet.rmssd - baseline.rmssd) * 0.45,
    -18,
    18,
  );
  const continuityBoost = (featureSet.continuity - 0.5) * 35;
  const regularityBoost = (featureSet.regularity - 0.5) * 20;

  const dailyBalance = clamp(
    Math.round(
      65 + hrvBoost + continuityBoost + regularityBoost - rhrPenalty,
    ),
    0,
    100,
  );

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
