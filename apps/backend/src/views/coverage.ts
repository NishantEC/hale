export type Coverage = 'full' | 'partial' | 'none';

export const MIN_MINUTES_FOR_DATA = 10;

export const FULL_DAY_MINUTES_THRESHOLD = 1152;

export function coverageFromMinutes(minutes: number): Coverage {
  if (minutes < MIN_MINUTES_FOR_DATA) return 'none';
  if (minutes >= FULL_DAY_MINUTES_THRESHOLD) return 'full';
  return 'partial';
}
