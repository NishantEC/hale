import KVStore from "expo-sqlite/kv-store"
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

import {
  bleManager,
  CMD_FROM_STRAP_UUID,
  CommandNumber,
  CommandService,
  ConnectionState,
  ConsoleLogLineForwarder,
  createCommandResponseForwarder,
  createEventForwarder,
  createImuForwarder,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
  parseIMUPacket,
  RealtimeSessionForwarder,
  ScannedDevice,
  uint8ArrayToBase64,
  WhoopPacket,
} from "@/services/ble"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import {
  startAndroidForegroundService,
  stopAndroidForegroundService,
} from "@/services/sync/androidForegroundService"
import { historicalRecordToRawRow, ingestBleRecords } from "@/services/sync/bleIngest"
import { runPipeline, fetchResults, SeriesPoint } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { useDashboard } from "@/context/DashboardContext"
import { useAuth } from "@/context/AuthContext"
// Battery parsers live in a separate module so they can be unit-tested
// without dragging in BleProvider's dependency graph.
import {
  parseBatteryLevel,
  parseBatteryLevelEvent,
  parseExtendedBatteryEvent,
} from "@/services/ble/battery-parsers"

const LAST_SYNC_KEY = "noop.lastSyncTimestamp"
const REALTIME_HR_KEY = "noop.prefersRealtimeHeartRate"
const BROADCAST_HR_KEY = "noop.prefersBroadcastHeartRate"
const RAW_STREAM_KEY = "noop.prefersRawDataStream"

export type SyncSummary = {
  nights: number
  stages: number
  scores: number
}

type BleDeviceState = {
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
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
}

export type BleContextValue = {
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
  error: string | null
  scan: () => Promise<void>
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  refreshStrapMetadata: () => Promise<void>
  toggleRealtimeHeartRate: (enabled: boolean) => Promise<void>
  toggleBroadcastHeartRate: (enabled: boolean) => Promise<void>
  toggleRawDataStreaming: (enabled: boolean) => Promise<void>
  armAlarm: () => Promise<void>
  disarmAlarm: () => Promise<void>
  testAlarm: () => Promise<void>
  rebootStrap: () => Promise<void>
  powerCycleStrap: () => Promise<void>
  probeDataRange: () => Promise<{ raw: number[]; hex: string; decoded: string }>
  clearError: () => void
}

const BleContext = createContext<BleContextValue | null>(null)

const commandService = new CommandService()
const eventForwarder = createEventForwarder()
// Both forwarders are write-only as of this session — IMU produces
// ~45M rows/day per active strap with no downstream reader, and
// command-responses captures every cmd response (low volume, but no
// consumer yet either). Default off until a reader/retention exists.
// Set EXPO_PUBLIC_ENABLE_IMU_INGEST=1 / EXPO_PUBLIC_ENABLE_CMD_RESP_INGEST=1
// to turn back on locally.
const IMU_INGEST_ENABLED = process.env.EXPO_PUBLIC_ENABLE_IMU_INGEST === "1"
const CMD_RESP_INGEST_ENABLED = process.env.EXPO_PUBLIC_ENABLE_CMD_RESP_INGEST === "1"
const commandResponseForwarder = createCommandResponseForwarder()
const imuForwarder = createImuForwarder()
const consoleLogForwarder = new ConsoleLogLineForwarder()
const realtimeForwarder = new RealtimeSessionForwarder()

const emptyDeviceState: BleDeviceState = {
  connectionState: "disconnected",
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
  strapAlarmAt: null,
  strapAlarmArmed: false,
  isWorn: true,
  lastSyncAt: null,
  firmwareVersion: null,
  deviceClock: null,
}

function parseUint32LE(data: Uint8Array, offset: number) {
  if (offset + 3 >= data.length) return null
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  )
}

function readUint16LE(data: Uint8Array, offset: number) {
  if (offset + 1 >= data.length) return null
  return data[offset] | (data[offset + 1] << 8)
}


