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
  CommandNumber,
  CommandService,
  ConnectionState,
  ConsoleLogLineForwarder,
  createEventForwarder,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
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
  clearError: () => void
}

const BleContext = createContext<BleContextValue | null>(null)

const commandService = new CommandService()
const eventForwarder = createEventForwarder()
const consoleLogForwarder = new ConsoleLogLineForwarder()
const realtimeForwarder = new RealtimeSessionForwarder()

const emptyDeviceState: BleDeviceState = {
  connectionState: "disconnected",
  deviceName: null,
  batteryLevel: null,
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

function normalizeBatteryRaw(raw: number): number | null {
  if (raw <= 100) return raw
  if (raw <= 1000) return Math.round(raw / 10)
  if (raw >= 3000 && raw <= 4300) {
    return Math.round(Math.max(0, Math.min(100, ((raw - 3300) / 900) * 100)))
  }
  if (raw <= 10000) return Math.round(raw / 100)
  if (raw <= 100000) return Math.round(raw / 1000)
  return null
}

function parseBatteryLevel(packet: WhoopPacket) {
  if (packet.command !== CommandNumber.GetBatteryLevel || packet.data.length < 2) return null

  const rawAt0 = readUint16LE(packet.data, 0)
  const normAt0 = rawAt0 != null ? normalizeBatteryRaw(rawAt0) : null

  if (packet.data.length >= 4) {
    const rawAt2 = readUint16LE(packet.data, 2)
    const normAt2 = rawAt2 != null ? normalizeBatteryRaw(rawAt2) : null
    if (normAt0 != null && normAt2 != null) return Math.min(normAt0, normAt2)
    return normAt2 ?? normAt0
  }

  return normAt0
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
  const { refreshDashboard, sleepView } = useDashboard()
  const { isAuthenticated } = useAuth()

  const [deviceState, setDeviceState] = useState<BleDeviceState>(emptyDeviceState)
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStage, setSyncStage] = useState("")
  const [syncProgress, setSyncProgress] = useState<DownloadProgress | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastAutoSyncAttemptAt = useRef<number>(0)

  const clearError = useCallback(() => setError(null), [])

  const refreshDeviceState = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildGetBatteryLevel())
      await bleManager.writeCommand(commandService.buildGetHelloHarvard())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      await bleManager.writeCommand(commandService.buildReportVersionInfo())
      await bleManager.writeCommand(commandService.buildGetClock())
      await bleManager.writeCommand(commandService.buildToggleRealtimeHR(true))
      await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(true))
      await bleManager.writeCommand(commandService.buildStartRawData())
    } catch {
      // Keep device refresh best-effort to avoid interrupting screen load.
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
        await refreshDeviceState()
      } catch (nextError: any) {
        setError(nextError?.message ?? "Connection failed")
      }
    },
    [refreshDeviceState],
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

    setIsSyncing(true)
    setSyncStage("Downloading from strap…")
    setSyncSummary(null)
    setError(null)

    try {
      const downloader = new HistoryDownloader()
      const records = await downloader.startDownload(setSyncProgress)
      console.log("[syncNow] download resolved with", records.length, "records")
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
        setSyncStage(`Writing ${records.length} records locally…`)
        const db = openDatabase()
        const mapped = records.map(historicalRecordToRawRow)
        console.log("[syncNow] calling ingestBleRecords for", mapped.length, "records")
        const ingestLocalResult = await ingestBleRecords(db, mapped)
        console.log("[syncNow] ingestBleRecords done", ingestLocalResult)

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
      setIsSyncing(false)
      setSyncStage("")
    }
  }, [refreshDashboard])

  const maybeAutoSync = useCallback(async () => {
    if (!isAuthenticated || isSyncing || bleManager.connectionState !== "ready") return

    const now = Date.now()
    if (now - lastAutoSyncAttemptAt.current < 60 * 1000) return

    if (deviceState.lastSyncAt) {
      const lastSyncMs = new Date(deviceState.lastSyncAt).getTime()
      if (!Number.isNaN(lastSyncMs) && now - lastSyncMs < 3 * 60 * 1000) {
        return
      }
    }

    lastAutoSyncAttemptAt.current = now
    await syncNow()
  }, [isAuthenticated, isSyncing, deviceState.lastSyncAt, syncNow])

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

  const armAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready" || !sleepView) {
      setError("Connect your WHOOP strap before arming the strap alarm.")
      return
    }

    const alarmDate = nextAlarmDate(sleepView.planner.alarmMinutes)

    try {
      await bleManager.writeCommand(commandService.buildSetScheduledAlarm(alarmDate))
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: alarmDate.toISOString(),
        strapAlarmArmed: true,
      }))
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
        realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        consoleLogForwarder.start(bleManager.getDeviceId() || "unknown")
        refreshDeviceState().catch(() => undefined)
        maybeAutoSync().catch(() => undefined)
      }

      if (connectionState === "ready") {
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
        if (packet.command === EventNumber.ChargingOn) {
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
        packet.type === PacketType.RealtimeIMUStream ||
        packet.type === PacketType.HistoricalIMUStream
      ) {
        console.log(
          `[IMU] Received ${packet.type === PacketType.RealtimeIMUStream ? "realtime" : "historical"} IMU packet (${packet.data.length} bytes)`,
        )
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

    return () => {
      unsubscribeState()
      unsubscribePackets()
      unsubscribePacketsForDrain()
      appStateSub.remove()
      clearInterval(syncTimer)
      eventForwarder.stop()
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
      isCharging: deviceState.isCharging,
      isBusy: deviceState.isBusy,
      isRealtimeHeartRateEnabled: deviceState.isRealtimeHeartRateEnabled,
      isBroadcastHeartRateEnabled: deviceState.isBroadcastHeartRateEnabled,
      isRawDataStreamingEnabled: deviceState.isRawDataStreamingEnabled,
      realtimeHeartRate: deviceState.realtimeHeartRate,
      realtimeSamples: deviceState.realtimeSamples,
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
