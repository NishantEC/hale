import { Platform } from "react-native"
import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutTypeIdentifier,
} from "@kingstinct/react-native-healthkit"
import type { CategorySampleTyped, WorkoutProxyTyped } from "@kingstinct/react-native-healthkit"

import {
  ALL_READ_TYPES,
  type DailySummary,
  type HealthKitWorkout,
  type SleepSegment,
} from "./types"

const isIOS = Platform.OS === "ios"

export async function isAvailable(): Promise<boolean> {
  if (!isIOS) return false
  try {
    return await isHealthDataAvailable()
  } catch {
    return false
  }
}

export async function requestPermissions(): Promise<boolean> {
  if (!isIOS) return false
  try {
    return await requestAuthorization({ toRead: ALL_READ_TYPES })
  } catch (err) {
    // Common cause: the iOS app binary doesn't have HealthKit capability or
    // the native module wasn't compiled in (needs `expo prebuild` + rebuild).
    console.warn("[healthkit] requestAuthorization failed", err)
    return false
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

async function safeSum(
  identifier: Parameters<typeof queryStatisticsForQuantity>[0],
  unit: string,
  start: Date,
  end: Date,
): Promise<number | null> {
  try {
    const res = await queryStatisticsForQuantity(identifier, ["cumulativeSum"], {
      filter: { date: { startDate: start, endDate: end } },
      unit,
    })
    return res.sumQuantity?.quantity ?? null
  } catch {
    return null
  }
}

async function safeAverage(
  identifier: Parameters<typeof queryStatisticsForQuantity>[0],
  unit: string,
  start: Date,
  end: Date,
): Promise<number | null> {
  try {
    const res = await queryStatisticsForQuantity(identifier, ["discreteAverage"], {
      filter: { date: { startDate: start, endDate: end } },
      unit,
    })
    return res.averageQuantity?.quantity ?? null
  } catch {
    return null
  }
}

async function safeMostRecent(
  identifier: Parameters<typeof queryStatisticsForQuantity>[0],
  unit: string,
  start: Date,
  end: Date,
): Promise<number | null> {
  try {
    const res = await queryStatisticsForQuantity(identifier, ["mostRecent"], {
      filter: { date: { startDate: start, endDate: end } },
      unit,
    })
    return res.mostRecentQuantity?.quantity ?? null
  } catch {
    return null
  }
}

export async function fetchDailySummary(date: Date): Promise<DailySummary | null> {
  if (!isIOS) return null

  const start = startOfDay(date)
  const end = endOfDay(date)
  const dateKey = start.toISOString().slice(0, 10)

  // Run sequentially — Apple's HealthKit can deadlock or panic under heavy
  // parallel HKStatisticsQuery load right after first authorization.
  const steps = await safeSum("HKQuantityTypeIdentifierStepCount", "count", start, end)
  const activeEnergyKcal = await safeSum(
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "kcal",
    start,
    end,
  )
  const exerciseMinutes = await safeSum(
    "HKQuantityTypeIdentifierAppleExerciseTime",
    "min",
    start,
    end,
  )
  const standMinutes = await safeSum(
    "HKQuantityTypeIdentifierAppleStandTime",
    "min",
    start,
    end,
  )
  const walkingDistanceMeters = await safeSum(
    "HKQuantityTypeIdentifierDistanceWalkingRunning",
    "m",
    start,
    end,
  )
  const flightsClimbed = await safeSum(
    "HKQuantityTypeIdentifierFlightsClimbed",
    "count",
    start,
    end,
  )
  const restingHeartRate = await safeAverage(
    "HKQuantityTypeIdentifierRestingHeartRate",
    "count/min",
    start,
    end,
  )
  const hrvSdnnMs = await safeAverage(
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    "ms",
    start,
    end,
  )
  const oxygenSaturationAverage = await safeAverage(
    "HKQuantityTypeIdentifierOxygenSaturation",
    "%",
    start,
    end,
  )
  const respiratoryRateAverage = await safeAverage(
    "HKQuantityTypeIdentifierRespiratoryRate",
    "count/min",
    start,
    end,
  )

  return {
    date: dateKey,
    steps,
    activeEnergyKcal,
    exerciseMinutes,
    standMinutes,
    walkingDistanceMeters,
    flightsClimbed,
    restingHeartRate,
    hrvSdnnMs,
    oxygenSaturationAverage,
    respiratoryRateAverage,
  }
}

export async function fetchWorkoutsBetween(
  start: Date,
  end: Date,
  limit: number = 50,
): Promise<HealthKitWorkout[]> {
  if (!isIOS) return []
  try {
    const samples = await queryWorkoutSamples({
      filter: { date: { startDate: start, endDate: end } },
      limit,
      ascending: false,
    })
    return samples.map(toWorkout)
  } catch {
    return []
  }
}

function toWorkout(w: WorkoutProxyTyped): HealthKitWorkout {
  const startMs = w.startDate.getTime()
  const endMs = w.endDate.getTime()
  return {
    uuid: w.uuid,
    activityName: workoutActivityName(w.workoutActivityType),
    startDate: w.startDate.toISOString(),
    endDate: w.endDate.toISOString(),
    durationMinutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
    totalEnergyKcal: w.totalEnergyBurned?.quantity ?? null,
    totalDistanceMeters: w.totalDistance?.quantity ?? null,
    averageHeartRate: null,
    source: w.sourceRevision?.source?.name ?? null,
  }
}

export async function fetchSleepSegmentsBetween(
  start: Date,
  end: Date,
  limit: number = 500,
): Promise<SleepSegment[]> {
  if (!isIOS) return []
  try {
    const samples = await queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", {
      filter: { date: { startDate: start, endDate: end } },
      limit,
      ascending: true,
    })
    return samples.map(toSleepSegment)
  } catch {
    return []
  }
}

