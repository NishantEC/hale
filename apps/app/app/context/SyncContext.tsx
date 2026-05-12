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
import { drainLoop } from "@/services/sync/uplinkDrainer"

type SyncContextValue = {
  isOnline: boolean
  isSyncing: boolean
  lastDrainAt: number | null
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
  const [lastDrainAt, setLastDrainAt] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [deadCount, setDeadCount] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)

  const isOnlineRef = useRef(false)
  const isLowPowerRef = useRef(false)
  const isDrainingRef = useRef(false)

  const drainFn = useCallback(async () => {
    if (isDrainingRef.current) return
    if (!peekActiveUserId()) return
    if (!isOnlineRef.current) return
    if (isLowPowerRef.current) return

    isDrainingRef.current = true

    const db = openDatabase()
    setIsSyncing(true)
    setSyncError(null)
    try {
      await drainLoop(db, {
        post: (tableName, payloads) =>
          apiPost("/pipeline/ingest-table", { tableName, rows: payloads }),
        batchSize: 200,
      })
      setLastDrainAt(Date.now())

      const [pending, dead] = await Promise.all([
        queueDepth(db),
        listDeadLetters(db).then((rows) => rows.length),
      ])
      setPendingCount(pending)
      setDeadCount(dead)
    } catch (err: any) {
      setSyncError(err?.message ?? "Sync failed")
    } finally {
      setIsSyncing(false)
      isDrainingRef.current = false
    }
  }, [])

  const pullFn = useCallback(async () => {
    if (!peekActiveUserId()) return
    if (!isOnlineRef.current) return
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
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([drainFn(), pullFn()])
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
      lastDrainAt,
      pendingCount,
      deadCount,
      syncError,
      refresh,
    }),
    [isOnline, isSyncing, lastDrainAt, pendingCount, deadCount, syncError, refresh],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) throw new Error("useSyncContext must be used within SyncProvider")
  return context
}
