export type ContinueSyncReason =
  | "no_records"
  | "caught_up"
  | "stuck_cursor"
  | "continue"

export type ContinueSyncInput = {
  iterationRecords: number
  prevNewestMs: number | null
  currentNewestMs: number | null
  stuckCount: number
  iterations: number
  nowMs: number
  caughtUpWindowMs: number
}

export type ContinueSyncDecision = {
  stop: boolean
  reason: ContinueSyncReason
  stuckThisIteration: boolean
}

// Kept exported for backwards compat with callers that haven't migrated;
// no longer enforced inside decideContinueSync. iter_cap was a fixed-loop
// guard that fired prematurely once acks started working (each iteration
// drains ~17 records, so 20 passes = ~6 min of strap-time even when
// hundreds of minutes are queued). Real safeties remaining:
//   - DOWNLOAD_TIMEOUT_MS (120 s) inside HistoryDownloader caps any
//     single iteration's wall-clock to 2 min.
//   - stuck_cursor fires after 2 consecutive non-advancing iterations.
//   - no_records / caught_up stop on natural end-of-stream.
export const DEFAULT_MAX_ITERATIONS = Number.POSITIVE_INFINITY
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

  return { stop: false, reason: "continue", stuckThisIteration }
}
