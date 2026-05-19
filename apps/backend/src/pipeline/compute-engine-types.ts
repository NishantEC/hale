import { z } from 'zod';

const Iso = z.string().datetime({ offset: true });

export const SignalSampleV1 = z.object({
  timestamp: Iso,
  source: z.string(),
  heartRate: z.number(),
  ibiMs: z.number().nullable(),
  motionScore: z.number().nullable(),
  qualityScore: z.number(),
});
export type SignalSampleV1 = z.infer<typeof SignalSampleV1>;

export const HistoricalSensorRecordV1 = z.object({
  timestamp: Iso,
  heartRate: z.number(),
  rrAverageMs: z.number().nullable(),
  spo2Red: z.number().nullable(),
  spo2IR: z.number().nullable(),
  skinTempRaw: z.number().nullable(),
  gravityMagnitude: z.number().nullable(),
  gravityX: z.number().nullable(),
  gravityY: z.number().nullable(),
  gravityZ: z.number().nullable(),
  respRateRaw: z.number().nullable(),
  skinContact: z.boolean().nullable(),
  ppgGreen: z.number().nullable(),
  ppgRedIr: z.number().nullable(),
  ambientLight: z.number().nullable(),
  ledDrive1: z.number().nullable(),
  ledDrive2: z.number().nullable(),
  signalQuality: z.number().nullable(),
});
export type HistoricalSensorRecordV1 = z.infer<typeof HistoricalSensorRecordV1>;

export const NightFeatureSetV1 = z.object({
  nightDate: Iso,
  restingHeartRate: z.number(),
  rmssd: z.number(),
  sdnn: z.number(),
  pnn50: z.number(),
  respiratoryRate: z.number(),
  continuity: z.number(),
  regularity: z.number(),
  validCoverage: z.number(),
  confidenceRaw: z.number(),
  sleepEstimateHours: z.number(),
  sourceBlend: z.string(),
});
export type NightFeatureSetV1 = z.infer<typeof NightFeatureSetV1>;

export const SleepDetectionSummaryV1 = z.object({
  nightDate: Iso,
  bedtime: Iso,
  wakeTime: Iso,
  durationHours: z.number(),
  interruptionCount: z.number(),
  continuity: z.number(),
  regularity: z.number(),
  validCoverage: z.number(),
  confidence: z.number(),
});
export type SleepDetectionSummaryV1 = z.infer<typeof SleepDetectionSummaryV1>;

export const BaselineProfileV1 = z.object({
  restingHeartRate: z.number(),
  rmssd: z.number(),
  sdnn: z.number(),
  nightsUsed: z.number(),
  isWarmedUp: z.boolean(),
  maxHeartRate: z.number().nullable(),
});
export type BaselineProfileV1 = z.infer<typeof BaselineProfileV1>;

export const ComputeDerivedMetricsDayRequestV1 = z.object({
  schemaVersion: z.literal(1),
  samples: z.array(SignalSampleV1),
  sensorRecords: z.array(HistoricalSensorRecordV1),
  nightFeatures: z.array(NightFeatureSetV1),
  sleepDetections: z.array(SleepDetectionSummaryV1),
  baseline: BaselineProfileV1,
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string(),
});
export type ComputeDerivedMetricsDayRequestV1 = z.infer<
  typeof ComputeDerivedMetricsDayRequestV1
>;

export const ActivityBoutV1 = z.object({
  startTime: Iso,
  endTime: Iso,
  durationMinutes: z.number(),
  activityType: z.string(),
  intensity: z.string(),
  confidence: z.number(),
  heartRateAvg: z.number(),
  heartRateMax: z.number(),
  strainScore: z.number(),
  source: z.string(),
  cadenceHz: z.number().nullable(),
  flightsCount: z.number().nullable(),
  elevationGainMeters: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  externalSource: z.string().nullable(),
});
export type ActivityBoutV1 = z.infer<typeof ActivityBoutV1>;

export const PersistedDailyMetricV1 = z.object({
  schemaVersion: z.literal(1),
  strainScore: z.number().nullable(),
  sleepConsistencyScore: z.number().nullable(),
  detectedSleepNights: z.number(),
  skinTempAvgCelsius: z.number().nullable(),
  skinTempDeltaCelsius: z.number().nullable(),
  stressAverage: z.number().nullable(),
  spo2Average: z.number().nullable(),
  lfHfRatioAverage: z.number().nullable(),
  recoveryIndex: z.number().nullable(),
  trainingLoadRatio: z.number().nullable(),
  trainingLoadRiskZone: z.string().nullable(),
  spo2DipCount: z.number().nullable(),
  odiPerHour: z.number().nullable(),
  lowestSpo2: z.number().nullable(),
  coreTemperatureEstimate: z.number().nullable(),
  circadianNadir: Iso.nullable(),
  sleepArchitectureScore: z.number().nullable(),
  activityBouts: z.array(ActivityBoutV1).default([]),
});
export type PersistedDailyMetricV1 = z.infer<typeof PersistedDailyMetricV1>;