function toSleepSegment(
  sample: CategorySampleTyped<"HKCategoryTypeIdentifierSleepAnalysis">,
): SleepSegment {
  const startMs = sample.startDate.getTime()
  const endMs = sample.endDate.getTime()
  return {
    uuid: sample.uuid,
    startDate: sample.startDate.toISOString(),
    endDate: sample.endDate.toISOString(),
    durationMinutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
    value: sleepValueLabel(sample.value),
    source: sample.sourceRevision?.source?.name ?? null,
  }
}

function sleepValueLabel(value: CategoryValueSleepAnalysis): SleepSegment["value"] {
  switch (value) {
    case CategoryValueSleepAnalysis.inBed:
      return "inBed"
    case CategoryValueSleepAnalysis.awake:
      return "awake"
    case CategoryValueSleepAnalysis.asleepCore:
      return "core"
    case CategoryValueSleepAnalysis.asleepDeep:
      return "deep"
    case CategoryValueSleepAnalysis.asleepREM:
      return "rem"
    case CategoryValueSleepAnalysis.asleepUnspecified:
      return "asleep"
    default:
      return "unknown"
  }
}

// Map HKWorkoutActivityType numeric enum to a display name.
// We keep the most common subset here — anything else falls back to "Workout".
function workoutActivityName(type: number): string {
  const names: Record<number, string> = {
    1: "Archery",
    2: "Bowling",
    3: "Fencing",
    4: "Gymnastics",
    5: "Track & Field",
    6: "American Football",
    7: "Australian Football",
    8: "Baseball",
    9: "Basketball",
    10: "Cricket",
    11: "Disc Sports",
    12: "Handball",
    13: "Hockey",
    14: "Lacrosse",
    15: "Rugby",
    16: "Soccer",
    17: "Softball",
    18: "Volleyball",
    19: "Preparation & Recovery",
    20: "Flexibility",
    21: "Walking",
    22: "Running",
    23: "Wheelchair Walk",
    24: "Wheelchair Run",
    25: "Cross Training",
    26: "Mixed Cardio",
    27: "High Intensity Interval Training",
    28: "Jump Rope",
    29: "Stairs",
    30: "Step Training",
    31: "Functional Strength",
    32: "Traditional Strength",
    33: "Core Training",
    34: "Cycling",
    35: "Hand Cycling",
    36: "Swimming",
    37: "Open Water Swim",
    38: "Pool Swim",
    39: "Surfing",
    40: "Sailing",
    41: "Rowing",
    42: "Paddle Sports",
    43: "Skating Sports",
    44: "Hiking",
    45: "Yoga",
    46: "Pilates",
    47: "Boxing",
    48: "Kickboxing",
    49: "Martial Arts",
    50: "Tai Chi",
    51: "Climbing",
    52: "Equestrian Sports",
    53: "Fishing",
    54: "Hunting",
    55: "Play",
    56: "Snow Sports",
    57: "Water Sports",
    58: "Mind & Body",
    63: "Tennis",
    64: "Golf",
    65: "Badminton",
    66: "Squash",
    67: "Table Tennis",
    68: "Racquetball",
    69: "Pickleball",
    70: "Curling",
    71: "Snowboarding",
    72: "Skiing",
    73: "Ice Skating",
    74: "Snow Skating",
    75: "Stair Climbing",
    76: "Elliptical",
    77: "Rowing Machine",
    78: "Cool Down",
    79: "Mixed Metabolic Cardio",
    80: "Crossfit",
    81: "Indoor Walk",
    82: "Indoor Run",
    83: "Indoor Cycle",
    84: "Indoor Other",
    85: "Indoor Outdoor",
    3000: "Other",
  }
  return names[type] ?? "Workout"
}

export { WorkoutTypeIdentifier }
