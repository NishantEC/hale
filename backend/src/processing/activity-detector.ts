/**
 * Activity detection from sensor data.
 *
 * Classifies non-sleep daytime periods into activity types using
 * gravity vectors, heart rate, and motion features.
 */

import type { HistoricalSensorRecord, SleepDetectionSummary, BaselineProfile } from './interfaces';
import { average, standardDeviation } from './utils';

// ── Types ────────────────────────────────────────────────

export type ActivityType =
  | 'Running'
  | 'Walking'
  | 'Cycling'
  | 'Strength'
  | 'HIIT'
  | 'General Exercise'
  | 'Light Activity'
  | 'Rest'
  | 'Sedentary';

export interface ActivityBout {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  activityType: ActivityType;
  intensity: 'light' | 'moderate' | 'hard';
  confidence: number;
  heartRateAvg: number;
  heartRateMax: number;
  strainScore: number;
  cadenceHz: number | null;
}

// ── Constants ────────────────────────────────────────────

const MOTION_THRESHOLD = 0.01;        // matches reference (openwhoop activity.py/rs)
const STILL_FRACTION_SEDENTARY = 0.85;
const MIN_BOUT_MINUTES = 3;
const MERGE_GAP_MINUTES = 5;
const STRAIN_LN_7201 = Math.log(7201);

// Cadence bands (Hz) — from FFT of gravity magnitude oscillations
const CADENCE_RUNNING_LOW = 2.5;
const CADENCE_RUNNING_HIGH = 3.5;
const CADENCE_WALKING_LOW = 1.7;
const CADENCE_WALKING_HIGH = 2.5;
const CADENCE_CYCLING_LOW = 1.0;
const CADENCE_CYCLING_HIGH = 1.7;

// Impact threshold for Z-axis peak-to-trough
const IMPACT_RUNNING = 0.3;
const IMPACT_WALKING = 0.15;
const IMPACT_CYCLING_MAX = 0.1;

// ── Main entry point ─────────────────────────────────────

export function detectActivities(
  records: HistoricalSensorRecord[],
  sleepDetections: SleepDetectionSummary[],
  baseline: BaselineProfile,
): ActivityBout[] {
  const sorted = [...records].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  if (sorted.length < 60) return []; // Need at least 1 minute of data

  // Filter out records that fall within sleep windows
  const awakeRecords = filterAwakeRecords(sorted, sleepDetections);
  if (awakeRecords.length < 60) return [];

  // Compute gravity deltas for motion detection
  const deltas = computeGravityDeltas(awakeRecords);

  // Segment into continuous motion bouts
  const rawBouts = segmentIntoBouts(awakeRecords, deltas);

  // Merge close bouts and filter short ones
  const mergedBouts = mergeBouts(rawBouts, MERGE_GAP_MINUTES * 60 * 1000);
  const validBouts = mergedBouts.filter(
    (b) => (b.end.getTime() - b.start.getTime()) >= MIN_BOUT_MINUTES * 60 * 1000,
  );

  // Classify each bout
  return validBouts.map((bout) => classifyBout(bout, awakeRecords, baseline));
}

// ── Helpers ──────────────────────────────────────────────

interface RawBout {
  start: Date;
  end: Date;
}

function filterAwakeRecords(
  records: HistoricalSensorRecord[],
  sleepDetections: SleepDetectionSummary[],
): HistoricalSensorRecord[] {
  if (sleepDetections.length === 0) return records;
  return records.filter((r) => {
    const ts = r.timestamp.getTime();
    return !sleepDetections.some(
      (d) => ts >= d.bedtime.getTime() && ts <= d.wakeTime.getTime(),
    );
  });
}

function computeGravityDeltas(records: HistoricalSensorRecord[]): number[] {
  const deltas: number[] = [0]; // First record has no delta
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const curr = records[i];
    if (
      prev.gravityX != null && prev.gravityY != null && prev.gravityZ != null &&
      curr.gravityX != null && curr.gravityY != null && curr.gravityZ != null
    ) {
      const dx = curr.gravityX - prev.gravityX;
      const dy = curr.gravityY - prev.gravityY;
      const dz = curr.gravityZ - prev.gravityZ;
      deltas.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    } else {
      deltas.push(1.0); // Missing data = assume active (matches reference)
    }
  }
  return deltas;
}

