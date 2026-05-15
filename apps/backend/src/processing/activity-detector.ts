/**
 * Activity detection from sensor data.
 *
 * Classifies non-sleep daytime periods into activity types using
 * gravity vectors, heart rate, and motion features.
 */

import type { HistoricalSensorRecord, SleepDetectionSummary, BaselineProfile } from './interfaces';
import { average, standardDeviation } from './utils';
import { fftRadix2, makeHannWindow } from './hrv-frequency.js';

// ── Types ────────────────────────────────────────────────

export type ActivityType =
  | 'Running'
  | 'Walking'
  | 'Hiking'
  | 'Stair Climbing Up'
  | 'Stair Climbing Down'
  | 'Cycling'
  | 'Strength'
  | 'HIIT'
  | 'General Exercise'
  | 'Light Activity'
  | 'Rest'
  | 'Sedentary'
  | 'Off-Wrist'
  | 'No Data';

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
  flightsCount?: number | null;
  elevationGainMeters?: number | null;
  distanceMeters?: number | null;
  externalSource?: string | null;
}

// ── Constants ────────────────────────────────────────────

const MOTION_THRESHOLD = 0.01;        // matches reference (openwhoop activity.py/rs)
const STILL_FRACTION_SEDENTARY = 0.85;
const MIN_BOUT_MINUTES = 3;
const MERGE_GAP_MINUTES = 5;
// Any gap larger than this between consecutive records means we lost data
// (BLE disconnect, off-wrist, etc.). Don't let a bout span the gap — it
// produces phantom multi-hour "Sedentary" entries when really there was
// nothing to classify.
const BOUT_DATA_GAP_BREAK_MS = 5 * 60 * 1000;
// Gaps at least this long warrant their own "Off-Wrist" / "No Data" entry
// on the activity feed so the user can see where coverage was lost.
const GAP_ENTRY_MIN_MS = 15 * 60 * 1000;
const STRAIN_LN_7201 = Math.log(7201);

// Cadence bands (Hz) — from FFT of gravity magnitude oscillations
const CADENCE_RUNNING_LOW = 2.3;
const CADENCE_RUNNING_HIGH = 3.7;
const CADENCE_WALKING_LOW = 1.5;
const CADENCE_WALKING_HIGH = 2.4;
const CADENCE_CYCLING_LOW = 0.8;
const CADENCE_CYCLING_HIGH = 2.0;

// ── Main entry point ─────────────────────────────────────

export interface OffWristIntervalLite {
  start: Date;
  end: Date;
  /** 'WristOff' or 'ChargingOn' if from a device event; null when inferred from a data gap alone. */
  source: 'WristOff' | 'ChargingOn' | null;
}

export function detectActivities(
  records: HistoricalSensorRecord[],
  sleepDetections: SleepDetectionSummary[],
  baseline: BaselineProfile,
  offWristIntervals: OffWristIntervalLite[] = [],
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

  const classified = validBouts.map((bout) => classifyBout(bout, awakeRecords, baseline));

  // Emit Off-Wrist / No-Data entries for gaps in awake records. These let
  // the user see where coverage was lost (charging, BLE drop, strap off)
  // instead of an invisible hole in the day.
  const gapBouts = detectGapEntries(awakeRecords, sleepDetections, offWristIntervals);

  return [...classified, ...gapBouts].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
}

