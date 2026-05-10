/**
 * HealthKit workout matcher.
 *
 * When a HealthKit workout overlaps a strap-detected bout, use it as a
 * ground-truth label: boost confidence and tag the bout with the
 * Apple-reported activity name + distance + energy.
 *
 * Apple's classifier (Apple Watch / iPhone CoreMotion) is generally more
 * reliable than ours for cycling, swimming, rowing — anything where the
 * wrist signature alone is ambiguous.
 */

import type { ActivityBout, ActivityType } from './activity-detector.js';

export interface HealthkitWorkoutWindow {
  uuid: string;
  activityName: string;
  startTime: Date;
  endTime: Date;
  totalDistanceMeters: number | null;
  totalEnergyKcal: number | null;
}

export function applyHealthkitWorkoutMatches(
  bouts: ActivityBout[],
  workouts: HealthkitWorkoutWindow[],
): ActivityBout[] {
  if (workouts.length === 0) return bouts;
  return bouts.map((bout) => {
    const match = findBestOverlap(bout, workouts);
    if (!match) return bout;

    const mappedType = mapAppleActivityToType(match.activityName);
    return {
      ...bout,
      // Override classification only if Apple's label is clearer than ours
      activityType: shouldOverride(bout.activityType, mappedType)
        ? mappedType
        : bout.activityType,
      confidence: Math.min(0.95, Math.max(bout.confidence, 0.85)),
      distanceMeters: match.totalDistanceMeters ?? bout.distanceMeters ?? null,
      externalSource: `apple:${match.activityName}`,
    };
  });
}

function findBestOverlap(
  bout: ActivityBout,
  workouts: HealthkitWorkoutWindow[],
): HealthkitWorkoutWindow | null {
  const boutStart = bout.startTime.getTime();
  const boutEnd = bout.endTime.getTime();
  const boutDuration = boutEnd - boutStart;
  let best: { w: HealthkitWorkoutWindow; overlap: number } | null = null;
  for (const w of workouts) {
    const wStart = w.startTime.getTime();
    const wEnd = w.endTime.getTime();
    const overlap = Math.max(0, Math.min(boutEnd, wEnd) - Math.max(boutStart, wStart));
    if (overlap < boutDuration * 0.5) continue; // require ≥50% overlap
    if (!best || overlap > best.overlap) best = { w, overlap };
  }
  return best?.w ?? null;
}

function shouldOverride(current: ActivityType, mapped: ActivityType): boolean {
  // Trust Apple over ourselves except for cases where our signal-based
  // classification is more specific (Stair Up/Down, Hiking — those need
  // elevation context Apple's workout type doesn't carry).
  if (current === 'Stair Climbing Up') return false;
  if (current === 'Stair Climbing Down') return false;
  if (current === 'Hiking') return false;
  // Avoid downgrading: if we've called it Running and Apple says Walking,
  // prefer our label (likely a brief slow segment within a run).
  if (current === 'Running' && mapped === 'Walking') return false;
  return true;
}

/**
 * Map Apple's HKWorkoutActivityType display name → our ActivityType.
 * Generated from packet-types iOS HKWorkoutActivityType enum.
 */
function mapAppleActivityToType(appleName: string): ActivityType {
  const n = appleName.toLowerCase();
  if (n.includes('running') || n === 'running' || n === 'indoor run') return 'Running';
  if (n.includes('walking') || n === 'walking' || n === 'indoor walk') return 'Walking';
  if (n === 'hiking') return 'Hiking';
  if (n === 'stairs' || n === 'stair climbing' || n === 'step training') {
    return 'Stair Climbing Up';
  }
  if (n.includes('cycling') || n === 'hand cycling' || n === 'indoor cycle') {
    return 'Cycling';
  }
  if (n === 'high intensity interval training') return 'HIIT';
  if (
    n === 'traditional strength' ||
    n === 'functional strength' ||
    n === 'core training'
  ) {
    return 'Strength';
  }
  if (n === 'cool down' || n === 'preparation & recovery') return 'Light Activity';
  return 'General Exercise';
}