function segmentIntoBouts(
  records: HistoricalSensorRecord[],
  deltas: number[],
): RawBout[] {
  const bouts: RawBout[] = [];
  let inBout = false;
  let boutStart: Date | null = null;

  for (let i = 0; i < records.length; i++) {
    const isMoving = deltas[i] > MOTION_THRESHOLD;
    if (isMoving && !inBout) {
      inBout = true;
      boutStart = records[i].timestamp;
    } else if (!isMoving && inBout && boutStart) {
      bouts.push({ start: boutStart, end: records[i].timestamp });
      inBout = false;
      boutStart = null;
    }
  }

  // Close open bout
  if (inBout && boutStart) {
    bouts.push({ start: boutStart, end: records[records.length - 1].timestamp });
  }

  return bouts;
}

function mergeBouts(bouts: RawBout[], maxGapMs: number): RawBout[] {
  if (bouts.length === 0) return [];
  const merged: RawBout[] = [{ ...bouts[0] }];
  for (let i = 1; i < bouts.length; i++) {
    const last = merged[merged.length - 1];
    if (bouts[i].start.getTime() - last.end.getTime() <= maxGapMs) {
      last.end = bouts[i].end;
    } else {
      merged.push({ ...bouts[i] });
    }
  }
  return merged;
}

function classifyBout(
  bout: RawBout,
  allRecords: HistoricalSensorRecord[],
  baseline: BaselineProfile,
): ActivityBout {
  const startMs = bout.start.getTime();
  const endMs = bout.end.getTime();
  const boutRecords = allRecords.filter(
    (r) => r.timestamp.getTime() >= startMs && r.timestamp.getTime() <= endMs,
  );
  const durationMinutes = (endMs - startMs) / 60000;

  // Motion features
  const deltas = computeGravityDeltas(boutRecords);
  const motionIntensity = deltas.length > 0 ? average(deltas) : 0;
  const motionVariance = deltas.length >= 2 ? standardDeviation(deltas) : 0;
  const stillCount = deltas.filter((d) => d <= MOTION_THRESHOLD).length;
  const stillFraction = deltas.length > 0 ? stillCount / deltas.length : 1;

  // HR features
  const heartRates = boutRecords.map((r) => r.heartRate).filter((hr) => hr > 0);
  const hrMean = heartRates.length > 0 ? average(heartRates) : 0;
  const hrMax = heartRates.length > 0 ? Math.max(...heartRates) : 0;
  const restingHR = baseline.restingHeartRate > 0 ? baseline.restingHeartRate : 60;
  const maxHR = baseline.maxHeartRate ?? 190;
  const hrReserve = maxHR - restingHR;
  const hrZone = hrReserve > 0 ? Math.floor(((hrMean - restingHR) / hrReserve) * 5) : 0;

  // Cadence detection (dominant frequency of gravity magnitude oscillation)
  const cadenceHz = detectCadence(boutRecords);

  // Impact score (Z-axis peak-to-trough)
  const impactScore = computeImpactScore(boutRecords);

  // Classify
  let activityType: ActivityType;
  let confidence = 0.5;

  if (stillFraction > STILL_FRACTION_SEDENTARY) {
    activityType = 'Sedentary';
    confidence = 0.9;
  } else if (motionIntensity < 0.02 && hrZone <= 1) {
    activityType = 'Rest';
    confidence = 0.7;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_RUNNING_LOW && cadenceHz <= CADENCE_RUNNING_HIGH &&
    impactScore > IMPACT_RUNNING
  ) {
    activityType = 'Running';
    confidence = 0.8;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_WALKING_LOW && cadenceHz <= CADENCE_WALKING_HIGH &&
    impactScore > IMPACT_WALKING
  ) {
    activityType = 'Walking';
    confidence = 0.7;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_CYCLING_LOW && cadenceHz <= CADENCE_CYCLING_HIGH &&
    impactScore < IMPACT_CYCLING_MAX &&
    hrZone >= 2
  ) {
    activityType = 'Cycling';
    confidence = 0.6;
  } else if (motionVariance > 0.5 && hrZone >= 3) {
    activityType = 'HIIT';
    confidence = 0.5;
  } else if (motionIntensity > 0.05 && motionVariance < 0.15) {
    activityType = 'Strength';
    confidence = 0.5;
  } else if (hrZone >= 2) {
    activityType = 'General Exercise';
    confidence = 0.4;
  } else {
    activityType = 'Light Activity';
    confidence = 0.4;
  }

  // Intensity from HR zone
  const intensity: 'light' | 'moderate' | 'hard' =
    hrZone >= 4 ? 'hard' : hrZone >= 2 ? 'moderate' : 'light';

  // Per-bout strain (TRIMP)
  const strainScore = computeBoutStrain(heartRates, restingHR, maxHR);

  return {
    startTime: bout.start,
    endTime: bout.end,
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    activityType,
    intensity,
    confidence: Math.round(confidence * 100) / 100,
    heartRateAvg: Math.round(hrMean),
    heartRateMax: hrMax,
    strainScore: Math.round(strainScore * 10) / 10,
    cadenceHz: cadenceHz != null ? Math.round(cadenceHz * 100) / 100 : null,
  };
}

