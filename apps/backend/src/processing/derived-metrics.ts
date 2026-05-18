import {
  SignalSample,
  HistoricalSensorRecord,
  NightFeatureSet,
  SleepDetectionSummary,
  BaselineProfile,
  DerivedMetricsBundle,
} from './interfaces';
import { average, standardDeviation, clamp } from './utils';
import { detectDesaturationEvents } from './spo2-events';
import { computeRecoveryIndex } from './recovery-index';
import { computeTrainingLoadRatio } from './training-load';
import { estimateCoreTemperature } from './core-temperature';
import { addDaysToDateKey, calendarDayBounds, calendarDayKey } from '../common/calendar';
import { averageByTimestamp, sliceByTimestamp } from './timestamp-slice';

interface SensorSample {
  timestamp: Date;
  spo2Red: number;
  spo2IR: number;
  skinTempRaw: number;
}

interface TimestampedValue {
  timestamp: Date;
  value: number;
}

const STRAIN_LN_7201 = 8.882_643_961_783_384;

// Precomputed time-series that don't depend on the per-day window.
// computeDerivedMetrics used to compute all of these inside its body
// once per reference day, which made the pipeline's compute stage spend
// ~165s scanning the same signal_samples 45 times for a 45-day window.
// Hoisting them into a single precompute call cuts compute to a few
// seconds.
export interface PrecomputedMetricSeries {
  stress: TimestampedValue[];
  sensorSamples: SensorSample[];
  spo2: TimestampedValue[];
  skinTemp: TimestampedValue[];
  hrvRmssd: { timestamp: Date; value: number }[];
}

export function precomputeMetricSeries(
  samples: SignalSample[],
  sensorRecords: HistoricalSensorRecord[],
): PrecomputedMetricSeries {
  const sensorSamples: SensorSample[] = sensorRecords
    .filter(
      (r) => r.spo2Red != null && r.spo2IR != null && r.skinTempRaw != null,
    )
    .map((r) => ({
      timestamp: r.timestamp,
      spo2Red: r.spo2Red!,
      spo2IR: r.spo2IR!,
      skinTempRaw: r.skinTempRaw!,
    }));
  return {
    stress: stressPoints(samples),
    sensorSamples,
    spo2: spo2Points(sensorSamples),
    skinTemp: skinTemperaturePoints(sensorSamples),
    hrvRmssd: rollingRmssd(samples),
  };
}

export function computeDerivedMetrics(
  samples: SignalSample[],
  sensorRecords: HistoricalSensorRecord[],
  nightFeatures: NightFeatureSet[],
  sleepDetections: SleepDetectionSummary[],
  baseline: BaselineProfile,
  referenceDate: Date,
  timeZoneInput?: string,
  // Optional precomputed series. When null/undefined, compute internally
  // — keeps the function callable in isolation (tests, single-day use).
  // Pipeline callers should pass a precomputed bundle from
  // `precomputeMetricSeries(samples, sensorRecords)` so the loop over
  // reference days reuses one shared computation.
  precomputed?: PrecomputedMetricSeries,
): DerivedMetricsBundle {
  const referenceKey = calendarDayKey(referenceDate, timeZoneInput);
  const { start: dayStart, end: dayEnd } = calendarDayBounds(
    referenceKey,
    timeZoneInput,
  );

  const series = precomputed ?? precomputeMetricSeries(samples, sensorRecords);
  const { stress, spo2, skinTemp, hrvRmssd: hrvRmssdSeries } = series;

  // Per-day binary-search slice over pre-sorted series. `samples` is
  // sorted by `pipeline.service.ts:sanitize`, and `stress`/`spo2`/
  // `skinTemp` are sorted by their `*Points` builders. Switching from
  // `.filter()` here was the fix for the per-day-O(N) blow-up that put
  // `stages.compute` at ~10 minutes on a 45-day window.
  const daySamples = sliceByTimestamp(samples, dayStart, dayEnd);
  const strain = strainScore(daySamples, baseline);

  const stressAvg = averageByTimestamp(stress, dayStart, dayEnd);
  const spo2Avg = averageByTimestamp(spo2, dayStart, dayEnd);
  const skinTempAvg = averageByTimestamp(skinTemp, dayStart, dayEnd);

  const baselineStart = calendarDayBounds(
    addDaysToDateKey(referenceKey, -7),
    timeZoneInput,
  ).start;
  const skinTempBaseline = averageByTimestamp(skinTemp, baselineStart, dayStart);

  const recentStart = calendarDayBounds(
    addDaysToDateKey(referenceKey, -6),
    timeZoneInput,
  ).start;
  const sleepConsistency =
    sleepConsistencyScore(sleepDetections, referenceDate) ??
    sleepConsistencyScoreFromNightFeatures(nightFeatures, referenceDate);

  let detectedSleepNights: number;
  if (sleepDetections.length === 0) {
    detectedSleepNights = nightFeatures.filter(
      (f) =>
        f.nightDate >= recentStart &&
        f.nightDate <= referenceDate &&
        f.validCoverage >= 0.35,
    ).length;
  } else {
    detectedSleepNights = sleepDetections.filter(
      (d) =>
        d.nightDate >= recentStart &&
        d.nightDate <= referenceDate &&
        d.validCoverage >= 0.35,
    ).length;
  }

  return {
    stressScores: stress,
    spo2Scores: spo2,
    skinTempScores: skinTemp,
    strainScore: strain,
    sleepConsistencyScore: sleepConsistency,
    detectedSleepNights,
    skinTempAvgCelsius: skinTempAvg,
    skinTempDeltaCelsius:
      skinTempAvg != null && skinTempBaseline != null
        ? skinTempAvg - skinTempBaseline
        : null,
    stressAverage: stressAvg,
    spo2Average: spo2Avg,
    hrvRmssdSeries,
    ...computeAdvancedMetrics(
      spo2, skinTemp, nightFeatures, sleepDetections, baseline,
      strain, spo2Avg, skinTempAvg, skinTempBaseline, referenceDate,
    ),
  };
}