function detectGapEntries(
  awakeRecords: HistoricalSensorRecord[],
  sleepDetections: SleepDetectionSummary[],
  offWristIntervals: OffWristIntervalLite[],
): ActivityBout[] {
  const entries: ActivityBout[] = [];
  // 1. Gaps inside the awake-records stream.
  for (let i = 1; i < awakeRecords.length; i++) {
    const gapMs =
      awakeRecords[i].timestamp.getTime() - awakeRecords[i - 1].timestamp.getTime();
    if (gapMs < GAP_ENTRY_MIN_MS) continue;
    const start = awakeRecords[i - 1].timestamp;
    const end = awakeRecords[i].timestamp;
    if (overlapsSleep(start, end, sleepDetections)) continue;
    const source = pickOffWristSource(start, end, offWristIntervals);
    entries.push(makeGapBout(start, end, source));
  }
  // 2. Off-wrist intervals reported by the device but with no surrounding
  // sensor records (rare — strap powered off completely). We still want
  // these to surface as off-wrist time.
  for (const interval of offWristIntervals) {
    if (interval.end.getTime() - interval.start.getTime() < GAP_ENTRY_MIN_MS) continue;
    if (overlapsAnyExisting(interval.start, interval.end, entries)) continue;
    if (overlapsSleep(interval.start, interval.end, sleepDetections)) continue;
    entries.push(makeGapBout(interval.start, interval.end, interval.source));
  }
  return entries;
}

function overlapsSleep(
  start: Date,
  end: Date,
  sleepDetections: SleepDetectionSummary[],
): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return sleepDetections.some(
    (d) => d.bedtime.getTime() <= e && d.wakeTime.getTime() >= s,
  );
}

function overlapsAnyExisting(start: Date, end: Date, bouts: ActivityBout[]): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return bouts.some(
    (b) => b.startTime.getTime() <= e && b.endTime.getTime() >= s,
  );
}

function pickOffWristSource(
  start: Date,
  end: Date,
  offWristIntervals: OffWristIntervalLite[],
): 'WristOff' | 'ChargingOn' | null {
  const s = start.getTime();
  const e = end.getTime();
  // Find an off-wrist interval whose middle falls inside the gap.
  const overlap = offWristIntervals.find(
    (i) =>
      i.start.getTime() <= e &&
      i.end.getTime() >= s &&
      i.source != null,
  );
  return overlap?.source ?? null;
}

