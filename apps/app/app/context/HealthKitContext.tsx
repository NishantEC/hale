import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"
import { useMMKVBoolean } from "react-native-mmkv"

import {
  fetchDailySummary,
  fetchWorkoutsBetween,
  isAvailable,
  requestPermissions,
  type DailySummary,
  type HealthKitWorkout,
} from "@/services/healthkit"
import { getCharacteristics } from "@/services/healthkit/healthkit"
import { startAltimeter, stopAltimeter } from "@/services/altimeter/altimeter"
import { fetchProfile, pushHealthkitSync, updateProfile } from "@/services/api/noopClient"

/**
 * Read DOB + biological sex from the iOS Health app and write them to
 * the noop user profile — but only if the user hasn't already set
 * them manually. Idempotent; safe to call on every permission grant.
 */
async function syncDemographicsFromHealthKit(): Promise<void> {
  const characteristics = await getCharacteristics()
  if (!characteristics.dateOfBirth && !characteristics.biologicalSex) return
  try {
    const existing = await fetchProfile()
    const patch: Partial<{ dateOfBirth: string; biologicalSex: "male" | "female" | "other" }> = {}
    if (characteristics.dateOfBirth && !existing.dateOfBirth) {
      patch.dateOfBirth = characteristics.dateOfBirth
    }
    if (characteristics.biologicalSex && !existing.biologicalSex) {
      patch.biologicalSex = characteristics.biologicalSex
    }
    if (Object.keys(patch).length > 0) {
      await updateProfile(patch)
    }
  } catch (err) {
    console.warn("[healthkit] profile sync failed", err)
  }
}

const HAS_REQUESTED_PERMISSION_KEY = "noop.healthkit.hasRequestedPermission"

type Status = "unknown" | "unavailable" | "needsPermission" | "loading" | "ready" | "error"

type HealthKitContextValue = {
  status: Status
  todaySummary: DailySummary | null
  selectedDate: string | null
  selectedSummary: DailySummary | null
  errorMessage: string | null
  isReady: boolean
  hasRequestedPermission: boolean
  requestPermission: () => Promise<void>
  refresh: (date?: Date) => Promise<void>
  setActiveDate: (dateKey: string) => void
}

