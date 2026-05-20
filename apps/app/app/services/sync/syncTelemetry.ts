// In-process telemetry singleton: drainLoop writes to it after each
// pass, the DebugInspector reads from it. Lives only as long as the JS
// VM (foreground app process), which is exactly what we want for a
// runtime health panel — durable history goes to console_logs / Sentry.

import { reportError } from "../observability/sentry"
import { appendLog } from "../observability/persistentLog"

export type DrainOutcomeRecord = {
  at: number
  durationMs: number
  drained: number
  failed: number
  error: string | null
  oldestPendingAt: number | null
  skipped: "locked" | null
  holder: string
}

export type PersistFailureRecord = {
  at: number
  source: "persistAndAck" | "persistAndFinish"
  trimValue: number
  batchSize: number
  message: string
}

export type ApiFailureKind = "timeout" | "network" | "server"

export type ApiFailureRecord = {
  at: number
  method: string
  path: string
  kind: ApiFailureKind
  message: string
  status?: number | null
}

// Per-syncNow invocation. The "Recent syncs" Inspector section reads this
// — gives a fast read on whether sessions are stopping for the right
// reasons (no_records / caught_up) vs error / stuck_cursor. "iter_cap"
// remains in the union so old persisted sessions still decode after the
// 20-loop iteration cap was removed.
export type SyncSession = {
  startedAt: number
  durationMs: number
  iterations: number
  stopReason:
    | "no_records"
    | "caught_up"
    | "stuck_cursor"
    | "iter_cap"
    | "continue"
    | "error"
  oldestBatchMs: number | null
  newestBatchMs: number | null
  recordsPulled: number
  error: string | null
}

// Auto-detected time gap between adjacent raw_sensor_records. Fires
// after each successful sync; we scan the last 6h of records for any
// jump > 5 min and surface it in the Inspector.
export type DetectedGap = {
  detectedAt: number
  fromMs: number
  toMs: number
  durationMinutes: number
}

// One per HistoricalDataAck (cmd 23) we send. Captures whether the strap
// emitted a CommandResponse for it, what bytes it returned, and how long
// we waited. The whole point is to determine *empirically* whether the
// strap actually consumed our trim — investigation H1 vs auto-trim
// hypothesis (see docs/whoop-trim-ack-investigation.md).
export type AckResponse = {
  at: number
  trimValue: number
  durationMs: number
  // null = timed out waiting for response (most informative case if it
  // happens consistently — means the strap is NOT acknowledging the ack).
  responseHex: string | null
  // First two bytes parsed: bytes[0] = the ack origin-seq we echoed back,
  // bytes[1] = the strap's status byte (0 = OK, non-zero per whoopsi RE
  // notes = some kind of error). null when no response arrived.
  originSeq: number | null
  status: number | null
}

const MAX_DRAIN_HISTORY = 20
const MAX_PERSIST_FAILURES = 10
const MAX_API_FAILURES = 10
const MAX_SYNC_SESSIONS = 20
const MAX_DETECTED_GAPS = 20
const MAX_ACK_RESPONSES = 30
const PERSIST_FAILURE_REPORT_INTERVAL_MS = 60_000
const API_FAILURE_REPORT_INTERVAL_MS = 60_000

let lastDrain: DrainOutcomeRecord | null = null
let drainHistory: DrainOutcomeRecord[] = []
let lastPipelineRunAt: number | null = null
let lastPipelineDurationMs: number | null = null
let persistFailures: PersistFailureRecord[] = []
let lastPersistFailureReportAt = 0
let apiFailures: ApiFailureRecord[] = []
let lastApiFailureReportAt = 0
let syncSessions: SyncSession[] = []
let detectedGaps: DetectedGap[] = []
let ackResponses: AckResponse[] = []
let ackSent = 0
let ackResponded = 0
let ackTimedOut = 0
let ackRejected = 0

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) {
    try {
      l()
    } catch (err) {
      console.warn("[syncTelemetry] listener threw", err)
    }
  }
}

export function recordDrainOutcome(rec: DrainOutcomeRecord): void {
  lastDrain = rec
  drainHistory = [rec, ...drainHistory].slice(0, MAX_DRAIN_HISTORY)
  emit()
}

export function recordPipelineRun(at: number, durationMs: number): void {
  lastPipelineRunAt = at
  lastPipelineDurationMs = durationMs
  emit()
}