function makeGapBout(
  start: Date,
  end: Date,
  source: 'WristOff' | 'ChargingOn' | null,
): ActivityBout {
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  const activityType: ActivityType = source != null ? 'Off-Wrist' : 'No Data';
  return {
    startTime: start,
    endTime: end,
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    activityType,
    intensity: 'light',
    confidence: source != null ? 0.95 : 0.6,
    heartRateAvg: 0,
    heartRateMax: 0,
    strainScore: 0,
    cadenceHz: null,
    flightsCount: null,
    elevationGainMeters: null,
    distanceMeters: null,
    externalSource: source != null ? `event:${source}` : null,
  };
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
  const BUFFER_MS = 10 * 60 * 1000; // 10-minute guard band
  return records.filter((r) => {
    const ts = r.timestamp.getTime();
    return !sleepDetections.some(
      (d) => ts >= (d.bedtime.getTime() - BUFFER_MS) && ts <= (d.wakeTime.getTime() + BUFFER_MS),
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
    // If there's a large gap between this record and the previous one,
    // force-close any open bout at the previous record's timestamp. This
    // prevents bouts from straddling BLE/off-wrist gaps and producing
    // phantom multi-hour entries.
    if (i > 0 && inBout && boutStart) {
      const gapMs = records[i].timestamp.getTime() - records[i - 1].timestamp.getTime();
      if (gapMs > BOUT_DATA_GAP_BREAK_MS) {
        bouts.push({ start: boutStart, end: records[i - 1].timestamp });
        inBout = false;
        boutStart = null;
      }
    }

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

  // Impact ratio (Z-axis peak-to-trough normalized by motion intensity)
  const impactRatio = computeImpactScore(boutRecords, motionIntensity);

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
    impactRatio > 3.0
  ) {
    activityType = 'Running';
    confidence = 0.8;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_WALKING_LOW && cadenceHz <= CADENCE_WALKING_HIGH &&
    impactRatio > 1.5
  ) {
    activityType = 'Walking';
    confidence = 0.7;
  } else if (
    cadenceHz != null &&
    cadenceHz >= CADENCE_CYCLING_LOW && cadenceHz <= CADENCE_CYCLING_HIGH &&
    impactRatio < 1.0 &&
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
  const strainScore = computeBoutStrain(boutRecords, restingHR, maxHR);

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

function detectCadence(records: HistoricalSensorRecord[]): number | null {
  if (records.length < 120) return null;

  const magnitudes: number[] = [];
  for (const r of records) {
    if (r.gravityX != null && r.gravityY != null && r.gravityZ != null) {
      magnitudes.push(Math.sqrt(r.gravityX ** 2 + r.gravityY ** 2 + r.gravityZ ** 2));
    }
  }
  if (magnitudes.length < 128) return null;

  // Estimate sample rate from timestamps
  const totalSeconds =
    (records[records.length - 1].timestamp.getTime() - records[0].timestamp.getTime()) / 1000;
  if (totalSeconds <= 0) return null;
  const sampleRate = magnitudes.length / totalSeconds;

  // Use last 256 samples (or pad to 256)
  const segmentSize = 256;
  const segment = new Float64Array(segmentSize);
  const hannWindow = makeHannWindow(segmentSize);
  const mean = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
  const start = Math.max(0, magnitudes.length - segmentSize);

  for (let i = 0; i < segmentSize; i++) {
    const idx = start + i;
    const val = idx < magnitudes.length ? magnitudes[idx] - mean : 0;
    segment[i] = val * hannWindow[i];
  }

  const { re, im } = fftRadix2(segment);

  // Find peak in cadence range (1.2-4.0 Hz)
  const freqResolution = sampleRate / segmentSize;
  let peakFreq = 0;
  let peakPower = 0;
  let totalPower = 0;

  for (let k = 0; k <= segmentSize / 2; k++) {
    const power = re[k] * re[k] + im[k] * im[k];
    totalPower += power;

    const freq = k * freqResolution;
    if (freq >= 1.2 && freq <= 4.0 && power > peakPower) {
      peakPower = power;
      peakFreq = freq;
    }
  }

  // Require peak to be significantly above noise floor
  const noiseFloor = totalPower / (segmentSize / 2 + 1);
  return peakPower > noiseFloor * 3 ? peakFreq : null;
}

/**
 * Compute impact score from Z-axis gravity peak-to-trough amplitude,
 * normalized by motion intensity — returns impact-to-motion ratio.
 */
function computeImpactScore(records: HistoricalSensorRecord[], motionIntensity: number): number {
  const zValues = records
    .map((r) => r.gravityZ)
    .filter((z): z is number => z != null);
  if (zValues.length < 10) return 0;

  const mean = average(zValues);
  const centered = zValues.map((z) => z - mean);
  const ptp = Math.max(...centered) - Math.min(...centered);

  // Normalize by motion intensity — returns impact-to-motion ratio
  return motionIntensity > 0.001 ? ptp / motionIntensity : 0;
}

/**
 * Compute TRIMP strain for a bout using actual record timestamps.
 */
function computeBoutStrain(
  boutRecords: HistoricalSensorRecord[],
  restingHR: number,
  maxHR: number,
): number {
  const valid = boutRecords.filter((r) => r.heartRate > 0);
  if (valid.length < 600) return 0; // 10 min @ 1Hz minimum

  const hrReserve = maxHR - restingHR;
  if (hrReserve <= 0) return 0;

  let trimp = 0;
  for (let i = 1; i < valid.length; i++) {
    const dtMs = valid[i].timestamp.getTime() - valid[i - 1].timestamp.getTime();
    const dtMinutes = Math.max(1 / 60, Math.min(5, dtMs / 60000));

    const pctHRR = ((valid[i].heartRate - restingHR) / hrReserve) * 100;
    let weight = 0;
    if (pctHRR >= 90) weight = 5;
    else if (pctHRR >= 80) weight = 4;
    else if (pctHRR >= 70) weight = 3;
    else if (pctHRR >= 60) weight = 2;
    else if (pctHRR >= 50) weight = 1;
    trimp += dtMinutes * weight;
  }

  return Math.min(21, (21 * Math.log(trimp + 1)) / STRAIN_LN_7201);
}
