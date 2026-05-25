import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Linking } from "react-native"
import { router } from "expo-router"
import * as Battery from "expo-battery"
import * as Haptics from "expo-haptics"
import * as Updates from "expo-updates"

import { useBle } from "@/context/BleContext"
import { useBleStore } from "@/stores/bleStore"
import { useSyncStore } from "@/stores/syncStore"
import { useShallow } from "zustand/react/shallow"
import { useSyncContext } from "@/context/SyncContext"

import {
  ACCESSORY_METADATA,
  AccessorySnapshot,
  AccessoryState,
  AccessoryTone,
  DISMISSABLE_STATES,
  copyFor,
  deriveCandidates,
} from "./states"
import { accessoryReducer, initialReducerState } from "./reducer"

const DEBOUNCE_MS = 300

export type ActivityStripView = {
  state: AccessoryState
  copy: string
  icon: string
  tone: AccessoryTone
  announcement: string
  onPress: (() => void) | null
  onDismiss: (() => void) | null
}

const PRESS_ROUTES: Partial<Record<AccessoryState, string>> = {
  ble_error: "/(tabs)/inspector",
  sync_error: "__RETRY_SYNC__",
  dead_letters: "/(tabs)/inspector",
  disconnected_was_worn: "/device-settings",
  stale_sync: "/(tabs)/inspector",
  ble_connecting: "/device-settings",
  ble_syncing: "/(tabs)/inspector",
  upload_draining: "/(tabs)/inspector",
  offline_with_backlog: "/(tabs)/inspector",
  battery_low: "/device-settings",
  alarm_armed_soon: "/(tabs)/health",
  synced_confirm: "/(tabs)/health",
  app_update: "__APP_UPDATE__",
  alarm_firing: "__DISMISS_ALARM__",
  low_power_paused: "__OPEN_SETTINGS__",
}

function parseIso(s: string | null | undefined): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function buildSnapshot(
  ble: ReturnType<typeof useBle>,
  syncScalars: SyncScalars,
  sync: ReturnType<typeof useSyncContext>,
  isLowPowerMode: boolean,
  isAppUpdateAvailable: boolean,
  now: number,
): AccessorySnapshot {
  const lastSyncAt = parseIso(ble.lastSyncAt)
  return {
    bleError: syncScalars.error ?? null,
    connectionState: ble.connectionState,
    // v1: treat "currently worn or has ever synced" as worn-recently;
    // the predicate also requires disconnectedAt > 90s ago.
    wasWornRecently: !!ble.isWorn || lastSyncAt != null,
    disconnectedAt: ble.connectionState === "disconnected" ? lastSyncAt : null,
    lastSyncAt,
    bleIsSyncing: syncScalars.isSyncing,
    syncStage: syncScalars.syncStage || null,
    syncProgress: syncScalars.syncProgress
      ? {
          recordsRead: syncScalars.syncProgress.recordsParsed,
          total: syncScalars.syncProgress.totalBytes || null,
        }
      : null,
    syncIteration: syncScalars.syncIteration ?? null,
    syncIterationCap: syncScalars.syncIterationCap ?? null,
    pipelineState: syncScalars.pipelineState,
    batteryLevel: ble.batteryLevel,
    isCharging: ble.isCharging,
    strapAlarmArmed: ble.strapAlarmArmed,
    strapAlarmAt: parseIso(ble.strapAlarmAt),

    syncError: sync.syncError ?? null,
    deadCount: sync.deadCount,
    lastDeadLetterError: sync.lastDeadLetterError ?? null,
    isOnline: sync.isOnline,
    pendingCount: sync.pendingCount,
    queueIsSyncing: sync.isSyncing,
    syncSummary: syncScalars.syncSummary ?? null,

    isAppUpdateAvailable,
    isLowPowerMode,
    now,
  }
}

type SyncScalars = {
  isSyncing: boolean
  syncStage: string
  syncProgress: import("@/services/ble/packet-types").DownloadProgress | null
  syncIteration: number
  syncIterationCap: number
  pipelineState: "idle" | "running" | "success" | "failed"
  syncSummary: import("@/context/BleContext").SyncSummary | null
  error: string | null
}