export function recordPersistFailure(rec: PersistFailureRecord): void {
  persistFailures = [rec, ...persistFailures].slice(0, MAX_PERSIST_FAILURES)
  console.warn(
    "[syncTelemetry] persist failure:",
    rec.source,
    "trim=", rec.trimValue,
    "batch=", rec.batchSize,
    "msg=", rec.message,
  )
  appendLog("error", "persist", "persistBatch failed", {
    source: rec.source,
    trimValue: rec.trimValue,
    batchSize: rec.batchSize,
    message: rec.message,
  })
  const now = Date.now()
  if (now - lastPersistFailureReportAt >= PERSIST_FAILURE_REPORT_INTERVAL_MS) {
    lastPersistFailureReportAt = now
    reportError(new Error(`persistBatch failed: ${rec.message}`), {
      source: rec.source,
      trimValue: rec.trimValue,
      batchSize: rec.batchSize,
    })
  }
  emit()
}

export function recordApiFailure(rec: ApiFailureRecord): void {
  apiFailures = [rec, ...apiFailures].slice(0, MAX_API_FAILURES)
  console.warn(
    "[syncTelemetry] api failure:",
    rec.kind,
    rec.method,
    rec.path,
    rec.status != null ? `status=${rec.status}` : "",
    "msg=", rec.message,
  )
  appendLog("error", "api", `${rec.method} ${rec.path}`, {
    kind: rec.kind,
    status: rec.status ?? null,
    message: rec.message,
  })
  const now = Date.now()
  if (now - lastApiFailureReportAt >= API_FAILURE_REPORT_INTERVAL_MS) {
    lastApiFailureReportAt = now
    reportError(new Error(`api failure: ${rec.method} ${rec.path}: ${rec.message}`), {
      kind: rec.kind,
      method: rec.method,
      path: rec.path,
      status: rec.status ?? null,
    })
  }
  emit()
}

export function recordSyncSession(rec: SyncSession): void {
  syncSessions = [rec, ...syncSessions].slice(0, MAX_SYNC_SESSIONS)
  appendLog(rec.error ? "error" : "info", "sync", `session ${rec.stopReason}`, {
    durationMs: rec.durationMs,
    iterations: rec.iterations,
    recordsPulled: rec.recordsPulled,
    oldestBatchMs: rec.oldestBatchMs,
    newestBatchMs: rec.newestBatchMs,
    error: rec.error,
  })
  emit()
}

export function recordDetectedGap(rec: DetectedGap): void {
  // Deduplicate — gap detector runs on every sync, but the SAME gap
  // (fromMs+toMs) shouldn't be re-recorded once it's already in the list.
  const exists = detectedGaps.some(
    (g) => g.fromMs === rec.fromMs && g.toMs === rec.toMs,
  )
  if (exists) return
  detectedGaps = [rec, ...detectedGaps].slice(0, MAX_DETECTED_GAPS)
  console.warn(
    "[syncTelemetry] gap detected:",
    new Date(rec.fromMs).toISOString(),
    "→",
    new Date(rec.toMs).toISOString(),
    `(${rec.durationMinutes.toFixed(1)}m)`,
  )
  appendLog("warn", "sync", "gap detected", {
    fromMs: rec.fromMs,
    toMs: rec.toMs,
    durationMinutes: rec.durationMinutes,
  })
  emit()
}

export function recordAckResponse(rec: AckResponse): void {
  ackResponses = [rec, ...ackResponses].slice(0, MAX_ACK_RESPONSES)
  ackSent += 1
  if (rec.responseHex == null) {
    ackTimedOut += 1
  } else {
    ackResponded += 1
    // status byte != 0 is treated as a rejection per whoopsi convention.
    if (rec.status != null && rec.status !== 0) ackRejected += 1
  }
  appendLog(rec.responseHex == null ? "warn" : "info", "ble", "ack response", {
    trimValue: rec.trimValue,
    durationMs: rec.durationMs,
    responseHex: rec.responseHex,
    originSeq: rec.originSeq,
    status: rec.status,
  })
  emit()
}

export function getSyncTelemetry() {
  return {
    lastDrain,
    drainHistory,
    lastPipelineRunAt,
    lastPipelineDurationMs,
    persistFailures,
    apiFailures,
    syncSessions,
    detectedGaps,
    ackResponses,
    ackCounters: {
      sent: ackSent,
      responded: ackResponded,
      timedOut: ackTimedOut,
      rejected: ackRejected,
    },
  }
}

export function subscribeSyncTelemetry(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
