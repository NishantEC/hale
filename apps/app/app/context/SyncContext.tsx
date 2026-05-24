import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"
import * as Battery from "expo-battery"
import * as Network from "expo-network"
import * as Updates from "expo-updates"

import { apiGet, apiPost } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { queueDepth, listDeadLetters } from "@/services/db/repositories/outboundQueue"
import {
  DEFAULT_RAW_RETENTION_DAYS,
  SETTING_RAW_RETENTION_DAYS,
  getSetting,
} from "@/services/db/repositories/settings"
import { peekActiveUserId } from "@/services/db/session"
import { registerBackgroundCatchupTask } from "@/services/sync/backgroundCatchupTask"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import { pullDownlink } from "@/services/sync/downlinkPuller"
import { refreshAllViews } from "@/services/sync/refreshAllViews"
import { sweepRetention } from "@/services/sync/retentionSweeper"
import { SyncService } from "@/services/sync/SyncService"
import {
  setLastDrainAt as setStoreLastDrainAt,
  setLastDrainOutcome as setStoreLastDrainOutcome,
} from "@/stores/drainTelemetryStore"
import { drainLoop, type DrainLoopOutcome } from "@/services/sync/uplinkDrainer"

// Cap a single foreground drain at 60s so it can't outlive the 90s drain-lock
// TTL. A genuinely-stuck drain would otherwise hold the lock while the
// background catchup tries to enter, racing the claim.
const FOREGROUND_DRAIN_MAX_MS = 60_000

