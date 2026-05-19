export type ShouldRunPipelineInput = {
  persistedCount: number
  isCurrentlyRunning: boolean
  msSinceLastRun: number
  significantThreshold?: number
  throttleMs?: number
}

export const DEFAULT_PIPELINE_SIGNIFICANT_THRESHOLD = 500
export const DEFAULT_PIPELINE_THROTTLE_MS = 60_000

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
