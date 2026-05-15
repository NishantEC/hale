import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import { useAuth } from "@/context/AuthContext"
import {
  fetchHomeView,
  fetchResults,
  fetchSleepView,
  HealthMonitorSummary,
  HomeViewModel,
  MonitorState,
  PipelineResults,
  SleepPlanInput,
  SleepViewModel,
  StressMonitorSummary,
  updateSleepPlan,
} from "../services/api/noopClient"
import { scoreToZone } from "@/utils/stressZone"
import { openDatabase } from "../services/db"
import { getViewCache, setViewCache } from "../services/db/repositories/viewCache"

type DashboardContextValue = {
  selectedDate: string
  homeView: HomeViewModel | null
  sleepView: SleepViewModel | null
  isRefreshing: boolean
  error: string | null
  setSelectedDate: (date: string) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  refreshDashboard: () => Promise<void>
  saveSleepPlan: (input: SleepPlanInput) => Promise<void>
  clearError: () => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

function deriveMonitorsFallback(
  view: Omit<HomeViewModel, "monitors">,
): { health: HealthMonitorSummary; stress: StressMonitorSummary } {
  const activities = view.activities

  const hrvNum = activities.hrvMs != null ? activities.hrvMs : null
  const rhrNum = activities.baselineRhr != null ? activities.baselineRhr : null
  const inRangeCount = [hrvNum, rhrNum].filter((n) => n != null).length + 2 // RR + SpO2 always considered ok in fallback
  const healthState: MonitorState = inRangeCount === 4 ? "ok" : "warn"

  const health: HealthMonitorSummary = {
    state: healthState,
    verdict: healthState === "ok" ? "Within range" : "Check vitals",
    inRangeCount,
    totalMetrics: 4,
    staleSinceMs: null,
  }

  const stressStr = activities.stress
  const stressNum =
    stressStr && stressStr !== "--" ? parseFloat(stressStr) : null
  const stress: StressMonitorSummary = {
    state: stressNum == null ? "stale" : "ok",
    score: stressNum,
    zone: scoreToZone(stressNum),
    lastReadingAt: null,
    todayStrip: new Array(12).fill(null),
    timeInZone: { calm: 0, moderate: 0, high: 0 },
  }

  return { health, stress }
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

function pickForSelectedDay<T extends Record<string, any>>(
  items: T[],
  dateField: string,
  selectedKey: string,
) {
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
    results.sleepPlan?.targetSleepMinutes ?? results.sleepPlan?.wakeTargetMinutes ?? 480

  const base: Omit<HomeViewModel, "monitors"> = {
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
      hrv: feature?.rmssd != null ? `${Math.round(feature.rmssd)}` : "--",
      hrvMs: feature?.rmssd ?? null,
      restingHr:
        feature?.restingHeartRate != null ? `${Math.round(feature.restingHeartRate)}` : "--",
      baselineRhr: null,
      odiPerHour: (metric as any)?.odiPerHour ?? null,
      stress: metric?.stressAverage != null ? `${Math.round(metric.stressAverage)}` : "--",
      spo2: metric?.spo2Average != null ? `${metric.spo2Average.toFixed(1)}%` : "--",
      skinTemp:
        metric?.skinTempAvgCelsius != null ? `${metric.skinTempAvgCelsius.toFixed(1)}C` : "--",
      strain: metric?.strainScore != null ? `${metric.strainScore.toFixed(0)}` : "--",
      skinTempDelta:
        metric?.skinTempDeltaCelsius != null
          ? `${metric.skinTempDeltaCelsius.toFixed(1)}C`
          : "--",
      trainingLoad:
        (metric as any)?.trainingLoadRatio != null
          ? `${(metric as any).trainingLoadRatio.toFixed(2)}`
          : "--",
      trainingLoadRiskZone: (metric as any)?.trainingLoadRiskZone ?? "--",
      spo2Dips:
        (metric as any)?.spo2DipCount != null ? `${(metric as any).spo2DipCount}` : "--",
      activityFeed: [],
      totalActiveMinutes: "--",
      activityCount: 0,
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
    pendingActivityCards: [],
  }
  return {
    ...base,
    monitors: deriveMonitorsFallback(base),
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
    hrvTrend: (results.nightFeatures ?? [])
      .filter((f) => f.rmssd != null && f.rmssd > 0)
      .map((f) => ({ timestamp: new Date(f.nightDate).toISOString(), value: f.rmssd })),
    metrics: [
      {
        label: "Recovery",
        value: score?.dailyBalance != null ? `${score.dailyBalance}%` : "--",
        detail: score?.recommendation ?? null,
      },
      {
        label: "Sleep Reserve",
        value:
          score?.sleepReserveHours != null ? `${score.sleepReserveHours.toFixed(1)}h` : "--",
        detail: null,
      },
      {
        label: "Efficiency",
        value:
          totalInBedMinutes && detection?.durationHours != null
            ? `${Math.round((detection.durationHours * 60 * 100) / totalInBedMinutes)}%`
            : "--",
        detail: null,
      },
      {
        label: "Interruptions",
        value: detection?.interruptionCount != null ? `${detection.interruptionCount}` : "--",
        detail: null,
      },
      {
        label: "Resting HR",
        value:
          feature?.restingHeartRate != null
            ? `${Math.round(feature.restingHeartRate)} bpm`
            : "--",
        detail: null,
      },
      {
        label: "HRV (RMSSD)",
        value: feature?.rmssd != null ? `${Math.round(feature.rmssd)} ms` : "--",
        detail: null,
      },
      {
        label: "Respiratory Rate",
        value:
          feature?.respiratoryRate != null ? `${feature.respiratoryRate.toFixed(1)} rpm` : "--",
        detail: null,
      },
      {
        label: "Consistency",
        value:
          metric?.sleepConsistencyScore != null
            ? `${Math.round(metric.sleepConsistencyScore)}`
            : "--",
        detail: "/ 100",
      },
    ],
    factorInsights: (results.journalCorrelations ?? []).map((item) => {
      const deepMin = Math.round(item.avgDeepDelta ?? 0)
      const remMin = Math.round(item.avgRemDelta ?? 0)
      return {
        factorTag: item.factorTag,
        occurrences: item.sampleCount ?? 0,
        deepMin,
        remMin,
        awakeMin: 0,
        effectSize: Math.max(Math.abs(deepMin), Math.abs(remMin)),
      }
    }),
    planner: {
      targetSleepMinutes,
      wakeMinutes,
      alarmEnabled: results.sleepPlan?.alarmEnabled ?? false,
      alarmMinutes,
      smartWakeEnabled: results.sleepPlan?.smartWakeEnabled ?? false,
      alarmStatusText: results.sleepPlan?.alarmEnabled ? "Legacy plan active" : "Alarm disabled",
      sleepReserveText:
        score?.sleepReserveHours != null ? `${score.sleepReserveHours.toFixed(1)}h` : "--",
      estimatedSleepHours:
        feature?.sleepEstimateHours != null
          ? `${feature.sleepEstimateHours.toFixed(1)} h`
          : "--",
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
    score: {
      value: score?.dailyBalance ?? null,
      label: score?.recommendation ?? "Unknown",
      confidence: score?.confidence ?? "Low",
      detail: score?.detail ?? "",
      deltaVsWeek: null,
    },
    vitalsDelta: {
      efficiency: null,
      rhr: null,
      hrv: null,
      skinTempDelta: null,
    },
  }
}

export const DashboardProvider: FC<PropsWithChildren> = ({ children }) => {
  const { authToken, isAuthenticated } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [homeView, setHomeView] = useState<HomeViewModel | null>(null)
  const [sleepView, setSleepView] = useState<SleepViewModel | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const loadDashboardForDate = useCallback(
    async (showRefreshSpinner: boolean) => {
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
        const db = openDatabase()
        const [cachedHome, cachedSleep] = await Promise.all([
          getViewCache<HomeViewModel>(db, "home", selectedDate),
          getViewCache<SleepViewModel>(db, "sleep", selectedDate),
        ])
        if (cachedHome) setHomeView(cachedHome)
        if (cachedSleep) setSleepView(cachedSleep)
      } catch (cacheErr) {
        console.warn("[dashboard] cache read failed", cacheErr)
      }

      try {
        const [nextHomeView, nextSleepView] = await Promise.all([
          fetchHomeView(selectedDate),
          fetchSleepView(selectedDate),
        ])
        setHomeView(nextHomeView)
        setSleepView(nextSleepView)
        try {
          const db = openDatabase()
          await setViewCache(db, "home", selectedDate, nextHomeView)
          await setViewCache(db, "sleep", selectedDate, nextSleepView)
        } catch (cacheWriteErr) {
          console.warn("[dashboard] cache write failed", cacheWriteErr)
        }
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
    },
    [authToken, selectedDate],
  )

  const refreshDashboard = useCallback(async () => {
    await loadDashboardForDate(true)
  }, [loadDashboardForDate])

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
                    alarmStatusText: input.alarmEnabled
                      ? "Alarm enabled locally"
                      : "Alarm disabled",
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

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((current) => addDays(current, -1))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate((current) => addDays(current, 1))
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setHomeView(null)
      setSleepView(null)
      return
    }
    loadDashboardForDate(false).catch(() => undefined)
  }, [isAuthenticated, loadDashboardForDate])

  const value = useMemo<DashboardContextValue>(
    () => ({
      selectedDate,
      homeView,
      sleepView,
      isRefreshing,
      error,
      setSelectedDate,
      goToPreviousDay,
      goToNextDay,
      refreshDashboard,
      saveSleepPlan,
      clearError,
    }),
    [
      selectedDate,
      homeView,
      sleepView,
      isRefreshing,
      error,
      goToPreviousDay,
      goToNextDay,
      refreshDashboard,
      saveSleepPlan,
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
