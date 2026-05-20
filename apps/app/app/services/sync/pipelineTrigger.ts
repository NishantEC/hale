export type ShouldRunPipelineInput = {
  persistedCount: number
  isCurrentlyRunning: boolean
  msSinceLastRun: number
  significantThreshold?: number
  throttleMs?: number
}

// Bumped from 500 → 2000 records on 2026-05-21 after observing the daemon
// firing /pipeline/run every 30 s when the strap-cursor bug caused tiny
// overlapping batches. With per-sync deliveries usually ≤ 1000 records,
// requiring 2000 keeps significant-batch auto-fires for the genuinely big
// post-disconnect pulls (not the 60-record drips).
export const DEFAULT_PIPELINE_SIGNIFICANT_THRESHOLD = 2_000
// Bumped from 60 s → 10 min. Pipeline already takes 10-25 s on the
// backend; firing it every sync was producing the 503/timeout storm seen
// in the 2026-05-20 logs.
export const DEFAULT_PIPELINE_THROTTLE_MS = 600_000

export function shouldRunPipelineAfterSync(input: ShouldRunPipelineInput): boolean {
  const {
    persistedCount,
    isCurrentlyRunning,
    msSinceLastRun,
    significantThreshold = DEFAULT_PIPELINE_SIGNIFICANT_THRESHOLD,
    throttleMs = DEFAULT_PIPELINE_THROTTLE_MS,
  } = input

  if (persistedCount <= 0) return false
  if (isCurrentlyRunning) return false
  if (persistedCount >= significantThreshold) return true
  return msSinceLastRun >= throttleMs
}
