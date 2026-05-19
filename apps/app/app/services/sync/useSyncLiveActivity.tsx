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

import { useBle } from "@/context/BleContext"
import { useSyncContext } from "@/context/SyncContext"
import { syncLiveActivity } from "./liveActivity"

function progressFraction(
  bleIsSyncing: boolean,
  syncIteration: number,
  syncIterationCap: number,
  queueIsSyncing: boolean,
  pendingCount: number,
  pendingAtStart: number,
): number | undefined {
  if (bleIsSyncing && syncIterationCap > 0) {
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
    if (syncIteration > 0 && syncIterationCap > 0) {
      return `Pass ${syncIteration} of ${syncIterationCap}${syncStage ? ` · ${syncStage}` : ""}`
    }
    return syncStage || undefined
  }
  if (queueIsSyncing && pendingCount > 0) {
    return `${pendingCount} record${pendingCount === 1 ? "" : "s"} left`
  }
  return undefined
}

export const SyncLiveActivityBridge: FC = () => {
  const ble = useBle()
  const sync = useSyncContext()

  // Track the queue's starting depth so we can derive a 0..1 progress for the
  // drain phase. Reset on each new run.
  const pendingAtStartRef = useRef(0)
  const wasSyncingRef = useRef(false)

  const anySyncing = ble.isSyncing || sync.isSyncing

  useEffect(() => {
    if (anySyncing && !wasSyncingRef.current) {
      // Edge: idle → syncing. Start activity.
      pendingAtStartRef.current = sync.pendingCount
      syncLiveActivity.start({
        title: ble.isSyncing ? "Syncing strap" : "Uploading",
        subtitle: subtitleFor(
          ble.isSyncing,
          ble.syncStage,
          ble.syncIteration,
          ble.syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
        ),
        progress: progressFraction(
          ble.isSyncing,
          ble.syncIteration,
          ble.syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
          pendingAtStartRef.current,
        ),
      })
      wasSyncingRef.current = true
    } else if (anySyncing && wasSyncingRef.current) {
      // Mid-run update.
      syncLiveActivity.update({
        title: ble.isSyncing ? "Syncing strap" : "Uploading",
        subtitle: subtitleFor(
          ble.isSyncing,
          ble.syncStage,
          ble.syncIteration,
          ble.syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
        ),
        progress: progressFraction(
          ble.isSyncing,
          ble.syncIteration,
          ble.syncIterationCap,
          sync.isSyncing,
          sync.pendingCount,
          pendingAtStartRef.current,
        ),
      })
    } else if (!anySyncing && wasSyncingRef.current) {
      // Edge: syncing → idle. Terminal payload.
      const failed = sync.syncError != null || ble.error != null
      if (failed) {
        syncLiveActivity.stop({
          title: "Sync failed",
          subtitle: sync.syncError ?? ble.error ?? "Try again from Inspector",
          progress: 1,
        })
      } else {
        const s = ble.syncSummary
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
    }
  }, [
    anySyncing,
    ble.isSyncing,
    ble.syncIteration,
    ble.syncIterationCap,
    ble.syncStage,
    ble.syncSummary,
    ble.error,
    sync.isSyncing,
    sync.pendingCount,
    sync.syncError,
  ])

  return null
}
