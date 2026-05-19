export type ContinueSyncReason =
  | "no_records"
  | "caught_up"
  | "stuck_cursor"
  | "iter_cap"
  | "continue"

export type ContinueSyncInput = {
  iterationRecords: number
  prevNewestMs: number | null
  currentNewestMs: number | null
  stuckCount: number
  iterations: number
  nowMs: number
  maxIterations: number
  caughtUpWindowMs: number
}

export type ContinueSyncDecision = {
  stop: boolean
  reason: ContinueSyncReason
  stuckThisIteration: boolean
}

export const DEFAULT_MAX_ITERATIONS = 20
export const DEFAULT_CAUGHT_UP_WINDOW_MS = 5 * 60_000

export function decideContinueSync(input: ContinueSyncInput): ContinueSyncDecision {
  const stuckThisIteration =
    input.currentNewestMs != null &&
    input.prevNewestMs != null &&
    input.currentNewestMs <= input.prevNewestMs

  if (input.iterationRecords === 0) {
    return { stop: true, reason: "no_records", stuckThisIteration }
  }

  if (
    input.currentNewestMs != null &&
    input.currentNewestMs >= input.nowMs - input.caughtUpWindowMs
  ) {
    return { stop: true, reason: "caught_up", stuckThisIteration }
  }

  if (stuckThisIteration && input.stuckCount + 1 >= 2) {
    return { stop: true, reason: "stuck_cursor", stuckThisIteration }
  }

  if (input.iterations >= input.maxIterations) {
    return { stop: true, reason: "iter_cap", stuckThisIteration }
  }

  return { stop: false, reason: "continue", stuckThisIteration }
}
