/**
 * Hiking detector.
 *
 * Reclassifies a Walking bout as Hiking when it co-occurs with sustained
 * elevation gain — proxied via Apple Health flightsClimbed for the same day,
 * because the WHOOP strap has no barometer.
 *
 * Heuristic:
 *  - Bout must already be classified Walking
 *  - Duration ≥ 20 min
 *  - Day's flightsClimbed ≥ 10 (≈ 30 m of elevation gain)
 *  - Average HR ≥ baseline + 15 bpm (working harder than flat walking)
 *
 * If matched, the bout is upgraded to Hiking and tagged with an estimated
 * elevationGainMeters proportional to the share of day-flights that fell in
 * this bout's window. (Apple's flightsClimbed isn't time-stamped per flight,
 * so we apportion by duration relative to the user's total walking time.)
 */

import type { ActivityBout } from './activity-detector.js';

const MIN_HIKING_MINUTES = 20;
const MIN_DAY_FLIGHTS = 10;
const HR_OVER_BASELINE = 15;
const METERS_PER_FLIGHT = 3;

export interface HikingContext {
  /** Apple HealthKit flightsClimbed for the day this bout fell on. */
  dayFlightsClimbed: number | null;
  /** Sum of minutes across the day's Walking bouts (for elevation apportioning). */
  dayWalkingMinutes: number;
  /** User's resting HR — used as baseline. */
  restingHeartRate: number;
}

export function reclassifyHiking(
  bout: ActivityBout,
  ctx: HikingContext,
): ActivityBout {
  if (bout.activityType !== 'Walking') return bout;
  if (bout.durationMinutes < MIN_HIKING_MINUTES) return bout;

  const flights = ctx.dayFlightsClimbed ?? 0;
  if (flights < MIN_DAY_FLIGHTS) return bout;

  const baseline = ctx.restingHeartRate > 0 ? ctx.restingHeartRate : 60;
  if (bout.heartRateAvg < baseline + HR_OVER_BASELINE) return bout;

  // Apportion day-flights to this bout by share of walking minutes.
  const share =
    ctx.dayWalkingMinutes > 0 ? bout.durationMinutes / ctx.dayWalkingMinutes : 1;
  const flightsInBout = Math.max(1, Math.round(flights * share));
  const elevationGainMeters = flightsInBout * METERS_PER_FLIGHT;

  // Confidence scales with elevation gain — more flights = more confident.
  const confidence = Math.min(0.9, 0.6 + flightsInBout * 0.01);

  return {
    ...bout,
    activityType: 'Hiking',
    confidence: Math.round(confidence * 100) / 100,
    flightsCount: flightsInBout,
    elevationGainMeters,
  };
}