function parseVersionInfo(packet: WhoopPacket): string | null {
  if (packet.command !== CommandNumber.ReportVersionInfo) return null
  if (packet.data.length < 3 + 8 * 4) return null
  const values: number[] = []
  for (let i = 0; i < 8; i++) {
    const v = parseUint32LE(packet.data, 3 + i * 4)
    if (v == null) return null
    values.push(v)
  }
  const harvard = values.slice(0, 4).join(".")
  const boylston = values.slice(4, 8).join(".")
  return `${harvard} / ${boylston}`
}

function parseDeviceClock(packet: WhoopPacket): Date | null {
  if (packet.command !== CommandNumber.GetClock || packet.data.length < 6) return null
  const unix = parseUint32LE(packet.data, 2)
  if (unix == null || unix === 0) return null
  return new Date(unix * 1000)
}

function parseScheduledAlarm(packet: WhoopPacket, now = new Date()) {
  if (packet.command !== CommandNumber.GetScheduledAlarm) return null

  const nowUnix = Math.floor(now.getTime() / 1000)
  const lowerBound = nowUnix - 365 * 24 * 60 * 60
  const upperBound = nowUnix + 365 * 24 * 60 * 60

  for (let offset = 0; offset <= Math.min(16, packet.data.length - 4); offset += 1) {
    const value = parseUint32LE(packet.data, offset)
    if (value == null) continue
    if (value === 0) continue
    if (value >= lowerBound && value <= upperBound) {
      return new Date(value * 1000).toISOString()
    }
  }

  return null
}

// 0..3 stress proxy from rolling-mean HR over the live sample window.
// Baseline is sourced from BaselineProfile.restingHeartRate (per-user)
// via dashboard's homeView.activities.baselineRhr; defaults to 60 only
// if no baseline is available yet (cold-start / not enough nights).
const LIVE_STRESS_RESTING_BPM_DEFAULT = 60
function deriveLiveStressLevel(
  samples: SeriesPoint[],
  restingBpm: number = LIVE_STRESS_RESTING_BPM_DEFAULT,
): number | null {
  if (samples.length === 0) return null
  const tail = samples.slice(-15)
  const mean = tail.reduce((s, p) => s + p.value, 0) / tail.length
  const delta = mean - restingBpm
  if (delta < 10) return 0
  if (delta < 25) return 1
  if (delta < 50) return 2
  return 3
}

function parseRealtimeHeartRate(packet: WhoopPacket) {
  if (packet.type !== PacketType.RealtimeData || packet.data.length <= 5) return null
  const heartRate = packet.data[5]
  return heartRate > 0 ? heartRate : null
}

function nextAlarmDate(alarmMinutes: number) {
  const now = new Date()
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(alarmMinutes / 60),
    alarmMinutes % 60,
    0,
    0,
  )
  if (next <= now) next.setDate(next.getDate() + 1)
  return next
}

