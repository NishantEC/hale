/**
 * Observes the in-app sync lifecycle and mirrors it to a Live Activity.
 *
 * Edge model:
 *   - START on (idle → syncing) transition. "Syncing" covers both BLE pull
 *     and queue drain; whichever fires first owns the activity.
 *   - UPDATE on progress / counts changes while syncing.
 *   - STOP on (syncing → idle). Terminal payload depends on outcome:
 *       error    → "Sync failed" subtitle
 *       success  → "Synced N nights" if we have a summary, else "Synced"
 *
 * Returns nothing — side-effects only. Mount once at the top of the tree
 * inside both `BleProvider` and `SyncProvider`.
 */

import { FC, useEffect, useRef } from "react"
import { AppState, AppStateStatus } from "react-native"

import { useSyncContext } from "@/context/SyncContext"
import {
  useSyncError,
  useSyncIsRunning,
  useSyncIteration,
  useSyncIterationCap,
  useSyncStage,
  useSyncSummary,
} from "@/stores/syncStore"
import { syncLiveActivity } from "./liveActivity"

function progressFraction(
  bleIsSyncing: boolean,
  syncIteration: number,
  syncIterationCap: number,
  queueIsSyncing: boolean,
  pendingCount: number,
  pendingAtStart: number,
): number | undefined {
  // syncIterationCap defaults to Infinity (DEFAULT_MAX_ITERATIONS) — no
  // hard cap is enforced, so a fractional "iteration / cap" makes no sense
  // and would render as "Pass N of Infinity" with progress=0. Skip the
  // bar entirely in that case.
  if (bleIsSyncing && Number.isFinite(syncIterationCap) && syncIterationCap > 0) {
    return Math.min(1, syncIteration / syncIterationCap)
  }
  if (queueIsSyncing && pendingAtStart > 0) {
    return Math.min(1, 1 - pendingCount / pendingAtStart)
  }
  return undefined
}

function subtitleFor(
  bleIsSyncing: boolean,
  syncStage: string,
  syncIteration: number,
  syncIterationCap: number,
  queueIsSyncing: boolean,
  pendingCount: number,
): string | undefined {
  if (bleIsSyncing) {
    if (syncIteration > 0 && Number.isFinite(syncIterationCap) && syncIterationCap > 0) {
      return `Pass ${syncIteration} of ${syncIterationCap}${syncStage ? ` · ${syncStage}` : ""}`
    }
    if (syncIteration > 0) {
      return `Pass ${syncIteration}${syncStage ? ` · ${syncStage}` : ""}`
    }
    return syncStage || undefined
  }
  if (queueIsSyncing && pendingCount > 0) {
    return `${pendingCount} record${pendingCount === 1 ? "" : "s"} left`
  }
  return undefined
}

