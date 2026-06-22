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

import { openDatabase } from "@/services/db"
import { sweepRetention } from "@/services/sync/retentionSweeper"

// Cap a single foreground drain at 60s so it can't outlive the 90s drain-lock
// TTL. A genuinely-stuck drain would otherwise hold the lock while the
// background catchup tries to enter, racing the claim.
const FOREGROUND_DRAIN_MAX_MS = 60_000

type SyncContextValue = {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  deadCount: number
  lastDeadLetterError: string | null
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
  const [lastDeadLetterError, setLastDeadLetterError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const isOnlineRef = useRef(false)
  const isLowPowerRef = useRef(false)

  // Serverless: all data is computed + stored locally, so there is nothing to
  // drain to or pull from a server. `refresh` is kept (consumers like the
  // activity strip call it) but is a no-op.
  const refresh = useCallback(async () => {}, [])

  useEffect(() => {
    if (!isDbReady) return

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

    // On foreground: local retention cleanup + an OTA update check. No sync.
    const appStateSub = AppState.addEventListener("change", async (next) => {
      if (next !== "active") return
      try {
        const db = openDatabase()
        await sweepRetention(db)
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
    })

    return () => {
      unsubNetwork.remove()
      unsubBattery.remove()
      appStateSub.remove()
    }
  }, [isDbReady])

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isSyncing,
      pendingCount,
      deadCount,
      lastDeadLetterError,
      syncError,
      refresh,
    }),
    [isOnline, isSyncing, pendingCount, deadCount, lastDeadLetterError, syncError, refresh],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) throw new Error("useSyncContext must be used within SyncProvider")
  return context
}
