// In-process telemetry singleton: drainLoop writes to it after each
// pass, the DebugInspector reads from it. Lives only as long as the JS
// VM (foreground app process), which is exactly what we want for a
// runtime health panel — durable history goes to console_logs / Sentry.

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

const MAX_DRAIN_HISTORY = 20
let lastDrain: DrainOutcomeRecord | null = null
let drainHistory: DrainOutcomeRecord[] = []
let lastPipelineRunAt: number | null = null
let lastPipelineDurationMs: number | null = null

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

export function getSyncTelemetry() {
  return {
    lastDrain,
    drainHistory,
    lastPipelineRunAt,
    lastPipelineDurationMs,
  }
}

export function subscribeSyncTelemetry(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