function computeAdvancedMetrics(
  spo2Points: TimestampedValue[],
  skinTempPoints: TimestampedValue[],
  nightFeatures: NightFeatureSet[],
  sleepDetections: SleepDetectionSummary[],
  baseline: BaselineProfile,
  strain: number | null,
  spo2Avg: number | null,
  skinTempAvg: number | null,
  skinTempBaseline: number | null,
  referenceDate: Date,
) {
  // SpO2 desaturation events
  const desatResult = spo2Points.length >= 30
    ? detectDesaturationEvents(spo2Points)
    : null;

  // Core temperature
  const nightMedianSkinTemp = skinTempAvg ?? 0;
  const coreResult = skinTempPoints.length >= 10
    ? estimateCoreTemperature(skinTempPoints, nightMedianSkinTemp)
    : null;

  // Training load ratio (need historical strain data from nightFeatures as proxy)
  const strainHistory = nightFeatures
    .filter((f) => f.nightDate <= referenceDate)
    .map((f) => ({
      date: f.nightDate,
      strain: strain ?? 0, // Use current strain as placeholder; ideally from dailyMetrics
    }));
  const trainingLoad = computeTrainingLoadRatio(strainHistory);

  // Recovery index
  const latestFeature = nightFeatures.length > 0
    ? nightFeatures[nightFeatures.length - 1]
    : null;
  const latestDetection = sleepDetections.length > 0
    ? sleepDetections[sleepDetections.length - 1]
    : null;

  const recovery = latestFeature
    ? computeRecoveryIndex({
        hrvRmssd: latestFeature.rmssd,
        baselineRmssd: baseline.rmssd,
        lfHfRatio: null, // Will be populated when epoch features are threaded through
        prevDayStrain: strain,
        spo2Average: spo2Avg,
        skinTempDelta: skinTempAvg != null && skinTempBaseline != null
          ? skinTempAvg - skinTempBaseline
          : null,
        architectureScore: null, // Populated in pipeline when sleep stages available
        sleepDurationHours: latestDetection?.durationHours ?? latestFeature.sleepEstimateHours,
        targetSleepMinutes: 480,
      })
    : null;

  return {
    lfHfRatioAverage: null as number | null, // Computed from epoch features in pipeline
    recoveryIndex: recovery,
    trainingLoadRatio: trainingLoad?.ratio ?? null,
    trainingLoadRiskZone: trainingLoad?.riskZone ?? null,
    spo2DipCount: desatResult?.events.length ?? null,
    odiPerHour: desatResult ? Math.round(desatResult.odiPerHour * 10) / 10 : null,
    lowestSpo2: desatResult?.lowestSpo2 ?? null,
    coreTemperatureEstimate: coreResult?.coreEstimate ?? null,
    circadianNadir: coreResult?.nadir ?? null,
    sleepArchitectureScore: null as number | null, // Computed from sleep stages in pipeline
  };
}