export const BleProvider: FC<PropsWithChildren> = ({ children }) => {
  const { refreshDashboard, sleepView, homeView } = useDashboard()
  const { isAuthenticated } = useAuth()

  const [deviceState, setDeviceState] = useState<BleDeviceState>(emptyDeviceState)
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const isSyncingRef = useRef(false)
  const [syncStage, setSyncStage] = useState("")
  const [syncProgress, setSyncProgress] = useState<DownloadProgress | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastAutoSyncAttemptAt = useRef<number>(0)

  const clearError = useCallback(() => setError(null), [])

  // Cheap reads only. Safe to call on every screen focus.
  const refreshDeviceState = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildGetBatteryLevel())
      await bleManager.writeCommand(commandService.buildGetHelloHarvard())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      await bleManager.writeCommand(commandService.buildReportVersionInfo())
      await bleManager.writeCommand(commandService.buildGetClock())
    } catch {
      // Best-effort.
    }
  }, [])

  // Sticky modes — Realtime HR, generic HR profile, raw data streaming —
  // are remembered by the strap firmware. Re-issuing them costs BLE round
  // trips and can re-init the optical sensor. Call this exactly once per
  // connect (or when the user explicitly toggles a setting elsewhere).
  const bootstrapStrapModes = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildToggleRealtimeHR(true))
      await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(true))
      await bleManager.writeCommand(commandService.buildStartRawData())
    } catch {
      // Best-effort.
    }
  }, [])

  const persistPreference = useCallback(async (key: string, value: boolean) => {
    await KVStore.setItemAsync(key, JSON.stringify(value))
  }, [])

  const scan = useCallback(async () => {
    setError(null)
    setScannedDevices([])
    try {
      const allowed = await bleManager.requestPermissions()
      if (!allowed) {
        throw new Error("Bluetooth permission was denied")
      }
      await bleManager.startScan((device) => {
        setScannedDevices((current) => {
          if (current.some((candidate) => candidate.id === device.id)) return current
          return [...current, device]
        })
      })
    } catch (nextError: any) {
      setError(nextError?.message ?? "Unable to scan for WHOOP devices")
    }
  }, [])

  const connect = useCallback(
    async (deviceId: string) => {
      setError(null)
      try {
        await bleManager.connect(deviceId)
        setDeviceState((current) => ({
          ...current,
          deviceName: bleManager.getDeviceName() || "WHOOP",
        }))
        await bootstrapStrapModes()
        await refreshDeviceState()
      } catch (nextError: any) {
        setError(nextError?.message ?? "Connection failed")
      }
    },
    [bootstrapStrapModes, refreshDeviceState],
  )

  const disconnect = useCallback(async () => {
    await bleManager.disconnect()
  }, [])

  const syncNow = useCallback(async () => {
    console.log("[syncNow] start; bleState=", bleManager.connectionState)
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before syncing.")
      return
    }

    isSyncingRef.current = true
    setIsSyncing(true)
    setSyncStage("Downloading from strap…")
    setSyncSummary(null)
    setError(null)

    try {
      // Preflight: cancel any half-finished prior history transmit on the
      // strap. Safe — doesn't touch the trim/read pointer. Recovers from
      // the case where a prior sync started but BLE dropped mid-stream.
      const commandService = new (
        await import("@/services/ble/command-service")
      ).CommandService()
      await bleManager
        .writeCommand(commandService.buildAbortHistoricalTransmits())
        .catch(() => {})

      const db = openDatabase()
      let persistedCount = 0

      const downloader = new HistoryDownloader()
      const records = await downloader.startDownload({
        onProgress: setSyncProgress,
        // Durable-ACK: commit each batch to local SQLite BEFORE the strap
        // is ACK'd for that batch. If persistence fails, the ACK is
        // skipped and the strap retains the batch (no more silent
        // over-ACKing in release builds).
        persistBatch: async (batch) => {
          if (batch.length === 0) return
          const mapped = batch.map(historicalRecordToRawRow)
          const { ok, failed } = await ingestBleRecords(db, mapped)
          // Throw if any record failed so the downloader skips the ACK
          // and the strap keeps the batch for the next sync — preserves
          // the durable-ACK guarantee.
          if (failed > 0) {
            throw new Error(
              `persistBatch: ${failed}/${mapped.length} records failed to persist`,
            )
          }
          persistedCount += ok
        },
      })
      console.log(
        "[syncNow] download resolved with",
        records.length,
        "records; persisted",
        persistedCount,
        "to local SQLite",
      )
      setSyncProgress((current) => ({
        state: "complete",
        chunksReceived: current?.chunksReceived ?? 0,
        recordsParsed: records.length,
        totalBytes: current?.totalBytes ?? 0,
      }))

      const lastSyncAt = new Date().toISOString()
      await KVStore.setItemAsync(LAST_SYNC_KEY, lastSyncAt)
      setDeviceState((current) => ({ ...current, lastSyncAt }))

      if (records.length > 0) {
        setSyncStage("Running pipeline…")
        console.log("[syncNow] Running pipeline on backend")
        await runPipeline()

        setSyncStage("Refreshing views…")
        const results = await fetchResults()
        setSyncSummary({
          nights: results.sleepDetections?.length ?? 0,
          stages: results.sleepStages?.length ?? 0,
          scores: results.dailyScores?.length ?? 0,
        })
      }

      await refreshDashboard()
    } catch (nextError: any) {
      console.error("[syncNow] failed", nextError)
      setError(nextError?.message ?? "Sync failed")
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
      setSyncStage("")
    }
  }, [refreshDashboard])

  const maybeAutoSync = useCallback(async () => {
    if (!isAuthenticated || isSyncingRef.current || bleManager.connectionState !== "ready") return

    const now = Date.now()
    if (now - lastAutoSyncAttemptAt.current < 60 * 1000) return

    // Strap flash holds many hours / days of history; the on-strap circular
    // buffer wraps far slower than our previous 3-minute cadence. Bumping
    // to 15 min cuts BLE chatter (and the per-pull strap-side burst work)
    // ~5x without risking buffer wrap.
    if (deviceState.lastSyncAt) {
      const lastSyncMs = new Date(deviceState.lastSyncAt).getTime()
      if (!Number.isNaN(lastSyncMs) && now - lastSyncMs < 15 * 60 * 1000) {
        return
      }
    }

    lastAutoSyncAttemptAt.current = now
    await syncNow()
  }, [isAuthenticated, deviceState.lastSyncAt, syncNow])

  const toggleRealtimeHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: enabled }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleRealtimeHR(enabled))
        setDeviceState((current) => ({
          ...current,
          isRealtimeHeartRateEnabled: enabled,
          realtimeHeartRate: enabled ? current.realtimeHeartRate : null,
          realtimeSamples: enabled ? current.realtimeSamples : [],
        }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle realtime heart rate")
      }
    },
    [persistPreference],
  )

  const toggleBroadcastHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(enabled))
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle broadcast heart rate")
      }
    },
    [persistPreference],
  )

  const toggleRawDataStreaming = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(
          enabled ? commandService.buildStartRawData() : commandService.buildStopRawData(),
        )
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle raw data stream")
      }
    },
    [persistPreference],
  )

  const smartWakeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const smartWakeFiredFor = useRef<string | null>(null)
  // The interval body reads the latest realtime samples via this ref to
  // avoid stale-closure capture. The ref is kept current by a useEffect
  // below; armAlarm itself doesn't need to depend on the array.
  const realtimeSamplesRef = useRef<SeriesPoint[]>([])

  // Keep ref current. setDeviceState is fast and reading the latest
  // value here is cheap.
  useEffect(() => {
    realtimeSamplesRef.current = deviceState.realtimeSamples
  }, [deviceState.realtimeSamples])

  // Cleanup on unmount — the existing big-useEffect return doesn't
  // cover this timer because it lives on a separate ref.
  useEffect(() => {
    return () => {
      if (smartWakeTimer.current) {
        clearInterval(smartWakeTimer.current)
        smartWakeTimer.current = null
      }
    }
  }, [])

  const armAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready" || !sleepView) {
      setError("Connect your WHOOP strap before arming the strap alarm.")
      return
    }

    const alarmDate = nextAlarmDate(sleepView.planner.alarmMinutes)
    const smartWake = sleepView.planner.smartWakeEnabled

    try {
      await bleManager.writeCommand(commandService.buildSetScheduledAlarm(alarmDate))
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: alarmDate.toISOString(),
        strapAlarmArmed: true,
      }))

      // Smart-wake monitor (v1, foreground-only on iOS).
      // In the 30-min window before the scheduled alarm, poll realtime
      // HR samples each minute. If recent HR mean rises > 10 bpm above
      // the session minimum, fire the strap alarm early (proxy for
      // light/REM stage). Limitations to address later:
      //   • iOS suspends JS setInterval — only fires when app is foreground
      //     or Android FGS is active. Lift onto native scheduler post v1.
      //   • The ~30s realtime buffer is short for physiological wake
      //     detection; real smart-wake uses 5-10 min rolling slopes.
      //     Good enough for a movement-spike proxy; expect false negatives.
      if (smartWakeTimer.current) {
        clearInterval(smartWakeTimer.current)
        smartWakeTimer.current = null
      }
      if (smartWake) {
        const WINDOW_MS = 30 * 60 * 1000
        const windowStart = alarmDate.getTime() - WINDOW_MS
        const alarmKey = alarmDate.toISOString()
        smartWakeFiredFor.current = null
        smartWakeTimer.current = setInterval(async () => {
          const now = Date.now()
          if (now < windowStart) return
          if (now >= alarmDate.getTime()) {
            if (smartWakeTimer.current) {
              clearInterval(smartWakeTimer.current)
              smartWakeTimer.current = null
            }
            return
          }
          if (smartWakeFiredFor.current === alarmKey) return
          // Read latest samples through the ref to avoid stale capture
          const samples = realtimeSamplesRef.current.slice(-30)
          if (samples.length < 10) return
          const values = samples.map((s) => s.value).filter((v) => v > 0)
          if (values.length < 10) return
          const mean = values.reduce((a, b) => a + b, 0) / values.length
          const min = Math.min(...values)
          if (mean - min < 10) return
          try {
            await bleManager.writeCommand(commandService.buildRunAlarm())
            smartWakeFiredFor.current = alarmKey
          } catch {
            // best-effort — fall back to scheduled fire
          }
        }, 60 * 1000)
      }

      await refreshDashboard()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to arm strap alarm")
    }
  }, [sleepView, refreshDashboard])

  const disarmAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before disarming the strap alarm.")
      return
    }

    if (smartWakeTimer.current) {
      clearInterval(smartWakeTimer.current)
      smartWakeTimer.current = null
    }
    smartWakeFiredFor.current = null

    try {
      await bleManager.writeCommand(commandService.buildClearScheduledAlarm())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: null,
        strapAlarmArmed: false,
      }))
      await refreshDashboard()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to disarm strap alarm")
    }
  }, [refreshDashboard])

  const testAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before testing the alarm.")
      return
    }

    try {
      await bleManager.writeCommand(commandService.buildRunAlarm())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to trigger strap alarm")
    }
  }, [])

  const rebootStrap = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before rebooting.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildReboot())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to reboot strap")
    }
  }, [])

  const powerCycleStrap = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before power-cycling.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildPowerCycle())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to power-cycle strap")
    }
  }, [])

  // Empirically probe what historical-data range the strap reports. Sends
  // cmd 34 (GetDataRange) and waits up to 3s for the matching command
  // response on CMD_FROM_STRAP_UUID. Read-only — does not alter strap
  // state. Payload format is not reverse-engineered in any open reference;
  // this returns the raw bytes plus a best-effort decode (assumes the
  // payload is [start_u32_LE, end_u32_LE, ...] which is the convention
  // the trim-value-in-ACK uses) so we can confirm the layout on real
  // hardware before building a recovery-sync flow on top of it.
  const probeDataRange = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      throw new Error("Connect your WHOOP strap before probing.")
    }
    return await new Promise<{ raw: number[]; hex: string; decoded: string }>(
      (resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          unsub()
          reject(new Error("GetDataRange timed out (3s) — no response from strap"))
        }, 3000)
        const unsub = bleManager.onPacket(CMD_FROM_STRAP_UUID, (packet) => {
          if (settled) return
          if (
            packet.type !== PacketType.CommandResponse ||
            packet.command !== CommandNumber.GetDataRange
          ) {
            return
          }
          settled = true
          clearTimeout(timeout)
          unsub()
          const bytes = Array.from(packet.data)
          const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
          // Best-effort decode: try interpreting first 8 bytes as
          // [start_u32_LE, end_u32_LE] (unix seconds, matching the trim
          // ack encoding) and the next 8 the same way.
          const u32 = (offset: number): number | null => {
            if (offset + 4 > bytes.length) return null
            return (
              bytes[offset] |
              (bytes[offset + 1] << 8) |
              (bytes[offset + 2] << 16) |
              ((bytes[offset + 3] << 24) >>> 0)
            )
          }
          const fmtTs = (v: number | null) => {
            if (v == null) return "—"
            if (v > 1_000_000_000 && v < 4_000_000_000) {
              return `${v} (${new Date(v * 1000).toISOString()})`
            }
            return `${v}`
          }
          const a = u32(0)
          const b = u32(4)
          const c = u32(8)
          const d = u32(12)
          const decoded = [
            `len=${bytes.length}`,
            `u32@0: ${fmtTs(a)}`,
            `u32@4: ${fmtTs(b)}`,
            `u32@8: ${fmtTs(c)}`,
            `u32@12: ${fmtTs(d)}`,
          ].join("\n")
          resolve({ raw: bytes, hex, decoded })
        })
        bleManager
          .writeCommand(commandService.buildGetDataRange())
          .catch((err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            unsub()
            reject(err instanceof Error ? err : new Error(String(err)))
          })
      },
    )
  }, [])

  useEffect(() => {
    KVStore.getItemAsync(LAST_SYNC_KEY).then((lastSyncAt) => {
      setDeviceState((current) => ({ ...current, lastSyncAt }))
    })
  }, [])

  useEffect(() => {
    Promise.all([
      KVStore.getItemAsync(REALTIME_HR_KEY),
      KVStore.getItemAsync(BROADCAST_HR_KEY),
      KVStore.getItemAsync(RAW_STREAM_KEY),
    ]).then(([realtimeValue, broadcastValue, rawStreamValue]) => {
      setDeviceState((current) => ({
        ...current,
        isRealtimeHeartRateEnabled:
          realtimeValue == null ? current.isRealtimeHeartRateEnabled : JSON.parse(realtimeValue),
        isBroadcastHeartRateEnabled:
          broadcastValue == null
            ? current.isBroadcastHeartRateEnabled
            : JSON.parse(broadcastValue),
        isRawDataStreamingEnabled:
          rawStreamValue == null
            ? current.isRawDataStreamingEnabled
            : JSON.parse(rawStreamValue),
      }))
    })
  }, [])

  useEffect(() => {
    bleManager.autoConnect().catch(() => undefined)

    const unsubscribeState = bleManager.onConnectionStateChange((connectionState) => {
      setDeviceState((current) => {
        if (connectionState === "disconnected") {
          return {
            ...emptyDeviceState,
            deviceName: current.deviceName,
            isRealtimeHeartRateEnabled: current.isRealtimeHeartRateEnabled,
            isBroadcastHeartRateEnabled: current.isBroadcastHeartRateEnabled,
            isRawDataStreamingEnabled: current.isRawDataStreamingEnabled,
            lastSyncAt: current.lastSyncAt,
          }
        }
        return {
          ...current,
          connectionState,
          isBusy: connectionState !== "ready",
          deviceName: bleManager.getDeviceName() || current.deviceName,
        }
      })

      if (connectionState === "ready") {
        eventForwarder.start()
        if (CMD_RESP_INGEST_ENABLED) commandResponseForwarder.start()
        if (IMU_INGEST_ENABLED) imuForwarder.start()
        realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        consoleLogForwarder.start(bleManager.getDeviceId() || "unknown")
        refreshDeviceState().catch(() => undefined)
        maybeAutoSync().catch(() => undefined)
        startAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] start failed", err),
        )
      } else if (connectionState === "disconnected") {
        stopAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] stop failed", err),
        )
      }
    })

    const unsubscribePackets = bleManager.onPacket("*", (packet) => {
      setDeviceState((current) => {
        if (current.connectionState === "disconnected") {
          return {
            ...current,
            connectionState: "ready" as ConnectionState,
            isBusy: false,
            deviceName: bleManager.getDeviceName() || current.deviceName,
          }
        }
        return current
      })

      const parsedBattery =
        packet.type === PacketType.CommandResponse ? parseBatteryLevel(packet) : null
      if (parsedBattery != null) {
        setDeviceState((current) => ({ ...current, batteryLevel: parsedBattery }))
      }

      if (packet.type === PacketType.CommandResponse && CMD_RESP_INGEST_ENABLED) {
        const deviceId = bleManager.getDeviceId() || "unknown"
        commandResponseForwarder.push({
          deviceId,
          command: packet.command,
          commandName: CommandNumber[packet.command] ?? `unknown_${packet.command}`,
          sequence: packet.sequence,
          rawPayload: packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          capturedAt: new Date().toISOString(),
        })
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetHelloHarvard &&
        packet.data.length > 7
      ) {
        setDeviceState((current) => ({ ...current, isCharging: packet.data[7] !== 0 }))
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetScheduledAlarm
      ) {
        const scheduledAlarm = parseScheduledAlarm(packet)
        setDeviceState((current) => ({
          ...current,
          strapAlarmAt: scheduledAlarm,
          strapAlarmArmed: scheduledAlarm != null,
        }))
      }

      if (packet.type === PacketType.CommandResponse) {
        const version = parseVersionInfo(packet)
        if (version != null) {
          setDeviceState((current) => ({ ...current, firmwareVersion: version }))
        }
        const clock = parseDeviceClock(packet)
        if (clock != null) {
          setDeviceState((current) => ({ ...current, deviceClock: clock }))
        }
        if (packet.command === CommandNumber.GetHelloHarvard && packet.data.length > 116) {
          setDeviceState((current) => ({ ...current, isWorn: packet.data[116] !== 0 }))
        }
      }

      if (packet.type === PacketType.Event) {
        if (packet.command === EventNumber.BatteryLevel) {
          const parsed = parseBatteryLevelEvent(packet)
          if (parsed) {
            setDeviceState((current) => ({
              ...current,
              batteryLevel: parsed.socPct ?? current.batteryLevel,
              batteryVoltageMv: parsed.voltageMv ?? current.batteryVoltageMv,
            }))
          }
        } else if (packet.command === EventNumber.ExtendedBatteryInformation) {
          const parsed = parseExtendedBatteryEvent(packet)
          if (parsed) {
            setDeviceState((current) => ({
              ...current,
              batteryVoltageMv: parsed.voltageMv ?? current.batteryVoltageMv,
              batteryTemperatureC: parsed.temperatureC ?? current.batteryTemperatureC,
              batteryIconLevel: parsed.iconLevel ?? current.batteryIconLevel,
            }))
          }
        } else if (packet.command === EventNumber.ChargingOn) {
          setDeviceState((current) => ({ ...current, isCharging: true }))
        } else if (packet.command === EventNumber.ChargingOff) {
          setDeviceState((current) => ({ ...current, isCharging: false }))
        } else if (packet.command === EventNumber.StrapDrivenAlarmSet) {
          setDeviceState((current) => ({ ...current, strapAlarmArmed: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROn) {
          setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROff) {
          setDeviceState((current) => ({
            ...current,
            isRealtimeHeartRateEnabled: false,
            realtimeHeartRate: null,
            realtimeSamples: [],
          }))
        } else if (packet.command === EventNumber.RawDataCollectionOn) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: true }))
        } else if (packet.command === EventNumber.RawDataCollectionOff) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: false }))
        } else if (packet.command === EventNumber.WristOn) {
          setDeviceState((current) => ({ ...current, isWorn: true }))
        } else if (packet.command === EventNumber.WristOff) {
          setDeviceState((current) => ({ ...current, isWorn: false }))
        }

        const deviceId = bleManager.getDeviceId() || "unknown"
        eventForwarder.push({
          deviceId,
          eventNumber: packet.command,
          eventName: EventNumber[packet.command] ?? `unknown_${packet.command}`,
          rawPayload: packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          capturedAt: new Date().toISOString(),
        })
      }

      const realtimeHeartRate = parseRealtimeHeartRate(packet)
      if (realtimeHeartRate != null) {
        const sample = { timestamp: new Date().toISOString(), value: realtimeHeartRate }
        setDeviceState((current) => ({
          ...current,
          realtimeHeartRate,
          realtimeSamples: [...current.realtimeSamples.slice(-39), sample],
        }))

        realtimeForwarder.pushHR(
          realtimeHeartRate,
          packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          sample.timestamp,
        )
      }

      if (
        IMU_INGEST_ENABLED &&
        (packet.type === PacketType.RealtimeIMUStream ||
          packet.type === PacketType.HistoricalIMUStream)
      ) {
        const samples = parseIMUPacket(packet)
        if (samples) {
          const source =
            packet.type === PacketType.RealtimeIMUStream ? "realtime" : "historical"
          for (const s of samples) {
            imuForwarder.push({
              timestamp: s.timestamp.toISOString(),
              accelX: s.accelX,
              accelY: s.accelY,
              accelZ: s.accelZ,
              gyroX: s.gyroX,
              gyroY: s.gyroY,
              gyroZ: s.gyroZ,
              source,
            })
          }
        }
      }

      if (packet.type === PacketType.ConsoleLogs && packet.data.length > 7) {
        const raw = packet.data.slice(7)
        const filtered: number[] = []
        for (let i = 0; i < raw.length; i++) {
          if (i + 2 < raw.length && raw[i] === 0x34 && raw[i + 1] === 0x00 && raw[i + 2] === 0x01) {
            i += 2
            continue
          }
          filtered.push(raw[i])
        }
        if (filtered.length > 0) {
          const text = new TextDecoder().decode(new Uint8Array(filtered))
          consoleLogForwarder.push(text)
        }
      }

      if (packet.type === PacketType.RealtimeRawData && packet.data.length > 0) {
        realtimeForwarder.pushRaw(null, uint8ArrayToBase64(packet.data), new Date().toISOString())
      }
    })

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let isBackground = AppState.currentState !== "active"
    const appStateSub = AppState.addEventListener("change", (next) => {
      const wasForeground = !isBackground
      isBackground = next !== "active"
      if (wasForeground && isBackground) {
        runBackgroundDrain(15_000).catch((err) =>
          console.warn("[bg-flush-on-background] failed", err),
        )
      }
    })

    const unsubscribePacketsForDrain = bleManager.onPacket("*", () => {
      if (!isBackground) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        runBackgroundDrain(15_000).catch((err) =>
          console.warn("[bg-packet-drain] failed", err),
        )
      }, 1500)
    })

    const syncTimer = setInterval(() => {
      maybeAutoSync().catch(() => undefined)
    }, 2 * 60 * 1000)

    // SOC changes slowly on a multi-day-life device. 30s polling was
    // pure BLE traffic for no benefit. 5 min is plenty for the UI.
    const batteryPollTimer = setInterval(() => {
      if (bleManager.connectionState !== "ready") return
      bleManager.writeCommand(commandService.buildGetBatteryLevel()).catch(() => undefined)
    }, 5 * 60 * 1000)

    const unsubscribeMemfault = bleManager.onMemfault((base64Chunk) => {
      consoleLogForwarder.pushLine(`[MEMFAULT base64=${base64Chunk}]`)
    })

    return () => {
      unsubscribeState()
      unsubscribePackets()
      unsubscribePacketsForDrain()
      unsubscribeMemfault()
      appStateSub.remove()
      clearInterval(syncTimer)
      clearInterval(batteryPollTimer)
      eventForwarder.stop()
      commandResponseForwarder.stop()
      imuForwarder.stop()
      realtimeForwarder.endSession()
      consoleLogForwarder.stop()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [maybeAutoSync, refreshDeviceState])

  const value = useMemo<BleContextValue>(
    () => ({
      connectionState: deviceState.connectionState,
      deviceName: deviceState.deviceName,
      batteryLevel: deviceState.batteryLevel,
      batteryVoltageMv: deviceState.batteryVoltageMv,
      batteryTemperatureC: deviceState.batteryTemperatureC,
      batteryIconLevel: deviceState.batteryIconLevel,
      isCharging: deviceState.isCharging,
      isBusy: deviceState.isBusy,
      isRealtimeHeartRateEnabled: deviceState.isRealtimeHeartRateEnabled,
      isBroadcastHeartRateEnabled: deviceState.isBroadcastHeartRateEnabled,
      isRawDataStreamingEnabled: deviceState.isRawDataStreamingEnabled,
      realtimeHeartRate: deviceState.realtimeHeartRate,
      realtimeSamples: deviceState.realtimeSamples,
      liveStressLevel: deriveLiveStressLevel(
        deviceState.realtimeSamples,
        homeView?.activities.baselineRhr ?? LIVE_STRESS_RESTING_BPM_DEFAULT,
      ),
      strapAlarmAt: deviceState.strapAlarmAt,
      strapAlarmArmed: deviceState.strapAlarmArmed,
      isWorn: deviceState.isWorn,
      lastSyncAt: deviceState.lastSyncAt,
      firmwareVersion: deviceState.firmwareVersion,
      deviceClock: deviceState.deviceClock,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshStrapMetadata: refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      rebootStrap,
      powerCycleStrap,
      probeDataRange,
      clearError,
    }),
    [
      deviceState,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      rebootStrap,
      powerCycleStrap,
      probeDataRange,
      clearError,
    ],
  )

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>
}

export function useBle() {
  const context = useContext(BleContext)
  if (!context) throw new Error("useBle must be used within BleProvider")
  return context
}
