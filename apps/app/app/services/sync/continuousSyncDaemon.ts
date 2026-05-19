// Continuous BLE pump. Goal: never let the strap's read pointer get ahead
// of our persistence. Polls the strap every `DEFAULT_INTERVAL_MS` to drain
// whatever has been written since the last tick. Uses the existing
// syncNow() so durable-ACK + skip-enqueue dedup still apply.

import { appendLog } from "../observability/persistentLog"
//
// Singleton: only one timer alive in the JS VM at any time. start() is
// idempotent — calling it again with a running daemon is a no-op.
//
// Lifecycle:
//   - Caller (BleContext) calls start() once the user is authenticated
//     AND the strap is connected.
//   - On disconnect / logout, caller invokes stop().
//   - On reconnect, caller calls start() again.
//
// iOS: piggy-backs on UIBackgroundModes 'bluetooth-central' already in
// Info.plist. The interval keeps firing while iOS keeps the JS runtime
// alive (typical screen-locked-in-pocket usage).
//
// Android: relies on the foreground service in androidForegroundService.ts
// keeping the JS thread alive. Daemon ticks inside the same runtime.

type DaemonState = {
  intervalId: ReturnType<typeof setInterval> | null
  isTicking: boolean
  startedAt: number | null
  lastTickAt: number | null
  ticks: number
  skippedBusy: number
  skippedDisconnected: number
}

const state: DaemonState = {
  intervalId: null,
  isTicking: false,
  startedAt: null,
  lastTickAt: null,
  ticks: 0,
  skippedBusy: 0,
  skippedDisconnected: 0,
}

export const DEFAULT_INTERVAL_MS = 30_000

export interface ContinuousSyncOptions {
  syncNow: () => Promise<void>
  isSyncingRef: { current: boolean }
  isConnected: () => boolean
  intervalMs?: number
}

export function startContinuousSyncDaemon(opts: ContinuousSyncOptions): void {
  if (state.intervalId != null) return

  const interval = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  state.startedAt = Date.now()

  const tick = async () => {
    if (state.isTicking) {
      state.skippedBusy += 1
      return
    }
    if (opts.isSyncingRef.current) {
      state.skippedBusy += 1
      return
    }
    if (!opts.isConnected()) {
      state.skippedDisconnected += 1
      return
    }
    state.isTicking = true
    state.ticks += 1
    state.lastTickAt = Date.now()
    try {
      await opts.syncNow()
    } catch (err) {
      console.warn("[continuousSyncDaemon] tick failed:", err)
    } finally {
      state.isTicking = false
    }
  }

  state.intervalId = setInterval(() => {
    void tick()
  }, interval)

  console.log(
    "[continuousSyncDaemon] started, interval=",
    interval,
    "ms",
  )
  appendLog("info", "daemon", "started", { intervalMs: interval })
}

export function stopContinuousSyncDaemon(): void {
  if (state.intervalId == null) return
  clearInterval(state.intervalId)
  state.intervalId = null
  console.log(
    "[continuousSyncDaemon] stopped after",
    state.ticks,
    "ticks (skipped: busy=",
    state.skippedBusy,
    ", disconnected=",
    state.skippedDisconnected,
    ")",
  )
  appendLog("info", "daemon", "stopped", {
    ticks: state.ticks,
    skippedBusy: state.skippedBusy,
    skippedDisconnected: state.skippedDisconnected,
  })
}

export function getContinuousSyncStats() {
  return {
    isRunning: state.intervalId != null,
    isTicking: state.isTicking,
    startedAt: state.startedAt,
    lastTickAt: state.lastTickAt,
    ticks: state.ticks,
    skippedBusy: state.skippedBusy,
    skippedDisconnected: state.skippedDisconnected,
  }
}