function rollingRmssd(
  samples: SignalSample[],
  windowSize: number = 300,
  stepSize: number = 30,
): { timestamp: Date; value: number }[] {
  const sorted = [...samples]
    .filter((s) => s.ibiMs != null && s.ibiMs > 0)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const results: { timestamp: Date; value: number }[] = [];

  for (let start = 0; start + windowSize <= sorted.length; start += stepSize) {
    const windowSlice = sorted.slice(start, start + windowSize);
    const ibis = windowSlice.map((s) => s.ibiMs!);

    // Artifact filter: reject successive diffs > 20%
    const cleanIbis: number[] = [ibis[0]];
    for (let i = 1; i < ibis.length; i++) {
      if (Math.abs(ibis[i] - ibis[i - 1]) / ibis[i - 1] <= 0.20) {
        cleanIbis.push(ibis[i]);
      }
    }

    if (cleanIbis.length < 30) continue;

    let sumSqDiffs = 0;
    for (let i = 1; i < cleanIbis.length; i++) {
      const diff = cleanIbis[i] - cleanIbis[i - 1];
      sumSqDiffs += diff * diff;
    }
    const rmssd = Math.sqrt(sumSqDiffs / (cleanIbis.length - 1));

    const midpoint = windowSlice[Math.floor(windowSlice.length / 2)].timestamp;
    results.push({ timestamp: midpoint, value: Math.round(rmssd * 10) / 10 });
  }

  return results;
}

// --- Stress (Baevsky Stress Index) ---