const HealthKitContext = createContext<HealthKitContextValue | null>(null)

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function HealthKitProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Status>("unknown")
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKey())
  const [selectedSummary, setSelectedSummary] = useState<DailySummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasRequestedPermission, setHasRequestedPermission] = useMMKVBoolean(
    HAS_REQUESTED_PERMISSION_KEY,
  )
  const inFlight = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async (date?: Date) => {
    if (inFlight.current) return inFlight.current
    const target = date ?? new Date()
    const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(target.getDate()).padStart(2, "0")}`

    const job = (async () => {
      try {
        setStatus((prev) => (prev === "ready" ? "ready" : "loading"))
        const today = await fetchDailySummary(new Date())
        setTodaySummary(today)
        let selected: DailySummary | null
        if (targetKey === todayKey()) {
          setSelectedSummary(today)
          selected = today
        } else {
          selected = await fetchDailySummary(target)
          setSelectedSummary(selected)
        }
        setStatus("ready")
        setErrorMessage(null)

        // Push to backend so the server-side activity pipeline can use it for
        // hiking / stair / Apple-workout cross-classification.
        await pushSummariesAndWorkoutsToBackend(today, selected, target)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus("error")
      } finally {
        inFlight.current = null
      }
    })()

    inFlight.current = job
    return job
  }, [])

  const requestPermission = useCallback(async () => {
    const available = await isAvailable()
    if (!available) {
      setStatus("unavailable")
      return
    }
    try {
      await requestPermissions()
      setHasRequestedPermission(true)
      // Kick off the iPhone barometer stream in the background — feeds the
      // backend's hill / mountain / stair detectors via /healthkit/barometer.
      void startAltimeter().catch((err) =>
        console.warn("[healthkit] altimeter start failed", err),
      )
      // Pull demographics from Health app and populate the noop profile
      // — saves the user from re-entering dateOfBirth in Settings.
      void syncDemographicsFromHealthKit().catch((err) =>
        console.warn("[healthkit] demographics sync failed", err),
      )
      await refresh()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setStatus("error")
    }
  }, [refresh, setHasRequestedPermission])

  // First boot: probe availability + auto-load if user has previously granted.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const available = await isAvailable()
      if (cancelled) return
      if (!available) {
        setStatus("unavailable")
        return
      }
      if (hasRequestedPermission) {
        void startAltimeter().catch((err) =>
          console.warn("[healthkit] altimeter start failed", err),
        )
        await refresh()
      } else {
        setStatus("needsPermission")
      }
    })()
    return () => {
      cancelled = true
      stopAltimeter()
    }
  }, [hasRequestedPermission, refresh])

  // Re-fetch when app returns to foreground (Apple Watch may have synced).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && hasRequestedPermission) {
        void refresh(selectedDate ? dateFromKey(selectedDate) : undefined)
      }
    })
    return () => sub.remove()
  }, [hasRequestedPermission, refresh, selectedDate])

  const setActiveDate = useCallback(
    (dateKey: string) => {
      setSelectedDate(dateKey)
      void refresh(dateFromKey(dateKey))
    },
    [refresh],
  )

  const value = useMemo<HealthKitContextValue>(
    () => ({
      status,
      todaySummary,
      selectedDate,
      selectedSummary,
      errorMessage,
      isReady: status === "ready",
      hasRequestedPermission: hasRequestedPermission ?? false,
      requestPermission,
      refresh,
      setActiveDate,
    }),
    [
      status,
      todaySummary,
      selectedDate,
      selectedSummary,
      errorMessage,
      hasRequestedPermission,
      requestPermission,
      refresh,
      setActiveDate,
    ],
  )

  return <HealthKitContext.Provider value={value}>{children}</HealthKitContext.Provider>
}

export function useHealthKit(): HealthKitContextValue {
  const ctx = useContext(HealthKitContext)
  if (!ctx) {
    throw new Error("useHealthKit must be used within a HealthKitProvider")
  }
  return ctx
}

async function pushSummariesAndWorkoutsToBackend(
  today: DailySummary | null,
  selected: DailySummary | null,
  selectedDate: Date,
) {
  const summaries: DailySummary[] = []
  if (today) summaries.push(today)
  if (selected && (!today || selected.date !== today.date)) summaries.push(selected)
  if (summaries.length === 0) return

  // Pull workouts for the active date window (00:00 – 24:00 local)
  const dayStart = new Date(selectedDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(selectedDate)
  dayEnd.setHours(23, 59, 59, 999)

  let workouts: HealthKitWorkout[] = []
  try {
    workouts = await fetchWorkoutsBetween(dayStart, dayEnd, 50)
  } catch (err) {
    console.warn("[healthkit] workouts fetch failed", err)
  }

  try {
    await pushHealthkitSync({
      summaries: summaries.map((s) => ({
        dayDate: s.date,
        steps: s.steps,
        activeEnergyKcal: s.activeEnergyKcal,
        exerciseMinutes: s.exerciseMinutes,
        standMinutes: s.standMinutes,
        walkingDistanceMeters: s.walkingDistanceMeters,
        flightsClimbed: s.flightsClimbed,
        restingHeartRate: s.restingHeartRate,
        hrvSdnnMs: s.hrvSdnnMs,
        oxygenSaturationAverage: s.oxygenSaturationAverage,
        respiratoryRateAverage: s.respiratoryRateAverage,
      })),
      workouts: workouts.map((w) => ({
        uuid: w.uuid,
        activityName: w.activityName,
        startDate: w.startDate,
        endDate: w.endDate,
        durationMinutes: w.durationMinutes,
        totalEnergyKcal: w.totalEnergyKcal,
        totalDistanceMeters: w.totalDistanceMeters,
        averageHeartRate: w.averageHeartRate,
        source: w.source,
      })),
    })
  } catch (err) {
    // Push failures are non-fatal — the backend will get the next day's data later.
    console.warn("[healthkit] backend push failed", err)
  }
}
