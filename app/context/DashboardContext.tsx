import AsyncStorage from "@react-native-async-storage/async-storage"
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

import { useAuth } from "@/context/AuthContext"
import {
  bleManager,
  CommandNumber,
  CommandService,
  ConnectionState,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
  ScannedDevice,
  WhoopPacket,
} from "@/services/ble"
import {
  fetchHomeView,
  fetchResults,
  fetchSleepView,
  HomeViewModel,
  ingestHistoricalRecords,
  PipelineResults,
  runPipeline,
  setSessionToken,
  SeriesPoint,
  SleepPlanInput,
  SleepViewModel,
  updateSleepPlan,
} from "@/services/api/noopClient"

const LAST_SYNC_KEY = "noop.lastSyncTimestamp"
const REALTIME_HR_KEY = "noop.prefersRealtimeHeartRate"
const BROADCAST_HR_KEY = "noop.prefersBroadcastHeartRate"
const RAW_STREAM_KEY = "noop.prefersRawDataStream"

type SyncSummary = {
  nights: number
  stages: number
  scores: number
}

type LiveDeviceState = {
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
  lastSyncAt: string | null
}

type DashboardContextValue = {
  selectedDate: string
  homeView: HomeViewModel | null
  sleepView: SleepViewModel | null
  liveDeviceState: LiveDeviceState
  scannedDevices: ScannedDevice[]
  isRefreshing: boolean
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  error: string | null
  setSelectedDate: (date: string) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  refreshDashboard: () => Promise<void>
  scan: () => Promise<void>
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  refreshStrapMetadata: () => Promise<void>
  toggleRealtimeHeartRate: (enabled: boolean) => Promise<void>
  toggleBroadcastHeartRate: (enabled: boolean) => Promise<void>
  toggleRawDataStreaming: (enabled: boolean) => Promise<void>
  saveSleepPlan: (input: SleepPlanInput) => Promise<void>
  armAlarm: () => Promise<void>
  disarmAlarm: () => Promise<void>
  testAlarm: () => Promise<void>
  clearError: () => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

const commandService = new CommandService()

const emptyDeviceState: LiveDeviceState = {
  connectionState: "disconnected",
  deviceName: null,
  batteryLevel: null,
  isCharging: false,
  isBusy: false,
  isRealtimeHeartRateEnabled: true,
  isBroadcastHeartRateEnabled: false,
  isRawDataStreamingEnabled: false,
  realtimeHeartRate: null,
  realtimeSamples: [],
  strapAlarmAt: null,
  strapAlarmArmed: false,
  lastSyncAt: null,
}

function todayKey() {
  return dayKeyForDate(new Date())
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function addDays(key: string, days: number) {
  const next = dateFromKey(key)
  next.setDate(next.getDate() + days)
  return dayKeyForDate(next)
}

function dayKeyForDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function normalizeBatteryPercent(raw: number) {
  if (raw <= 0) return 0
  if (raw <= 100) return raw
  if (raw <= 1_000) return raw / 10
  if (raw >= 3_000 && raw <= 4_300) {
    return Math.max(0, Math.min(100, ((raw - 3_300) / (4_200 - 3_300)) * 100))
  }
  if (raw <= 10_000) return raw / 100
  if (raw <= 100_000) return raw / 1_000
  return null
}

function parseUint16LE(data: Uint8Array, offset: number) {
  if (offset + 1 >= data.length) return null
  return data[offset] | (data[offset + 1] << 8)
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

function parseBatteryLevel(packet: WhoopPacket) {
  if (packet.command !== CommandNumber.GetBatteryLevel || packet.data.length === 0) return null

  const fixedCandidates = [parseUint16LE(packet.data, 2), parseUint16LE(packet.data, 0)]
    .map((value) => (value == null ? null : normalizeBatteryPercent(value)))
    .filter((value): value is number => value != null)

  if (fixedCandidates.length > 0) return Math.round(fixedCandidates[0])

  const byteCandidates = Array.from(packet.data)
    .filter((value) => value <= 100)
    .sort((left, right) => right - left)

  const bestByte = byteCandidates.find((value) => value >= 2) ?? byteCandidates[0]
  return bestByte ?? null
}

function parseScheduledAlarm(packet: WhoopPacket, now = new Date()) {
  if (packet.command !== CommandNumber.GetScheduledAlarm) return null

  const nowUnix = Math.floor(now.getTime() / 1000)
  const lowerBound = nowUnix - 365 * 24 * 60 * 60
  const upperBound = nowUnix + 365 * 24 * 60 * 60
  let sawZero = false

  for (let offset = 0; offset <= Math.min(16, packet.data.length - 4); offset += 1) {
    const value = parseUint32LE(packet.data, offset)
    if (value == null) continue
    if (value === 0) {
      sawZero = true
      continue
    }
    if (value >= lowerBound && value <= upperBound) {
      return new Date(value * 1000).toISOString()
    }
  }

  return sawZero ? null : null
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

function formatSelectedDateTitle(dateKey: string) {
  const date = dateFromKey(dateKey)
  const today = todayKey()
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)

  if (dateKey === today) return "Today"
  if (dateKey === yesterday) return "Yesterday"
  if (dateKey === tomorrow) return "Tomorrow"

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}

function formatSelectedDateSubtitle(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromKey(dateKey))
}

function formatDurationHours(hours?: number | null) {
  if (hours == null) return "--"
  const totalMinutes = Math.round(hours * 60)
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`
}

function formatMinutes(minutes?: number | null) {
  if (minutes == null) return "--"
  return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`
}

function formatTimeOnly(value?: string | Date | null) {
  if (!value) return "--"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

function pointDateKey(value?: string | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return dayKeyForDate(date)
}

function pickForSelectedDay<T extends Record<string, any>>(items: T[], dateField: string, selectedKey: string) {
  return (
    items.find((item) => pointDateKey(item?.[dateField]) === selectedKey) ??
    items[items.length - 1] ??
    null
  )
}

function pickSleepForSelectedDay<T extends Record<string, any>>(
  items: T[],
  dateField: string,
  selectedKey: string,
) {
  const exact = items.find((item) => pointDateKey(item?.[dateField]) === selectedKey) ?? null
  if (exact) return exact
  if (selectedKey === todayKey()) {
    return items[items.length - 1] ?? null
  }
  return null
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function computeSleepRing(durationHours?: number | null, targetSleepMinutes = 480) {
  if (durationHours == null) {
    return { value: "--", progress: 0 }
  }
  const pct = Math.max(0, Math.min(100, (durationHours / (targetSleepMinutes / 60)) * 100))
  return { value: `${Math.round(pct)}%`, progress: clamp01(pct / 100) }
}

function isViewsApiUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()
  return (
    normalized.includes("server returned html instead of json") ||
    normalized.includes("/views") ||
    normalized.includes("404") ||
    normalized.includes("not found")
  )
}

function buildLegacyHomeView(results: PipelineResults, selectedKey: string): HomeViewModel {
  const selectedDateTitle = formatSelectedDateTitle(selectedKey)
  const selectedDateSubtitle = formatSelectedDateSubtitle(selectedKey)
  const score = pickForSelectedDay(results.dailyScores ?? [], "dayDate", selectedKey)
  const metric = pickForSelectedDay(results.dailyMetrics ?? [], "dayDate", selectedKey)
  const detection = pickSleepForSelectedDay(results.sleepDetections ?? [], "nightDate", selectedKey)
  const feature = pickSleepForSelectedDay(results.nightFeatures ?? [], "nightDate", selectedKey)
  const targetSleepMinutes =
    results.sleepPlan?.targetSleepMinutes ??
    results.sleepPlan?.wakeTargetMinutes ??
    480

  return {
    selectedDate: selectedKey,
    selectedDateTitle,
    selectedDateSubtitle,
    topStrip: {
      title: selectedDateTitle,
      subtitle: selectedDateSubtitle,
    },
    rings: {
      sleep: computeSleepRing(detection?.durationHours, targetSleepMinutes),
      recovery: {
        value: score?.dailyBalance != null ? `${score.dailyBalance}%` : "--",
        progress: clamp01((score?.dailyBalance ?? 0) / 100),
      },
      strain: {
        value: metric?.strainScore != null ? `${Math.round(metric.strainScore)}` : "--",
        progress: clamp01((metric?.strainScore ?? 0) / 21),
      },
    },
    cards: {
      recommendation: {
        title: score?.recommendation ?? "--",
        subtitle: selectedDateSubtitle,
        footer: "Health monitor",
      },
      stress: {
        title: metric?.stressAverage != null ? `${Math.round(metric.stressAverage)}` : "--",
        subtitle: "Stress level",
        footer: "Stress monitor",
      },
      loadPressure: {
        title: score?.loadPressure != null ? `${score.loadPressure}` : "--",
        subtitle: "Load pressure",
        footer: "Daily load",
      },
      liveHeartRate: {
        title: "--",
        subtitle: "Offline",
        footer: "Heart rate",
      },
    },
    todayOverview: {
      headline: score?.recommendation ?? "Daily overview unavailable",
      detail:
        score?.detail ??
        "Using legacy pipeline results while the dedicated views API is unavailable.",
      dailyBalance: score?.dailyBalance != null ? `${score.dailyBalance}` : "--",
      loadPressure: score?.loadPressure != null ? `${score.loadPressure}` : "--",
      sleepReserve:
        score?.sleepReserveHours != null ? `${score.sleepReserveHours.toFixed(1)}h` : "--",
      confidence: score?.confidence ?? "Low",
      dateLabel: `${selectedDateTitle} · ${selectedDateSubtitle}`,
    },
    activities: {
      stress: metric?.stressAverage != null ? `${Math.round(metric.stressAverage)}` : "--",
      spo2: metric?.spo2Average != null ? `${metric.spo2Average.toFixed(1)}%` : "--",
      skinTemp:
        metric?.skinTempAvgCelsius != null ? `${metric.skinTempAvgCelsius.toFixed(1)}C` : "--",
      strain: metric?.strainScore != null ? `${metric.strainScore.toFixed(0)}` : "--",
      skinTempDelta:
        metric?.skinTempDeltaCelsius != null ? `${metric.skinTempDeltaCelsius.toFixed(1)}C` : "--",
    },
    confidence: {
      confidence: score?.confidence ?? "Low",
      pipelineStatus: "Legacy pipeline results",
      sourceBlend: feature?.sourceBlend ?? "No data",
      storageMode: "Legacy fallback",
      persistenceHealth: results.dailyScores?.length ? "Healthy" : "Unavailable",
      disclaimer: "Using /pipeline/results because the /views API is unavailable on the server.",
    },
    trendSummary: {
      summary: "Legacy pipeline trend",
      samples: (results.dailyScores ?? []).map((item) => ({
        timestamp: new Date(item.dayDate).toISOString(),
        value: item.dailyBalance ?? 0,
      })),
    },
    stressTrend: (results.dailyMetrics ?? [])
      .filter((item) => item.stressAverage != null)
      .map((item) => ({
        timestamp: new Date(item.dayDate).toISOString(),
        value: item.stressAverage,
      })),
    strainTrend: (results.dailyMetrics ?? [])
      .filter((item) => item.strainScore != null)
      .map((item) => ({
        timestamp: new Date(item.dayDate).toISOString(),
        value: item.strainScore,
      })),
    noDataReasons: {
      recovery: "Run sync again to compute daily balance.",
      strain: "Need enough daily heart-rate coverage for strain.",
      stress: "Need enough RR/IBI coverage for stress.",
      loadPressure: "Load pressure comes from the daily score pipeline.",
      liveHeartRate: "Live heart-rate requires a connected strap.",
      activities: "Activity summary needs pipeline data.",
    },
  }
}

function buildLegacySleepView(results: PipelineResults, selectedKey: string): SleepViewModel {
  const selectedDateTitle = formatSelectedDateTitle(selectedKey)
  const selectedDateSubtitle = formatSelectedDateSubtitle(selectedKey)
  const detection = pickSleepForSelectedDay(results.sleepDetections ?? [], "nightDate", selectedKey)
  const stage = pickSleepForSelectedDay(results.sleepStages ?? [], "nightDate", selectedKey)
  const score = pickForSelectedDay(results.dailyScores ?? [], "dayDate", selectedKey)
  const metric = pickForSelectedDay(results.dailyMetrics ?? [], "dayDate", selectedKey)
  const feature = pickSleepForSelectedDay(results.nightFeatures ?? [], "nightDate", selectedKey)
  const targetSleepMinutes = results.sleepPlan?.targetSleepMinutes ?? 480
  const wakeMinutes = results.sleepPlan?.wakeMinutes ?? 420
  const alarmMinutes = results.sleepPlan?.alarmMinutes ?? wakeMinutes

  const deepMinutes = stage?.deepMinutes ?? stage?.deepDurationMin ?? 0
  const remMinutes = stage?.remMinutes ?? stage?.remDurationMin ?? 0
  const coreMinutes = stage?.coreMinutes ?? stage?.lightMinutes ?? stage?.lightDurationMin ?? 0
  const awakeMinutes = stage?.awakeMinutes ?? stage?.awakeDurationMin ?? 0
  const totalInBedMinutes = Math.max(awakeMinutes + deepMinutes + remMinutes + coreMinutes, 0)

  return {
    selectedDate: selectedKey,
    selectedDateTitle,
    selectedDateSubtitle,
    emptyState: {
      isEmpty: !detection,
      title: "No sleep data yet",
      subtitle: "Wear your strap tonight to see your first sleep breakdown.",
      support: "Using legacy pipeline fallback.",
    },
    header: {
      bedtime: formatTimeOnly(detection?.bedtime ?? detection?.sleepOnset),
      wakeTime: formatTimeOnly(detection?.wakeTime ?? detection?.end),
      duration: formatDurationHours(detection?.durationHours),
      restorative: formatMinutes(deepMinutes + remMinutes),
      timeInBed: formatMinutes(totalInBedMinutes),
      durationVsTypical: "",
      restorativeVsTypical: "",
    },
    sleepInsight:
      feature?.sleepEstimateHours != null
        ? `Estimated sleep ${feature.sleepEstimateHours.toFixed(1)}h from legacy pipeline results.`
        : null,
    hrChart: { samples: [] },
    stageRows: totalInBedMinutes
      ? [
          {
            id: "awake",
            label: "AWAKE",
            percent: Math.round((awakeMinutes / totalInBedMinutes) * 100),
            durationFormatted: formatMinutes(awakeMinutes),
            color: "#8E8E93",
            barFraction: awakeMinutes / totalInBedMinutes,
            typicalRange: null,
          },
          {
            id: "light",
            label: "LIGHT",
            percent: Math.round((coreMinutes / totalInBedMinutes) * 100),
            durationFormatted: formatMinutes(coreMinutes),
            color: "#8066E6",
            barFraction: coreMinutes / totalInBedMinutes,
            typicalRange: null,
          },
          {
            id: "deep",
            label: "SWS (DEEP)",
            percent: Math.round((deepMinutes / totalInBedMinutes) * 100),
            durationFormatted: formatMinutes(deepMinutes),
            color: "#D94D80",
            barFraction: deepMinutes / totalInBedMinutes,
            typicalRange: null,
          },
          {
            id: "rem",
            label: "REM",
            percent: Math.round((remMinutes / totalInBedMinutes) * 100),
            durationFormatted: formatMinutes(remMinutes),
            color: "#B333CC",
            barFraction: remMinutes / totalInBedMinutes,
            typicalRange: null,
          },
        ]
      : [],
    epochTimeline: ((stage?.epochTimeline as any[]) ?? []).map((item) => ({
      timestamp: new Date(item.timestamp).toISOString(),
      stage: item.stage ?? "light",
    })),
    durationTrend: {
      targetHours: targetSleepMinutes / 60,
      samples: (results.sleepDetections ?? []).map((item) => ({
        timestamp: new Date(item.nightDate).toISOString(),
        value: item.durationHours ?? 0,
      })),
    },
    sleepScoreTrend: (results.dailyScores ?? []).map((item) => ({
      timestamp: new Date(item.dayDate).toISOString(),
      value: item.dailyBalance ?? 0,
    })),
    metrics: [
      { label: "Recovery", value: score?.dailyBalance != null ? `${score.dailyBalance}%` : "--", detail: score?.recommendation ?? null },
      { label: "Sleep Reserve", value: score?.sleepReserveHours != null ? `${score.sleepReserveHours.toFixed(1)}h` : "--", detail: null },
      { label: "Efficiency", value: totalInBedMinutes && detection?.durationHours != null ? `${Math.round((detection.durationHours * 60 * 100) / totalInBedMinutes)}%` : "--", detail: null },
      { label: "Interruptions", value: detection?.interruptionCount != null ? `${detection.interruptionCount}` : "--", detail: null },
      { label: "Resting HR", value: feature?.restingHeartRate != null ? `${Math.round(feature.restingHeartRate)} bpm` : "--", detail: null },
      { label: "HRV (RMSSD)", value: feature?.rmssd != null ? `${Math.round(feature.rmssd)} ms` : "--", detail: null },
      { label: "Respiratory Rate", value: feature?.respiratoryRate != null ? `${feature.respiratoryRate.toFixed(1)} rpm` : "--", detail: null },
      { label: "Consistency", value: metric?.sleepConsistencyScore != null ? `${Math.round(metric.sleepConsistencyScore)}` : "--", detail: "/ 100" },
    ],
    factorInsights: (results.journalCorrelations ?? []).map((item) => ({
      factorTag: item.factorTag,
      deepDelta: item.avgDeepDelta != null ? `${Math.round(item.avgDeepDelta)}m deep` : null,
      remDelta: item.avgRemDelta != null ? `${Math.round(item.avgRemDelta)}m REM` : null,
      sampleCount: item.sampleCount ?? 0,
    })),
    planner: {
      targetSleepMinutes,
      wakeMinutes,
      alarmEnabled: results.sleepPlan?.alarmEnabled ?? false,
      alarmMinutes,
      smartWakeEnabled: results.sleepPlan?.smartWakeEnabled ?? false,
      alarmStatusText: results.sleepPlan?.alarmEnabled ? "Legacy plan active" : "Alarm disabled",
      sleepReserveText: score?.sleepReserveHours != null ? `${score.sleepReserveHours.toFixed(1)}h` : "--",
      estimatedSleepHours: feature?.sleepEstimateHours != null ? `${feature.sleepEstimateHours.toFixed(1)} h` : "--",
      smartWakeStatusText: results.sleepPlan?.smartWakeEnabled ? "Smart wake enabled" : "",
    },
    confidence: {
      confidence: score?.confidence ?? "Low",
      pipelineStatus: "Legacy pipeline results",
      sourceBlend: feature?.sourceBlend ?? "No data",
      storageMode: "Legacy fallback",
      persistenceHealth: results.dailyScores?.length ? "Healthy" : "Unavailable",
      disclaimer: "Using /pipeline/results because the /views API is unavailable on the server.",
    },
  }
}

export const DashboardProvider: FC<PropsWithChildren> = ({ children }) => {
  const { authToken, isAuthenticated } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [homeView, setHomeView] = useState<HomeViewModel | null>(null)
  const [sleepView, setSleepView] = useState<SleepViewModel | null>(null)
  const [liveDeviceState, setLiveDeviceState] = useState<LiveDeviceState>(emptyDeviceState)
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStage, setSyncStage] = useState("")
  const [syncProgress, setSyncProgress] = useState<DownloadProgress | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastAutoSyncAttemptAt = useRef<number>(0)

  const loadDashboardForDate = useCallback(async (showRefreshSpinner: boolean) => {
    if (!authToken) {
      setHomeView(null)
      setSleepView(null)
      return
    }

    if (showRefreshSpinner) {
      setIsRefreshing(true)
    }
    setError(null)
    try {
      const [nextHomeView, nextSleepView] = await Promise.all([
        fetchHomeView(selectedDate),
        fetchSleepView(selectedDate),
      ])
      setHomeView(nextHomeView)
      setSleepView(nextSleepView)
    } catch (nextError: any) {
      if (isViewsApiUnavailable(nextError)) {
        try {
          const legacyResults = await fetchResults()
          setHomeView(buildLegacyHomeView(legacyResults, selectedDate))
          setSleepView(buildLegacySleepView(legacyResults, selectedDate))
          setError(null)
          return
        } catch (legacyError: any) {
          setError(legacyError?.message ?? "Failed to refresh dashboard")
          return
        }
      }

      setError(nextError?.message ?? "Failed to refresh dashboard")
    } finally {
      if (showRefreshSpinner) {
        setIsRefreshing(false)
      }
    }
  }, [authToken, selectedDate])

  const refreshDashboard = useCallback(async () => {
    await loadDashboardForDate(true)
  }, [loadDashboardForDate])

  const refreshDeviceState = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildGetBatteryLevel())
      await bleManager.writeCommand(commandService.buildGetHelloHarvard())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      await bleManager.writeCommand(
        commandService.buildToggleRealtimeHR(liveDeviceState.isRealtimeHeartRateEnabled),
      )
      await bleManager.writeCommand(
        commandService.buildToggleGenericHRProfile(liveDeviceState.isBroadcastHeartRateEnabled),
      )
      await bleManager.writeCommand(
        liveDeviceState.isRawDataStreamingEnabled
          ? commandService.buildStartRawData()
          : commandService.buildStopRawData(),
      )
    } catch {
      // Keep device refresh best-effort to avoid interrupting screen load.
    }
  }, [
    liveDeviceState.isBroadcastHeartRateEnabled,
    liveDeviceState.isRawDataStreamingEnabled,
    liveDeviceState.isRealtimeHeartRateEnabled,
  ])

  const clearError = useCallback(() => setError(null), [])

  const persistDevicePreference = useCallback(async (key: string, value: boolean) => {
    await AsyncStorage.setItem(key, JSON.stringify(value))
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

  const connect = useCallback(async (deviceId: string) => {
    setError(null)
    try {
      await bleManager.connect(deviceId)
      setLiveDeviceState((current) => ({
        ...current,
        deviceName: bleManager.getDeviceName() || "WHOOP",
      }))
      await refreshDeviceState()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Connection failed")
    }
  }, [refreshDeviceState])

  const disconnect = useCallback(async () => {
    await bleManager.disconnect()
  }, [])

  const syncNow = useCallback(async () => {
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
      setSyncProgress((current) => ({
        state: "complete",
        chunksReceived: current?.chunksReceived ?? 0,
        recordsParsed: records.length,
        totalBytes: current?.totalBytes ?? 0,
      }))

      if (records.length > 0) {
        setSyncStage(`Uploading ${records.length} records…`)
        const ingestResult = await ingestHistoricalRecords(records)
        if ((ingestResult.sensorRecords ?? 0) <= 0) {
          throw new Error("Backend stored 0 sensor records. Check the ingest path.")
        }

        setSyncStage("Running pipeline…")
        await runPipeline()

        setSyncStage("Refreshing views…")
        const results = await fetchResults()
        setSyncSummary({
          nights: results.sleepDetections?.length ?? 0,
          stages: results.sleepStages?.length ?? 0,
          scores: results.dailyScores?.length ?? 0,
        })
      }

      const lastSyncAt = new Date().toISOString()
      await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncAt)
      setLiveDeviceState((current) => ({ ...current, lastSyncAt }))
      await refreshDashboard()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Sync failed")
    } finally {
      setIsSyncing(false)
      setSyncStage("")
    }
  }, [refreshDashboard])

  const maybeAutoSync = useCallback(async () => {
    if (!isAuthenticated || isSyncing || bleManager.connectionState !== "ready") return

    const now = Date.now()
    if (now - lastAutoSyncAttemptAt.current < 5 * 60 * 1000) return

    if (liveDeviceState.lastSyncAt) {
      const lastSyncMs = new Date(liveDeviceState.lastSyncAt).getTime()
      if (!Number.isNaN(lastSyncMs) && now - lastSyncMs < 15 * 60 * 1000) {
        return
      }
    }

    lastAutoSyncAttemptAt.current = now
    await syncNow()
  }, [isAuthenticated, isSyncing, liveDeviceState.lastSyncAt, syncNow])

  const toggleRealtimeHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setLiveDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: enabled }))
        await persistDevicePreference(REALTIME_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleRealtimeHR(enabled))
        setLiveDeviceState((current) => ({
          ...current,
          isRealtimeHeartRateEnabled: enabled,
          realtimeHeartRate: enabled ? current.realtimeHeartRate : null,
          realtimeSamples: enabled ? current.realtimeSamples : [],
        }))
        await persistDevicePreference(REALTIME_HR_KEY, enabled)
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle realtime heart rate")
      }
    },
    [persistDevicePreference],
  )

  const toggleBroadcastHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setLiveDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistDevicePreference(BROADCAST_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(enabled))
        setLiveDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistDevicePreference(BROADCAST_HR_KEY, enabled)
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle broadcast heart rate")
      }
    },
    [persistDevicePreference],
  )

  const toggleRawDataStreaming = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setLiveDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistDevicePreference(RAW_STREAM_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(
          enabled ? commandService.buildStartRawData() : commandService.buildStopRawData(),
        )
        setLiveDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistDevicePreference(RAW_STREAM_KEY, enabled)
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle raw data stream")
      }
    },
    [persistDevicePreference],
  )

  const saveSleepPlan = useCallback(
    async (input: SleepPlanInput) => {
      setError(null)
      try {
        const response = await updateSleepPlan(input)
        setSleepView(response.sleepView)
        const nextHomeView = await fetchHomeView(selectedDate)
        setHomeView(nextHomeView)
      } catch (nextError: any) {
        if (isViewsApiUnavailable(nextError)) {
          setSleepView((current) =>
            current
              ? {
                  ...current,
                  planner: {
                    ...current.planner,
                    ...input,
                    alarmStatusText: input.alarmEnabled ? "Alarm enabled locally" : "Alarm disabled",
                    smartWakeStatusText: input.smartWakeEnabled ? "Smart wake enabled" : "",
                  },
                }
              : current,
          )
          setError(null)
          return
        }

        setError(nextError?.message ?? "Failed to save sleep plan")
      }
    },
    [selectedDate],
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
      setLiveDeviceState((current) => ({
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
      setLiveDeviceState((current) => ({
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

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((current) => addDays(current, -1))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate((current) => addDays(current, 1))
  }, [])

  useEffect(() => {
    setSessionToken(authToken)
  }, [authToken])

  useEffect(() => {
    AsyncStorage.getItem(LAST_SYNC_KEY).then((lastSyncAt) => {
      setLiveDeviceState((current) => ({ ...current, lastSyncAt }))
    })
  }, [])

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(REALTIME_HR_KEY),
      AsyncStorage.getItem(BROADCAST_HR_KEY),
      AsyncStorage.getItem(RAW_STREAM_KEY),
    ]).then(([realtimeValue, broadcastValue, rawStreamValue]) => {
      setLiveDeviceState((current) => ({
        ...current,
        isRealtimeHeartRateEnabled:
          realtimeValue == null ? current.isRealtimeHeartRateEnabled : JSON.parse(realtimeValue),
        isBroadcastHeartRateEnabled:
          broadcastValue == null ? current.isBroadcastHeartRateEnabled : JSON.parse(broadcastValue),
        isRawDataStreamingEnabled:
          rawStreamValue == null ? current.isRawDataStreamingEnabled : JSON.parse(rawStreamValue),
      }))
    })
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setHomeView(null)
      setSleepView(null)
      return
    }
    loadDashboardForDate(false).catch(() => undefined)
  }, [isAuthenticated, loadDashboardForDate])

  useEffect(() => {
    bleManager.autoConnect().catch(() => undefined)

    const unsubscribeState = bleManager.onConnectionStateChange((connectionState) => {
      setLiveDeviceState((current) => {
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
        refreshDeviceState().catch(() => undefined)
        maybeAutoSync().catch(() => undefined)
      }
    })

    const unsubscribePackets = bleManager.onPacket("*", (packet) => {
      // If we're receiving packets, the device is connected — reconcile stale disconnected state
      setLiveDeviceState((current) => {
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
        setLiveDeviceState((current) => ({ ...current, batteryLevel: parsedBattery }))
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetHelloHarvard &&
        packet.data.length > 7
      ) {
        setLiveDeviceState((current) => ({ ...current, isCharging: packet.data[7] !== 0 }))
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetScheduledAlarm
      ) {
        const scheduledAlarm = parseScheduledAlarm(packet)
        setLiveDeviceState((current) => ({
          ...current,
          strapAlarmAt: scheduledAlarm,
          strapAlarmArmed: scheduledAlarm != null,
        }))
      }

      if (packet.type === PacketType.Event) {
        if (packet.command === EventNumber.BatteryLevel) {
          const battery = Array.from(packet.data)
            .filter((value) => value <= 100)
            .sort((left, right) => right - left)[0]
          if (battery != null) {
            setLiveDeviceState((current) => ({ ...current, batteryLevel: battery }))
          }
        } else if (packet.command === EventNumber.ChargingOn) {
          setLiveDeviceState((current) => ({ ...current, isCharging: true }))
        } else if (packet.command === EventNumber.ChargingOff) {
          setLiveDeviceState((current) => ({ ...current, isCharging: false }))
        } else if (packet.command === EventNumber.StrapDrivenAlarmSet) {
          setLiveDeviceState((current) => ({ ...current, strapAlarmArmed: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROn) {
          setLiveDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROff) {
          setLiveDeviceState((current) => ({
            ...current,
            isRealtimeHeartRateEnabled: false,
            realtimeHeartRate: null,
            realtimeSamples: [],
          }))
        } else if (packet.command === EventNumber.RawDataCollectionOn) {
          setLiveDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: true }))
        } else if (packet.command === EventNumber.RawDataCollectionOff) {
          setLiveDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: false }))
        }
      }

      const realtimeHeartRate = parseRealtimeHeartRate(packet)
      if (realtimeHeartRate != null) {
        const sample = { timestamp: new Date().toISOString(), value: realtimeHeartRate }
        setLiveDeviceState((current) => ({
          ...current,
          realtimeHeartRate,
          realtimeSamples: [...current.realtimeSamples.slice(-39), sample],
        }))
      }
    })

    return () => {
      unsubscribeState()
      unsubscribePackets()
    }
  }, [maybeAutoSync, refreshDeviceState])

  const value = useMemo<DashboardContextValue>(
    () => ({
      selectedDate,
      homeView,
      sleepView,
      liveDeviceState,
      scannedDevices,
      isRefreshing,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      setSelectedDate,
      goToPreviousDay,
      goToNextDay,
      refreshDashboard,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshStrapMetadata: refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      saveSleepPlan,
      armAlarm,
      disarmAlarm,
      testAlarm,
      clearError,
    }),
    [
      selectedDate,
      homeView,
      sleepView,
      liveDeviceState,
      scannedDevices,
      isRefreshing,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      goToPreviousDay,
      goToNextDay,
      refreshDashboard,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      saveSleepPlan,
      armAlarm,
      disarmAlarm,
      testAlarm,
      clearError,
    ],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) throw new Error("useDashboard must be used within DashboardProvider")
  return context
}
