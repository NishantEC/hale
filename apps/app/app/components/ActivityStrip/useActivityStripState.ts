import { useEffect, useMemo, useReducer, useRef } from "react"
import { Linking } from "react-native"
import { router } from "expo-router"
import * as Battery from "expo-battery"
import * as Updates from "expo-updates"

import { useBle } from "@/context/BleContext"
import { useSyncContext } from "@/context/SyncContext"

import {
  ACCESSORY_METADATA,
  AccessorySnapshot,
  AccessoryState,
  AccessoryTone,
  copyFor,
  deriveCandidate,
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
}

const PRESS_ROUTES: Partial<Record<AccessoryState, string>> = {
  ble_error: "/(tabs)/inspector",
  sync_error: "/(tabs)/inspector",
  dead_letters: "/(tabs)/inspector",
  disconnected_was_worn: "/device-settings",
  stale_sync: "/(tabs)/inspector",
  ble_connecting: "/device-settings",
  ble_syncing: "/(tabs)/inspector",
  pipeline_running: "/(tabs)/inspector",
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
  sync: ReturnType<typeof useSyncContext>,
  isLowPowerMode: boolean,
  isAppUpdateAvailable: boolean,
  now: number,
): AccessorySnapshot {
  const lastSyncAt = parseIso(ble.lastSyncAt)
  return {
    bleError: ble.error ?? null,
    connectionState: ble.connectionState,
    // v1: treat "currently worn or has ever synced" as worn-recently;
    // the predicate also requires disconnectedAt > 90s ago.
    wasWornRecently: !!ble.isWorn || lastSyncAt != null,
    disconnectedAt: ble.connectionState === "disconnected" ? lastSyncAt : null,
    lastSyncAt,
    bleIsSyncing: ble.isSyncing,
    syncStage: ble.syncStage || null,
    syncProgress: ble.syncProgress
      ? { recordsRead: ble.syncProgress.recordsParsed, total: ble.syncProgress.totalBytes || null }
      : null,
    syncIteration: ble.syncIteration ?? null,
    syncIterationCap: ble.syncIterationCap ?? null,
    pipelineState: ble.pipelineState,
    batteryLevel: ble.batteryLevel,
    isCharging: ble.isCharging,
    strapAlarmArmed: ble.strapAlarmArmed,
    strapAlarmAt: parseIso(ble.strapAlarmAt),

    syncError: sync.syncError ?? null,
    deadCount: sync.deadCount,
    isOnline: sync.isOnline,
    pendingCount: sync.pendingCount,
    queueIsSyncing: sync.isSyncing,
    syncSummary: ble.syncSummary ?? null,

    isAppUpdateAvailable,
    isLowPowerMode,
    now,
  }
}

export function useActivityStripState(): ActivityStripView {
  const ble = useBle()
  const sync = useSyncContext()
  const [reducerState, dispatch] = useReducer(accessoryReducer, initialReducerState)

  const lpmRef = useRef(false)
  const updateRef = useRef(false)
  useEffect(() => {
    Battery.isLowPowerModeEnabledAsync().then((v) => {
      lpmRef.current = v
    })
    const sub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
      lpmRef.current = lowPowerMode
    })
    return () => sub.remove()
  }, [])
  useEffect(() => {
    let cancelled = false
    Updates.checkForUpdateAsync()
      .then((u) => {
        if (!cancelled) updateRef.current = u.isAvailable
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const snapshot = useMemo(
    () => buildSnapshot(ble, sync, lpmRef.current, updateRef.current, Date.now()),
    [
      ble.error,
      ble.connectionState,
      ble.isWorn,
      ble.lastSyncAt,
      ble.isSyncing,
      ble.syncStage,
      ble.syncIteration,
      ble.syncIterationCap,
      ble.pipelineState,
      ble.batteryLevel,
      ble.isCharging,
      ble.strapAlarmArmed,
      ble.strapAlarmAt,
      ble.syncSummary,
      sync.syncError,
      sync.deadCount,
      sync.isOnline,
      sync.pendingCount,
      sync.isSyncing,
    ],
  )

  const candidate = deriveCandidate(snapshot)

  const candidateRef = useRef(candidate)
  useEffect(() => {
    candidateRef.current = candidate
    const id = setTimeout(() => {
      dispatch({ type: "CANDIDATE", candidate: candidateRef.current, now: Date.now() })
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [candidate])

  const prevPipelineRef = useRef(ble.pipelineState)
  useEffect(() => {
    if (prevPipelineRef.current === "running" && ble.pipelineState === "success") {
      dispatch({ type: "SYNCED_OK", now: Date.now() })
    }
    prevPipelineRef.current = ble.pipelineState
  }, [ble.pipelineState])

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
        Updates.reloadAsync().catch(() => {})
      }
    }
    if (target === "__DISMISS_ALARM__") {
      return () => {
        ble.disarmAlarm?.().catch(() => {})
      }
    }
    if (target === "__OPEN_SETTINGS__") {
      return () => {
        Linking.openURL("app-settings:").catch(() => {})
      }
    }
    return () => {
      router.push(target as never)
    }
  }, [state, ble])

  return { state, copy, icon, tone, announcement: copy, onPress }
}
