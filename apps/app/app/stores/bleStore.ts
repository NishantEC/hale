import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ConnectionState, ScannedDevice } from '@/services/ble/packet-types'
import type { SeriesPoint } from '@/services/api/noopClient'
import type { DownloadProgress } from '@/services/ble/packet-types'
import type { SyncSummary } from '@/context/BleContext'
import { DEFAULT_MAX_ITERATIONS } from '@/services/sync/syncLoop'

export interface BleStoreState {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  batteryVoltageMv: number | null
  batteryTemperatureC: number | null
  batteryIconLevel: number | null
  isCharging: boolean
  isBusy: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  liveStressLevel: number | null
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
  scannedDevices: ScannedDevice[]
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  lastBatchWindow: { oldestMs: number; newestMs: number; batchSize: number } | null
  pipelineState: 'idle' | 'running' | 'success' | 'failed'
  lastPipelineAt: string | null
  syncIteration: number
  syncIterationCap: number
  syncLastStopReason: string | null
  error: string | null
  // Per-user resting heart rate baseline (bpm), mirrored from the
  // dashboard's homeView.activities.baselineRhr by BleProvider. Null means
  // "not yet computed" — the bridge falls back to a constant default when
  // deriving liveStressLevel.
  baselineRhr: number | null
}

const initialState: BleStoreState = {
  connectionState: 'disconnected',
  deviceName: null,
  batteryLevel: null,
  batteryVoltageMv: null,
  batteryTemperatureC: null,
  batteryIconLevel: null,
  isCharging: false,
  isBusy: false,
  isRealtimeHeartRateEnabled: true,
  isBroadcastHeartRateEnabled: true,
  isRawDataStreamingEnabled: true,
  realtimeHeartRate: null,
  realtimeSamples: [],
  liveStressLevel: null,
  strapAlarmAt: null,
  strapAlarmArmed: false,
  isWorn: true,
  lastSyncAt: null,
  firmwareVersion: null,
  deviceClock: null,
  scannedDevices: [],
  isSyncing: false,
  syncStage: '',
  syncProgress: null,
  syncSummary: null,
  lastBatchWindow: null,
  pipelineState: 'idle',
  lastPipelineAt: null,
  syncIteration: 0,
  syncIterationCap: DEFAULT_MAX_ITERATIONS,
  syncLastStopReason: null,
  error: null,
  baselineRhr: null,
}

export const useBleStore = create<BleStoreState>()(() => initialState)

export const getBleState = () => useBleStore.getState()

export const useBleConnectionState = () => useBleStore((s) => s.connectionState)
export const useBleDeviceName = () => useBleStore((s) => s.deviceName)
export const useBleBatteryLevel = () => useBleStore((s) => s.batteryLevel)
export const useBleBatteryVoltageMv = () => useBleStore((s) => s.batteryVoltageMv)
export const useBleBatteryTemperatureC = () => useBleStore((s) => s.batteryTemperatureC)
export const useBleBatteryIconLevel = () => useBleStore((s) => s.batteryIconLevel)
export const useBleIsCharging = () => useBleStore((s) => s.isCharging)
export const useBleIsBusy = () => useBleStore((s) => s.isBusy)
export const useBleIsRealtimeHrEnabled = () => useBleStore((s) => s.isRealtimeHeartRateEnabled)
export const useBleIsBroadcastHrEnabled = () => useBleStore((s) => s.isBroadcastHeartRateEnabled)
export const useBleIsRawStreamEnabled = () => useBleStore((s) => s.isRawDataStreamingEnabled)
export const useBleRealtimeHr = () => useBleStore((s) => s.realtimeHeartRate)
export const useBleRealtimeSamples = () => useBleStore((s) => s.realtimeSamples)
export const useBleLiveStressLevel = () => useBleStore((s) => s.liveStressLevel)
export const useBleStrapAlarmAt = () => useBleStore((s) => s.strapAlarmAt)
export const useBleStrapAlarmArmed = () => useBleStore((s) => s.strapAlarmArmed)
export const useBleIsWorn = () => useBleStore((s) => s.isWorn)
export const useBleLastSyncAt = () => useBleStore((s) => s.lastSyncAt)
export const useBleFirmwareVersion = () => useBleStore((s) => s.firmwareVersion)
export const useBleDeviceClock = () => useBleStore((s) => s.deviceClock)
export const useBleScannedDevices = () => useBleStore((s) => s.scannedDevices)
export const useBleIsSyncing = () => useBleStore((s) => s.isSyncing)
export const useBleSyncStage = () => useBleStore((s) => s.syncStage)
export const useBleSyncProgress = () => useBleStore((s) => s.syncProgress)
export const useBleSyncSummary = () => useBleStore((s) => s.syncSummary)
export const useBleLastBatchWindow = () => useBleStore((s) => s.lastBatchWindow)
export const useBlePipelineState = () => useBleStore((s) => s.pipelineState)
export const useBleLastPipelineAt = () => useBleStore((s) => s.lastPipelineAt)
export const useBleSyncIteration = () => useBleStore((s) => s.syncIteration)
export const useBleSyncIterationCap = () => useBleStore((s) => s.syncIterationCap)
export const useBleSyncLastStopReason = () => useBleStore((s) => s.syncLastStopReason)
export const useBleError = () => useBleStore((s) => s.error)
export const useBleBaselineRhr = () => useBleStore((s) => s.baselineRhr)

// Mutator: called from BleProvider whenever the dashboard's homeView
// publishes a non-null activities.baselineRhr. Keeps the bridge's
// liveStressLevel derivation aligned with the per-user RHR baseline.
export const setBaselineRhr = (baselineRhr: number | null) => {
  useBleStore.setState({ baselineRhr })
}

export const useBleConnectionInfo = () =>
  useBleStore(
    useShallow((s) => ({
      connectionState: s.connectionState,
      deviceName: s.deviceName,
      batteryLevel: s.batteryLevel,
      isCharging: s.isCharging,
      isBusy: s.isBusy,
    })),
  )

export const useBleSyncInfo = () =>
  useBleStore(
    useShallow((s) => ({
      isSyncing: s.isSyncing,
      syncStage: s.syncStage,
      syncProgress: s.syncProgress,
      syncIteration: s.syncIteration,
      syncIterationCap: s.syncIterationCap,
      pipelineState: s.pipelineState,
    })),
  )
