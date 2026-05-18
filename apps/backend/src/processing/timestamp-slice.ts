// Binary-search slice helpers for arrays that are sorted ascending by
// `timestamp`. The pipeline's per-day loop used to do
// `arr.filter(p => p.timestamp >= start && p.timestamp < end)` once per
// reference day — O(N) per day × 45 days × 5+ filters per day made
// `stages.compute` spend up to 10 minutes for a single user's window.
// Switching to these helpers cuts per-day cost to O(log N + W).

import { average } from './utils';

export interface TimestampedLike {
  timestamp: Date;
}

// Returns the lowest index `i` such that arr[i].timestamp >= t. If every
// element is < t, returns arr.length. Standard lower_bound.
function lowerBound<T extends TimestampedLike>(arr: T[], t: Date): number {
  const target = t.getTime();
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].timestamp.getTime() < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// Half-open window: `[start, end)`. Returns the contiguous slice of the
// pre-sorted input whose timestamps fall in the window. Does not copy
// unless the caller mutates; this matches the existing `.filter()`
// contract since the loop bodies only read the elements.
export function sliceByTimestamp<T extends TimestampedLike>(
  arr: T[],
  start: Date,
  end: Date,
): T[] {
  if (arr.length === 0) return [];
  const lo = lowerBound(arr, start);
  if (lo >= arr.length) return [];
  const hi = lowerBound(arr, end);
  if (hi <= lo) return [];
  return arr.slice(lo, hi);
}

export function averageByTimestamp(
  arr: Array<TimestampedLike & { value: number }>,
  start: Date,
  end: Date,
): number | null {
  const slice = sliceByTimestamp(arr, start, end);
  if (slice.length === 0) return null;
  return average(slice.map((p) => p.value));
}

export function sumByTimestamp(
  arr: Array<TimestampedLike & { value: number }>,
  start: Date,
  end: Date,
): number {
  const slice = sliceByTimestamp(arr, start, end);
  let sum = 0;
  for (const p of slice) sum += p.value;
  return sum;
}
