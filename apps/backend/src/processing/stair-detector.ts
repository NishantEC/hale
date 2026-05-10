/**
 * Stair-climbing detector.
 *
 * Reclassifies short Walking / Light-Activity bouts as Stair Climbing Up
 * or Down when:
 *  - The day has Apple HealthKit flightsClimbed > 0
 *  - The bout's gravity-Z signal shows the elevated peak-to-trough
 *    amplitude characteristic of stair stepping (vs flat ground walking)
 *  - The bout is short (1–10 min) — long sustained climbs are Hiking
 *
 * Direction (up vs down) is inferred from heart-rate trajectory:
 *  - Up: HR rises during the bout (concentric, harder)
 *  - Down: HR falls or stays flat (eccentric, easier)
 *
 * Apple's flightsClimbed isn't time-stamped per flight, so for a given day
 * we apportion to bouts that look like stair signatures (high vertical impact
 * + short duration). The detector accepts a list of candidate bouts and
 * reclassifies each.
 */

import type { ActivityBout } from './activity-detector.js';
import type { HistoricalSensorRecord } from './interfaces.js';
import { average } from './utils.js';

const MIN_STAIR_MINUTES = 1;
const MAX_STAIR_MINUTES = 10;
const MIN_DAY_FLIGHTS = 1;
// Threshold for the vertical impact ratio that distinguishes stair climbing
// from flat walking. Calibrated from openwhoop reference data.
const STAIR_Z_PTP_THRESHOLD = 0.35;
const HR_TREND_SLOPE_PER_MIN = 0.6; // bpm/min — must rise faster than this for "up"

export interface StairContext {
  dayFlightsClimbed: number | null;
}

interface StairCandidate {
  bout: ActivityBout;
  zPtp: number;
  hrSlope: number;
}

export function reclassifyStairs(
  bouts: ActivityBout[],
  records: HistoricalSensorRecord[],
  ctx: StairContext,
): ActivityBout[] {
  const dayFlights = ctx.dayFlightsClimbed ?? 0;
  if (dayFlights < MIN_DAY_FLIGHTS) return bouts;

  // Build candidates: short walking-like bouts with stair-shaped Z signal.
  const candidates: StairCandidate[] = [];
  for (const bout of bouts) {
    if (
      bout.activityType !== 'Walking' &&
      bout.activityType !== 'Light Activity'
    ) {
      continue;
    }
    if (bout.durationMinutes < MIN_STAIR_MINUTES) continue;
    if (bout.durationMinutes > MAX_STAIR_MINUTES) continue;

    const startMs = bout.startTime.getTime();
    const endMs = bout.endTime.getTime();
    const inBout = records.filter(
      (r) => r.timestamp.getTime() >= startMs && r.timestamp.getTime() <= endMs,
    );
    if (inBout.length < 30) continue;

    const zPtp = computeZPeakToTrough(inBout);
    if (zPtp < STAIR_Z_PTP_THRESHOLD) continue;

    const hrSlope = computeHrSlope(inBout);
    candidates.push({ bout, zPtp, hrSlope });
  }

  if (candidates.length === 0) return bouts;

  // Apportion day flights to candidates by share of (zPtp × duration).
  const totalWeight = candidates.reduce(
    (s, c) => s + c.zPtp * c.bout.durationMinutes,
    0,
  );
  const candidateById = new Map<string, ActivityBout>();
  for (const c of candidates) {
    const share =
      totalWeight > 0 ? (c.zPtp * c.bout.durationMinutes) / totalWeight : 0;
    const flightsInBout = Math.max(1, Math.round(dayFlights * share));
    const elevationGainMeters = flightsInBout * 3;
    const isUp = c.hrSlope >= HR_TREND_SLOPE_PER_MIN;
    const confidence = Math.min(0.85, 0.55 + c.zPtp * 0.4);

    candidateById.set(boutKey(c.bout), {
      ...c.bout,
      activityType: isUp ? 'Stair Climbing Up' : 'Stair Climbing Down',
      confidence: Math.round(confidence * 100) / 100,
      flightsCount: flightsInBout,
      elevationGainMeters,
    });
  }

  return bouts.map((b) => candidateById.get(boutKey(b)) ?? b);
}

function boutKey(b: ActivityBout): string {
  return `${b.startTime.getTime()}-${b.endTime.getTime()}`;
}

function computeZPeakToTrough(records: HistoricalSensorRecord[]): number {
  const zValues = records
    .map((r) => r.gravityZ)
    .filter((z): z is number => z != null);
  if (zValues.length < 10) return 0;
  const mean = average(zValues);
  const centered = zValues.map((z) => z - mean);
  return Math.max(...centered) - Math.min(...centered);
}

/**
 * Linear-fit HR slope (bpm per minute) over the bout. Positive = HR rising.
 */
function computeHrSlope(records: HistoricalSensorRecord[]): number {
  const points: Array<{ tMin: number; hr: number }> = [];
  const t0 = records[0].timestamp.getTime();
  for (const r of records) {
    if (r.heartRate > 0) {
      points.push({ tMin: (r.timestamp.getTime() - t0) / 60000, hr: r.heartRate });
    }
  }
  if (points.length < 5) return 0;

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.tMin, 0);
  const sumY = points.reduce((s, p) => s + p.hr, 0);
  const sumXY = points.reduce((s, p) => s + p.tMin * p.hr, 0);
  const sumX2 = points.reduce((s, p) => s + p.tMin * p.tMin, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