function stressPoints(samples: SignalSample[]): TimestampedValue[] {
  const sorted = [...samples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const windowSize = 120;
  const step = 30;

  if (sorted.length < windowSize) return [];

  const output: TimestampedValue[] = [];
  for (
    let start = 0;
    start <= sorted.length - windowSize;
    start += step
  ) {
    const window = sorted.slice(start, start + windowSize);
    const rr: number[] = [];
    for (const sample of window) {
      if (sample.ibiMs != null) {
        rr.push(sample.ibiMs);
      } else if (sample.heartRate > 0) {
        rr.push(60_000.0 / sample.heartRate);
      }
    }
    if (rr.length < windowSize) continue;
    const score = baevskyStressScore(rr);
    if (score == null) continue;
    const time = window[window.length - 1].timestamp;
    output.push({ timestamp: time, value: score });
  }
  return output;
}

function baevskyStressScore(rrMs: number[]): number | null {
  if (rrMs.length < 120) return null;
  const clamped = rrMs.map((v) => Math.min(2000, Math.max(250, v)));
  const minRR = Math.min(...clamped);
  const maxRR = Math.max(...clamped);
  const vr = (maxRR - minRR) / 1000;
  if (vr < 0.0001) return 10.0;

  const binWidth = 50.0;
  const bins = new Map<number, number>();
  for (const value of clamped) {
    const bin = Math.floor(value / binWidth);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }

  let modeBin = 0;
  let modeCount = 0;
  for (const [bin, count] of bins) {
    if (count > modeCount) {
      modeBin = bin;
      modeCount = count;
    }
  }

  const mode = modeBin * binWidth + binWidth / 2.0;
  const modeFreq = modeCount;
  const count = clamped.length;
  const aMode = (modeFreq / count) * 100.0;
  const score = Math.min(1000.0, aMode / (2.0 * vr * (mode / 1000.0))) / 100.0;
  return Math.round(score * 100.0) / 100.0;
}

// --- SpO2 ---

function spo2Points(samples: SensorSample[]): TimestampedValue[] {
  const sorted = [...samples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const windowSize = 30;
  const step = 15;
  if (sorted.length < windowSize) return [];

  const output: TimestampedValue[] = [];
  for (
    let start = 0;
    start <= sorted.length - windowSize;
    start += step
  ) {
    const window = sorted.slice(start, start + windowSize);
    const reds = window.map((s) => s.spo2Red);
    const irs = window.map((s) => s.spo2IR);
    const meanRed = average(reds);
    const meanIR = average(irs);
    if (meanRed < 1 || meanIR < 1) continue;

    const acRed = standardDeviation(reds);
    const acIR = standardDeviation(irs);
    if (acRed < 0.001 || acIR < 0.001) continue;

    const ratio = (acRed / meanRed) / (acIR / meanIR);
    const spo2 = clamp(110.0 - 25.0 * ratio, 70, 100);
    const time = window[window.length - 1].timestamp;
    output.push({ timestamp: time, value: spo2 });
  }
  return output;
}

// --- Skin Temperature ---

function skinTemperaturePoints(samples: SensorSample[]): TimestampedValue[] {
  return samples
    .filter((s) => s.skinTempRaw >= 100)
    .map((s) => ({
      timestamp: s.timestamp,
      value: s.skinTempRaw * 0.04,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// --- Strain (TRIMP) ---

function strainScore(
  samples: SignalSample[],
  baseline: BaselineProfile,
): number | null {
  // Callers (only `computeDerivedMetrics` today) pass a slice taken from
  // an already-sorted series, so the leading copy+sort is redundant. If
  // a future caller passes unsorted input this assumption breaks — easy
  // to re-add a sort guard here if that ever happens.
  const sorted = samples;
  if (sorted.length < 2) return null;

  const maxHR = baseline.maxHeartRate ?? 190.0;
  const resting =
    baseline.restingHeartRate > 0 ? baseline.restingHeartRate : 60.0;
  if (maxHR <= resting) return null;

  const hrReserve = maxHR - resting;
  const intervals: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    intervals.push(
      Math.max(
        1.0,
        (sorted[i + 1].timestamp.getTime() - sorted[i].timestamp.getTime()) /
          1000,
      ),
    );
  }
  const medianIntervalSeconds =
    intervals.length > 0
      ? [...intervals].sort((a, b) => a - b)[
          Math.floor(intervals.length / 2)
        ]
      : 60.0;
  const fallbackIntervalMinutes = clamp(
    medianIntervalSeconds / 60.0,
    1.0 / 60.0,
    5.0,
  );

  let coveredMinutes = 0;
  let trimp = 0;
  for (let idx = 0; idx < sorted.length; idx++) {
    let dtMinutes: number;
    if (idx < sorted.length - 1) {
      const raw =
        (sorted[idx + 1].timestamp.getTime() -
          sorted[idx].timestamp.getTime()) /
        1000 /
        60;
      dtMinutes = clamp(raw, 1.0 / 60.0, 5.0);
    } else {
      dtMinutes = fallbackIntervalMinutes;
    }
    coveredMinutes += dtMinutes;

    const pct =
      ((sorted[idx].heartRate - resting) / hrReserve) * 100.0;
    let weight: number;
    if (pct >= 90) weight = 5;
    else if (pct >= 80) weight = 4;
    else if (pct >= 70) weight = 3;
    else if (pct >= 60) weight = 2;
    else if (pct >= 50) weight = 1;
    else weight = 0;

    trimp += dtMinutes * weight;
  }

  if (coveredMinutes < 10) return null;
  if (trimp <= 0) return 0.0;

  const raw = (21.0 * Math.log(trimp + 1.0)) / STRAIN_LN_7201;
  const clamped = clamp(raw, 0, 21);
  return Math.round(clamped * 100.0) / 100.0;
}

// --- Sleep Consistency ---

function sleepConsistencyScore(
  records: SleepDetectionSummary[],
  referenceDate: Date,
): number | null {
  const recent = [...records]
    .filter((record) => record.nightDate <= referenceDate)
    .sort((a, b) => a.nightDate.getTime() - b.nightDate.getTime())
    .slice(-7);
  if (recent.length < 3) return null;

  const durations = recent.map((r) => r.durationHours);
  const durationScore = Math.max(0, 100.0 - cv(durations));

  const startTimes = unwrapSleepTimes(
    recent.map((r) => secondsSinceMidnight(r.bedtime)),
  );
  const endTimes = recent.map((r) => secondsSinceMidnight(r.wakeTime));
  const midpoints = unwrapSleepTimes(
    recent.map((r) =>
      secondsSinceMidnight(
        new Date(
          r.bedtime.getTime() + (r.durationHours * 60 * 60 * 1000) / 2,
        ),
      ),
    ),
  );

  const timingScore = average([
    Math.max(0, 100.0 - cv(startTimes)),
    Math.max(0, 100.0 - cv(endTimes)),
    Math.max(0, 100.0 - cv(midpoints)),
  ]);

  return clamp(average([durationScore, timingScore]), 0, 100);
}

function sleepConsistencyScoreFromNightFeatures(
  records: NightFeatureSet[],
  referenceDate: Date,
): number | null {
  const recent = [...records]
    .filter((record) => record.nightDate <= referenceDate)
    .sort((a, b) => a.nightDate.getTime() - b.nightDate.getTime())
    .slice(-7);
  if (recent.length < 3) return null;

  const durations = recent.map((r) => r.sleepEstimateHours);
  const mean = average(durations);
  if (mean <= 0) return null;
  const std = standardDeviation(durations);
  const cvValue = (std / mean) * 100.0;
  return clamp(100 - cvValue, 0, 100);
}

function secondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function unwrapSleepTimes(times: number[]): number[] {
  return times.map((t) => (t > 64_800 ? t - 86_400 : t));
}

function cv(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  return (standardDeviation(values) / Math.abs(mean)) * 100.0;
}