/**
 * Detect dominant cadence frequency from gravity magnitude oscillations.
 * Uses zero-crossing counting as a simple frequency estimator.
 */
function detectCadence(records: HistoricalSensorRecord[]): number | null {
  if (records.length < 30) return null;

  // Compute gravity magnitude time series
  const magnitudes: number[] = [];
  for (const r of records) {
    if (r.gravityX != null && r.gravityY != null && r.gravityZ != null) {
      magnitudes.push(Math.sqrt(r.gravityX ** 2 + r.gravityY ** 2 + r.gravityZ ** 2));
    }
  }
  if (magnitudes.length < 30) return null;

  // Remove DC (mean) to get oscillation
  const mean = average(magnitudes);
  const centered = magnitudes.map((m) => m - mean);

  // Count zero crossings
  let crossings = 0;
  for (let i = 1; i < centered.length; i++) {
    if ((centered[i - 1] < 0 && centered[i] >= 0) || (centered[i - 1] >= 0 && centered[i] < 0)) {
      crossings++;
    }
  }

  // Estimate sample rate from timestamps
  const totalSeconds =
    (records[records.length - 1].timestamp.getTime() - records[0].timestamp.getTime()) / 1000;
  if (totalSeconds <= 0) return null;

  // Frequency = crossings / (2 * duration) — each full cycle has 2 crossings
  const freqHz = crossings / (2 * totalSeconds);

  // Only return if in plausible human movement range (0.5 - 4 Hz)
  return freqHz >= 0.5 && freqHz <= 4.0 ? freqHz : null;
}

/**
 * Compute impact score from Z-axis gravity peak-to-trough amplitude.
 */
function computeImpactScore(records: HistoricalSensorRecord[]): number {
  const zValues = records
    .map((r) => r.gravityZ)
    .filter((z): z is number => z != null);
  if (zValues.length < 10) return 0;

  // Use interquartile range-style: 95th percentile - 5th percentile
  const sorted = [...zValues].sort((a, b) => a - b);
  const p5 = sorted[Math.floor(sorted.length * 0.05)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return Math.abs(p95 - p5);
}

/**
 * Compute TRIMP strain for a bout's HR samples.
 */
function computeBoutStrain(
  heartRates: number[],
  restingHR: number,
  maxHR: number,
): number {
  if (heartRates.length < 600) return 0; // 10 min @ 1Hz minimum (matches reference)

  const hrReserve = maxHR - restingHR;
  if (hrReserve <= 0) return 0;

  let trimp = 0;
  const sampleDurationMin = 1 / 60; // Assume ~1 second per sample

  for (const hr of heartRates) {
    const pctHRR = ((hr - restingHR) / hrReserve) * 100;
    let weight = 0;
    if (pctHRR >= 90) weight = 5;
    else if (pctHRR >= 80) weight = 4;
    else if (pctHRR >= 70) weight = 3;
    else if (pctHRR >= 60) weight = 2;
    else if (pctHRR >= 50) weight = 1;
    trimp += sampleDurationMin * weight;
  }

  return Math.min(21, (21 * Math.log(trimp + 1)) / STRAIN_LN_7201);
}