export function useActivityStripState(): ActivityStripView {
  const ble = useBle()
  const bleScalars = useBleStore(
    useShallow((s) => ({
      connectionState: s.connectionState,
      isWorn: s.isWorn,
      batteryLevel: s.batteryLevel,
      isCharging: s.isCharging,
      strapAlarmArmed: s.strapAlarmArmed,
      strapAlarmAt: s.strapAlarmAt,
    })),
  )
  const syncScalars: SyncScalars = useSyncStore(
    useShallow((s) => ({
      isSyncing: s.isSyncing,
      syncStage: s.syncStage,
      syncProgress: s.syncProgress,
      syncIteration: s.syncIteration,
      syncIterationCap: s.syncIterationCap,
      pipelineState: s.pipelineState,
      syncSummary: s.syncSummary,
      error: s.error,
    })),
  )
  const sync = useSyncContext()
  const [reducerState, dispatch] = useReducer(accessoryReducer, initialReducerState)

  // useState (not useRef) so signal changes drive re-renders.
  const [isLowPowerMode, setIsLowPowerMode] = useState(false)
  const [isAppUpdateAvailable, setIsAppUpdateAvailable] = useState(false)
  useEffect(() => {
    Battery.isLowPowerModeEnabledAsync().then(setIsLowPowerMode)
    const sub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
      setIsLowPowerMode(lowPowerMode)
    })
    return () => sub.remove()
  }, [])
  useEffect(() => {
    let cancelled = false
    Updates.checkForUpdateAsync()
      .then((u) => {
        if (!cancelled) setIsAppUpdateAvailable(u.isAvailable)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const mergedBle = {
    ...ble,
    connectionState: bleScalars.connectionState,
    isWorn: bleScalars.isWorn,
    batteryLevel: bleScalars.batteryLevel,
    isCharging: bleScalars.isCharging,
    strapAlarmArmed: bleScalars.strapAlarmArmed,
    strapAlarmAt: bleScalars.strapAlarmAt,
  }

  const snapshot = useMemo(
    () =>
      buildSnapshot(mergedBle, syncScalars, sync, isLowPowerMode, isAppUpdateAvailable, Date.now()),
    [
      mergedBle,
      syncScalars,
      sync.syncError,
      sync.deadCount,
      sync.isOnline,
      sync.pendingCount,
      sync.isSyncing,
      isLowPowerMode,
      isAppUpdateAvailable,
    ],
  )

  // dismissedRef holds the state the user explicitly closed. Cleared when its
  // predicate stops firing — so a *new* instance of the same problem will show.
  const dismissedRef = useRef<AccessoryState | null>(null)
  const firingStates = useMemo(() => deriveCandidates(snapshot), [snapshot])
  if (dismissedRef.current && !firingStates.includes(dismissedRef.current)) {
    dismissedRef.current = null
  }
  const candidate = firingStates.find((s) => s !== dismissedRef.current) ?? "idle"

  const candidateRef = useRef(candidate)
  useEffect(() => {
    candidateRef.current = candidate
    const id = setTimeout(() => {
      dispatch({ type: "CANDIDATE", candidate: candidateRef.current, now: Date.now() })
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [candidate])

  const prevPipelineRef = useRef(syncScalars.pipelineState)
  useEffect(() => {
    if (prevPipelineRef.current === "running" && syncScalars.pipelineState === "success") {
      dispatch({ type: "SYNCED_OK", now: Date.now() })
    }
    prevPipelineRef.current = syncScalars.pipelineState
  }, [syncScalars.pipelineState])

  const prevQueueRef = useRef({ syncing: sync.isSyncing, pending: sync.pendingCount })
  useEffect(() => {
    const prev = prevQueueRef.current
    if (prev.syncing && !sync.isSyncing && prev.pending > 0 && sync.pendingCount === 0) {
      dispatch({ type: "SYNCED_OK", now: Date.now() })
    }
    prevQueueRef.current = { syncing: sync.isSyncing, pending: sync.pendingCount }
  }, [sync.isSyncing, sync.pendingCount])

  const state = reducerState.displayed
  const copy = copyFor(state, snapshot)
  const meta = state === "idle" ? null : ACCESSORY_METADATA[state]
  const tone: AccessoryTone = meta?.tone ?? "gray"
  const icon = meta?.icon ?? "circle"

  const onPress = useMemo<(() => void) | null>(() => {
    const target = PRESS_ROUTES[state]
    if (!target) return null
    if (target === "__APP_UPDATE__") {
      return () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
        Updates.reloadAsync().catch(() => {})
      }
    }
    if (target === "__DISMISS_ALARM__") {
      return () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
        mergedBle.disarmAlarm?.().catch(() => {})
      }
    }
    if (target === "__OPEN_SETTINGS__") {
      return () => {
        Linking.openURL("app-settings:").catch(() => {})
      }
    }
    if (target === "__RETRY_SYNC__") {
      return () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
        sync.refresh().catch(() => {})
      }
    }
    return () => {
      router.push(target as never)
    }
  }, [state, mergedBle, sync])

  const onDismiss = useMemo<(() => void) | null>(() => {
    if (!DISMISSABLE_STATES.has(state)) return null
    return () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      dismissedRef.current = state
      dispatch({ type: "CANDIDATE", candidate: "idle", now: Date.now() })
    }
  }, [state])

  return { state, copy, icon, tone, announcement: copy, onPress, onDismiss }
}