export const SyncLiveActivityBridge: FC = () => {
  const bleIsSyncing = useSyncIsRunning()
  const syncStage = useSyncStage()
  const syncIteration = useSyncIteration()
  const syncIterationCap = useSyncIterationCap()
  const syncSummary = useSyncSummary()
  const bleError = useSyncError()
  const sync = useSyncContext()

  // Track the queue's starting depth so we can derive a 0..1 progress for the
  // drain phase. Reset on each new run.
  const pendingAtStartRef = useRef(0)
  const wasSyncingRef = useRef(false)
  // Snapshot of the BLE error AT START of the current run. The terminal
  // payload checks whether the error is NEW since this run, not whether
  // ble.error happens to be set at the moment of stop — a stale error from
  // a previous BLE session was previously flagging successful queue-only
  // drains as "Sync failed".
  const bleErrorAtStartRef = useRef<string | null>(null)

  // Foreground-aware: the in-app ActivityStrip already shows this info while
  // the app is active. Live Activities only earn screen real estate when the
  // user has navigated away or locked the phone.
  const isBackgroundRef = useRef<boolean>(AppState.currentState !== "active")

  // Latest snapshot of the values the AppState listener needs. The listener
  // has empty deps (we don't want it rebinding on every signal tick), so
  // without this ref it would read stale values from the mount closure when
  // foreground→background fires mid-sync.
  const liveStateRef = useRef({
    bleIsSyncing,
    syncStage,
    syncIteration,
    syncIterationCap,
    queueIsSyncing: sync.isSyncing,
    pendingCount: sync.pendingCount,
  })
  liveStateRef.current = {
    bleIsSyncing,
    syncStage,
    syncIteration,
    syncIterationCap,
    queueIsSyncing: sync.isSyncing,
    pendingCount: sync.pendingCount,
  }

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const nowBackground = next !== "active"
      const wasBackground = isBackgroundRef.current
      isBackgroundRef.current = nowBackground

      if (!wasSyncingRef.current) return

      const live = liveStateRef.current

      if (!wasBackground && nowBackground) {
        // Foreground -> background mid-sync: spin up the activity now so the
        // user sees it on Lock Screen / Dynamic Island for the rest of the run.
        syncLiveActivity.start({
          title: live.bleIsSyncing ? "Syncing strap" : "Uploading",
          subtitle: subtitleFor(
            live.bleIsSyncing,
            live.syncStage,
            live.syncIteration,
            live.syncIterationCap,
            live.queueIsSyncing,
            live.pendingCount,
          ),
          progress: progressFraction(
            live.bleIsSyncing,
            live.syncIteration,
            live.syncIterationCap,
            live.queueIsSyncing,
            live.pendingCount,
            pendingAtStartRef.current,
          ),
        })
      } else if (wasBackground && !nowBackground) {
        // Background -> foreground mid-sync: tear the activity down. The
        // in-app strip takes over visibility from here.
        syncLiveActivity.stop({
          title: live.bleIsSyncing ? "Syncing strap" : "Uploading",
          progress: progressFraction(
            live.bleIsSyncing,
            live.syncIteration,
            live.syncIterationCap,
            live.queueIsSyncing,
            live.pendingCount,
            pendingAtStartRef.current,
          ),
        })
      }
    })
    return () => sub.remove()
    // Intentionally empty deps — the listener reads live refs. We don't want
    // this effect to tear down and rebuild on every signal tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const anySyncing = bleIsSyncing || sync.isSyncing

  useEffect(() => {
    if (anySyncing && !wasSyncingRef.current) {
      // Edge: idle → syncing. Mark the run as live; only start the activity
      // if we're already in the background (otherwise the AppState listener
      // will start it on the next foreground→background transition).
      pendingAtStartRef.current = sync.pendingCount
      // Snapshot whatever stale BLE error already exists so the terminal
      // payload can detect a NEW error vs. carrying one in from before.
      bleErrorAtStartRef.current = bleError ?? null
      wasSyncingRef.current = true
      if (isBackgroundRef.current) {
        syncLiveActivity.start({
          title: bleIsSyncing ? "Syncing strap" : "Uploading",
          subtitle: subtitleFor(
            bleIsSyncing,
            syncStage,
            syncIteration,
            syncIterationCap,
            sync.isSyncing,
            sync.pendingCount,
          ),
          progress: progressFraction(
            bleIsSyncing,
            syncIteration,
            syncIterationCap,
            sync.isSyncing,
            sync.pendingCount,
            pendingAtStartRef.current,
          ),
        })
      }
    } else if (anySyncing && wasSyncingRef.current) {
      // Mid-run update.
      syncLiveActivity.update({
        title: bleIsSyncing ? "Syncing strap" : "Uploading",
        subtitle: subtitleFor(
          bleIsSyncing,
          syncStage,
          syncIteration,
          syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
        ),
        progress: progressFraction(
          bleIsSyncing,
          syncIteration,
          syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
          pendingAtStartRef.current,
        ),
      })
    } else if (!anySyncing && wasSyncingRef.current) {
      // Edge: syncing → idle. Terminal payload.
      // syncError comes from the queue drain and is reset per drain, so it's
      // run-scoped. bleError is sticky on BleContext until cleared, so a
      // stale error from the previous BLE session would otherwise flag this
      // run as failed. Only count a NEW bleError that appeared during this
      // run as a current failure.
      const newBleError =
        bleError != null && bleError !== bleErrorAtStartRef.current ? bleError : null
      const failed = sync.syncError != null || newBleError != null
      if (failed) {
        syncLiveActivity.stop({
          title: "Sync failed",
          subtitle: sync.syncError ?? newBleError ?? "Try again from Inspector",
          progress: 1,
        })
      } else {
        const s = syncSummary
        const nights = s?.nights ?? 0
        const stages = s?.stages ?? 0
        syncLiveActivity.stop({
          title: "Synced",
          subtitle:
            nights > 0
              ? `${nights} night${nights === 1 ? "" : "s"} · ${stages} stages`
              : "Up to date",
          progress: 1,
        })
      }
      wasSyncingRef.current = false
      pendingAtStartRef.current = 0
      bleErrorAtStartRef.current = null
    }
  }, [
    anySyncing,
    bleIsSyncing,
    syncIteration,
    syncIterationCap,
    syncStage,
    syncSummary,
    bleError,
    sync.isSyncing,
    sync.pendingCount,
    sync.syncError,
  ])

  return null
}
