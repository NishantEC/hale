import * as Battery from "expo-battery"
import * as Network from "expo-network"
import * as Updates from "expo-updates"
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

import { peekActiveUserId } from "@/services/db/session"
import { openDatabase } from "@/services/db"
import { apiGet, apiPost } from "@/services/api/noopClient"
import { pullDownlink } from "@/services/sync/downlinkPuller"
import { sweepRetention } from "@/services/sync/retentionSweeper"
import { drainLoop } from "@/services/sync/uplinkDrainer"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import { registerBackgroundCatchupTask } from "@/services/sync/backgroundCatchupTask"
import { setViewCache } from "@/services/db/repositories/viewCache"
import {
  DEFAULT_RAW_RETENTION_DAYS,
  SETTING_RAW_RETENTION_DAYS,
  getSetting,
} from "@/services/db/repositories/settings"
import { SyncService } from "@/services/sync/SyncService"

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

  const isOnlineRef = useRef(true)
  const isLowPowerRef = useRef(false)

  const drainFn = useCallback(async () => {
    if (!peekActiveUserId()) return
    if (!isOnlineRef.current) return
    if (isLowPowerRef.current) return

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

      const { queueDepth, listDeadLetters } = await import(
        "@/services/db/repositories/outboundQueue"
      )
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
    }
  }, [])

  const pullFn = useCallback(async () => {
    if (!peekActiveUserId()) return
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
    const today = new Date().toISOString().slice(0, 10)
    try {
      const [home, sleep, trends] = await Promise.all([
        apiGet(`/views/home?date=${today}`),
        apiGet(`/views/sleep?date=${today}`),
        apiGet(`/views/trends?days=30`),
      ])
      await setViewCache(db, "home", today, home)
      await setViewCache(db, "sleep", today, sleep)
      await setViewCache(db, "trends", "30d", trends)
    } catch (err) {
      console.warn("[sync] view cache refresh failed", err)
    }
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
            Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) ||
            DEFAULT_RAW_RETENTION_DAYS
          if (raw > 0) await sweepRetention(db, { rawDays: raw })
        } catch (err) {
          console.warn("[sync] retention sweep failed", err)
        }
        try {
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
