import { WorkoutTypeIdentifier } from "@kingstinct/react-native-healthkit"
import type {
  QuantityTypeIdentifier,
  CategoryTypeIdentifier,
  ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit"

export type HealthKitReadType = ObjectTypeIdentifier

// Bullet-proof essentials only. Adding niche identifiers (audio exposure events,
// LowCardioFitnessEvent, etc.) can hard-crash via NSException on iOS versions
// that don't expose the type — those have to be feature-detected before adding.
export const READ_QUANTITY_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierAppleStandTime",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierFlightsClimbed",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierOxygenSaturation",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierBodyMass",
] as const satisfies readonly QuantityTypeIdentifier[]

export const READ_CATEGORY_TYPES = [
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKCategoryTypeIdentifierMindfulSession",
  "HKCategoryTypeIdentifierAppleStandHour",
] as const satisfies readonly CategoryTypeIdentifier[]

export const READ_OTHER_TYPES = [WorkoutTypeIdentifier] as const

export const ALL_READ_TYPES: readonly HealthKitReadType[] = [
  ...READ_QUANTITY_TYPES,
  ...READ_CATEGORY_TYPES,
  ...READ_OTHER_TYPES,
]

export type DailySummary = {
  date: string
  steps: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  standMinutes: number | null
  walkingDistanceMeters: number | null
  flightsClimbed: number | null
  restingHeartRate: number | null
  hrvSdnnMs: number | null
  oxygenSaturationAverage: number | null
  respiratoryRateAverage: number | null
}

export type HealthKitWorkout = {
  uuid: string
  activityName: string
  startDate: string
  endDate: string
  durationMinutes: number
  totalEnergyKcal: number | null
  totalDistanceMeters: number | null
  averageHeartRate: number | null
  source: string | null
}

export type SleepSegment = {
  uuid: string
  startDate: string
  endDate: string
  durationMinutes: number
  value: "inBed" | "asleep" | "awake" | "core" | "deep" | "rem" | "unknown"
  source: string | null
}
