import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import type { DownloadProgress, ScannedDevice } from "@/services/ble/packet-types"
import type { SyncSummary } from "@/context/BleContext"
import { DEFAULT_MAX_ITERATIONS } from "@/services/sync/syncLoop"

export type PipelineState = "idle" | "running" | "success" | "failed"

export interface LastBatchWindow {
  oldestMs: number
  newestMs: number
  batchSize: number
}

export interface SyncStoreState {
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  syncIteration: number
  syncIterationCap: number
  syncLastStopReason: string | null
  pipelineState: PipelineState
  lastPipelineAt: string | null
  lastBatchWindow: LastBatchWindow | null
  lastSyncAt: string | null
  error: string | null
  scannedDevices: ScannedDevice[]
}

const initialState: SyncStoreState = {
  isSyncing: false,
  syncStage: "",
  syncProgress: null,
  syncSummary: null,
  syncIteration: 0,
  syncIterationCap: DEFAULT_MAX_ITERATIONS,
  syncLastStopReason: null,
  pipelineState: "idle",
  lastPipelineAt: null,
  lastBatchWindow: null,
  lastSyncAt: null,
  error: null,
  scannedDevices: [],
}

export const useSyncStore = create<SyncStoreState>()(() => initialState)

export const getSyncState = () => useSyncStore.getState()

// Selector hooks (per-scalar) — components subscribe to just the field
// they render so a sync progress update doesn't rerender the dashboard.
export const useSyncIsRunning = () => useSyncStore((s) => s.isSyncing)
export const useSyncStage = () => useSyncStore((s) => s.syncStage)
export const useSyncProgress = () => useSyncStore((s) => s.syncProgress)
export const useSyncSummary = () => useSyncStore((s) => s.syncSummary)
export const useSyncIteration = () => useSyncStore((s) => s.syncIteration)
export const useSyncIterationCap = () => useSyncStore((s) => s.syncIterationCap)
export const useSyncStopReason = () => useSyncStore((s) => s.syncLastStopReason)
export const usePipelineState = () => useSyncStore((s) => s.pipelineState)
export const useLastPipelineAt = () => useSyncStore((s) => s.lastPipelineAt)
export const useLastBatchWindow = () => useSyncStore((s) => s.lastBatchWindow)
export const useLastSyncAt = () => useSyncStore((s) => s.lastSyncAt)
export const useSyncError = () => useSyncStore((s) => s.error)
export const useScannedDevices = () => useSyncStore((s) => s.scannedDevices)

// Composite hook for components that need ≥2 sync fields together.
// useShallow stops the component re-rendering when an unrelated field changes.
export const useSyncInfo = () =>
  useSyncStore(
    useShallow((s) => ({
      isSyncing: s.isSyncing,
      syncStage: s.syncStage,
      syncProgress: s.syncProgress,
      syncIteration: s.syncIteration,
      syncIterationCap: s.syncIterationCap,
      pipelineState: s.pipelineState,
    })),
  )

// Mutators — called by BleContext.syncNow and related action callbacks
// (and, eventually, by syncStoreBridge once SyncService grows an event API).
export const setIsSyncing = (v: boolean) => useSyncStore.setState({ isSyncing: v })
export const setSyncStage = (v: string) => useSyncStore.setState({ syncStage: v })
export const setSyncProgress = (
  v: DownloadProgress | null | ((prev: DownloadProgress | null) => DownloadProgress | null),
) => {
  if (typeof v === "function") {
    useSyncStore.setState((s) => ({ syncProgress: v(s.syncProgress) }))
  } else {
    useSyncStore.setState({ syncProgress: v })
  }
}
export const setSyncSummary = (v: SyncSummary | null) =>
  useSyncStore.setState({ syncSummary: v })
export const setSyncIteration = (v: number) => useSyncStore.setState({ syncIteration: v })
export const setSyncLastStopReason = (v: string | null) =>
  useSyncStore.setState({ syncLastStopReason: v })
export const setPipelineState = (v: PipelineState) => useSyncStore.setState({ pipelineState: v })
export const setLastPipelineAt = (v: string | null) =>
  useSyncStore.setState({ lastPipelineAt: v })
export const setLastBatchWindow = (v: LastBatchWindow | null) =>
  useSyncStore.setState({ lastBatchWindow: v })
export const setLastSyncAt = (v: string | null) => useSyncStore.setState({ lastSyncAt: v })
export const setSyncError = (v: string | null) => useSyncStore.setState({ error: v })
export const setScannedDevices = (
  v: ScannedDevice[] | ((prev: ScannedDevice[]) => ScannedDevice[]),
) => {
  if (typeof v === "function") {
    useSyncStore.setState((s) => ({ scannedDevices: v(s.scannedDevices) }))
  } else {
    useSyncStore.setState({ scannedDevices: v })
  }
}
