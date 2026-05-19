// Pure helper: scan a list of raw_sensor_records timestamps (ms) and
// surface time-jumps that exceed GAP_THRESHOLD_MS. Used after each sync
// to populate syncTelemetry.detectedGaps so the Inspector can show
// "this minute is missing" without scraping the local SQLite by hand.

import type { DetectedGap } from "./syncTelemetry"

// 5 min. Any flat run of "phone idle" produces ≤ 1 missing minute per
// natural BLE backoff; 5 min is comfortably above the noise floor and
// catches the kind of multi-minute holes we see on cursor-skip bugs.
export const GAP_THRESHOLD_MS = 5 * 60_000

export function detectGaps(
  timestampsMs: number[],
): Array<Omit<DetectedGap, "detectedAt">> {
  if (timestampsMs.length < 2) return []
  const sorted = [...timestampsMs].sort((a, b) => a - b)
  const gaps: Array<Omit<DetectedGap, "detectedAt">> = []
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i] - sorted[i - 1]
    if (delta >= GAP_THRESHOLD_MS) {
      gaps.push({
        fromMs: sorted[i - 1],
        toMs: sorted[i],
        durationMinutes: delta / 60_000,
      })
    }
  }
  return gaps
}