type SyncContextValue = {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  deadCount: number
  syncError: string | null
  refresh: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export const SyncProvider: FC<PropsWithChildren<{ isDbReady: boolean }>> = ({
  children,
  isDbReady,
}) => {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [deadCount, setDeadCount] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  // lastDrainOutcome + lastDrainAt live in the drainTelemetry zustand store so
  // they don't churn every useSyncContext() consumer on each drain settle.
  const setLastDrainAt = setStoreLastDrainAt
  const setLastDrainOutcome = setStoreLastDrainOutcome

  const isOnlineRef = useRef(false)
  const isLowPowerRef = useRef(false)
  // Single-flight: when a drain is in flight, callers receive the same
  // promise instead of being silently dropped. Foreground resume can then
  // safely await the drain before triggering downlink pull.
  const drainPromiseRef = useRef<Promise<DrainLoopOutcome | null> | null>(null)
  const pullPromiseRef = useRef<Promise<void> | null>(null)

  const drainFn = useCallback(async (): Promise<DrainLoopOutcome | null> => {
    if (drainPromiseRef.current) return drainPromiseRef.current
    if (!peekActiveUserId()) return null
    if (!isOnlineRef.current) return null
    if (isLowPowerRef.current) return null

    const p = (async (): Promise<DrainLoopOutcome | null> => {
      setIsSyncing(true)
      let outcome: DrainLoopOutcome | null = null
      try {
        // openDatabase inside try so a throw doesn't pin drainPromiseRef.
        const db = openDatabase()
        outcome = await drainLoop(db, {
          post: (tableName, payloads) =>
            apiPost("/pipeline/ingest-table", { tableName, rows: payloads }, 60_000),
          batchSize: 200,
          maxMs: FOREGROUND_DRAIN_MAX_MS,
          holder: "foreground",
        })

        // Surface outcome to UI honestly. Three cases:
        //   - skipped: another drain held the lock; leave existing error
        //     state untouched and don't claim success.
        //   - failed > 0 || error: at least some rows didn't upload; show
        //     the error string so the activity strip flips to sync_error.
        //   - clean success: clear any stale error from a previous run.
        if (outcome.skipped !== "locked") {
          setLastDrainAt(Date.now())
          if (outcome.failed > 0 || outcome.error != null) {
            setSyncError(
              outcome.error ??
                `${outcome.failed} record${outcome.failed === 1 ? "" : "s"} didn't upload`,
            )
          } else {
            setSyncError(null)
          }
        }

        const [pending, dead] = await Promise.all([
          queueDepth(db),
          listDeadLetters(db).then((rows) => rows.length),
        ])
        setPendingCount(pending)
        setDeadCount(dead)
      } catch (err: any) {
        // drainLoop itself threw (e.g. SQLite open failure). Independent of
        // per-row failures captured in outcome.error.
        setSyncError(err?.message ?? "Sync failed")
      } finally {
        setIsSyncing(false)
        setLastDrainOutcome(outcome)
        drainPromiseRef.current = null
      }
      return outcome
    })()

    drainPromiseRef.current = p
    return p
  }, [])

  const pullFn = useCallback(async () => {
    // Single-flight: concurrent callers share the same in-flight pull so
    // setLastSyncAt writes can't race and rewind the downlink cursor.
    if (pullPromiseRef.current) return pullPromiseRef.current
    if (!peekActiveUserId()) return
    if (!isOnlineRef.current) return

    const p = (async () => {
      try {
        const db = openDatabase()
        await pullDownlink(db, {
          apiGet: async (path) => apiGet(path),
          tables: [
            "daily_metrics",
            "daily_scores",
            "sleep_detections",
            "sleep_stages",
            "night_features",
            "signal_samples",
            "activity_detections",
            "baseline_profile",
            "sleep_plans",
          ],
        })
        await refreshAllViews(db)
      } finally {
        pullPromiseRef.current = null
      }
    })()

    pullPromiseRef.current = p
    return p
  }, [])

  // Sequential: drain THEN pull. A concurrent (Promise.all) pull on top of an
  // in-flight drain pulls stale server data before our uploads land. The
  // single-flight drainFn means concurrent callers share the same promise,
  // so sequential here doesn't cost an extra round-trip.
  const refresh = useCallback(async () => {
    await drainFn()
    await pullFn()
  }, [drainFn, pullFn])

  useEffect(() => {
    if (!isDbReady) return

    const svc = new SyncService({ drainFn, pullFn, intervalMs: 15_000 })
    svc.start()

    Network.getNetworkStateAsync().then((state) => {
      const online = state.isInternetReachable ?? true
      isOnlineRef.current = online
      setIsOnline(online)
    })
    const unsubNetwork = Network.addNetworkStateListener((state) => {
      const online = state.isInternetReachable ?? true
      isOnlineRef.current = online
      setIsOnline(online)
    })

    Battery.isLowPowerModeEnabledAsync().then((enabled) => {
      isLowPowerRef.current = enabled
    })
    const unsubBattery = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
      isLowPowerRef.current = lowPowerMode
    })

    registerBackgroundCatchupTask().catch((err) =>
      console.warn("[bg-catchup] register failed", err),
    )

    let isBackground = AppState.currentState !== "active"
    const appStateSub = AppState.addEventListener("change", async (next) => {
      const wasForeground = !isBackground
      isBackground = next !== "active"

      if (next === "active") {
        await svc.refresh()
        try {
          const db = openDatabase()
          const raw =
            Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) || DEFAULT_RAW_RETENTION_DAYS
          if (raw > 0) await sweepRetention(db, { rawDays: raw })
        } catch (err) {
          console.warn("[sync] retention sweep failed", err)
        }
        try {
          // Pre-fetch update silently; the bundle is applied on next cold launch.
          const update = await Updates.checkForUpdateAsync()
          if (update.isAvailable) await Updates.fetchUpdateAsync()
        } catch {
          // non-fatal
        }
      }

      if (wasForeground && isBackground) {
        runBackgroundDrain(15_000).catch((err) =>
          console.warn("[bg-flush-on-background] failed", err),
        )
      }
    })

    return () => {
      svc.stop()
      unsubNetwork.remove()
      unsubBattery.remove()
      appStateSub.remove()
    }
  }, [isDbReady, drainFn, pullFn])

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isSyncing,
      pendingCount,
      deadCount,
      syncError,
      refresh,
    }),
    [isOnline, isSyncing, pendingCount, deadCount, syncError, refresh],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) throw new Error("useSyncContext must be used within SyncProvider")
  return context
}
