export interface SignalSample {
  timestamp: Date;
  source: string;
  heartRate: number;
  ibiMs: number | null;
  motionScore: number | null;
  qualityScore: number;
}

export interface HistoricalSensorRecord {
  timestamp: Date;
  heartRate: number;
  rrAverageMs: number | null;
  spo2Red: number | null;
  spo2IR: number | null;
  skinTempRaw: number | null;
  gravityMagnitude: number | null;
  gravityX: number | null;
  gravityY: number | null;
  gravityZ: number | null;
  respRateRaw: number | null;
  skinContact: boolean | null;
}

export interface NightFeatureSet {
  nightDate: Date;
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  respiratoryRate: number;
  continuity: number;
  regularity: number;
  validCoverage: number;
  confidenceRaw: number;
  sleepEstimateHours: number;
  sourceBlend: string;
}

export interface BaselineProfile {
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  nightsUsed: number;
  isWarmedUp: boolean;
}

export interface SleepDetectionSummary {
  nightDate: Date;
  bedtime: Date;
  wakeTime: Date;
  durationHours: number;
  interruptionCount: number;
  continuity: number;
  regularity: number;
  validCoverage: number;
  confidence: number;
}

export interface SleepStageSummary {
  nightDate: Date;
  remMinutes: number;
  coreMinutes: number;
  deepMinutes: number;
  awakeMinutes: number;
  unknownMinutes: number;
  confidence: number;
  source: string;
  epochTimeline: SleepStageEpoch[];
  epochMinutes: number;
}

export interface SleepStageEpoch {
  timestamp: Date;
  stage: 'rem' | 'core' | 'deep' | 'awake' | 'unknown';
}

export interface JournalFactorEntry {
  timestamp: Date;
  factorTag: string;
  intensity: number;
  note: string;
}

export interface JournalSleepCorrelation {
  factorTag: string;
  avgDeepDelta: number;
  avgRemDelta: number;
  avgDurationDelta: number;
  sampleCount: number;
}

export interface SleepTypicalRanges {
  typicalDurationMinutes: number;
  typicalRestorativeMinutes: number;
  typicalAwakePercent: { lower: number; upper: number };
  typicalLightPercent: { lower: number; upper: number };
  typicalDeepPercent: { lower: number; upper: number };
  typicalRemPercent: { lower: number; upper: number };
}

export interface DerivedMetricsBundle {
  stressScores: { timestamp: Date; value: number }[];
  spo2Scores: { timestamp: Date; value: number }[];
  skinTempScores: { timestamp: Date; value: number }[];
  strainScore: number | null;
  sleepConsistencyScore: number | null;
  detectedSleepNights: number;
  skinTempAvgCelsius: number | null;
  skinTempDeltaCelsius: number | null;
  stressAverage: number | null;
  spo2Average: number | null;
}

export type WellnessConfidence = 'High' | 'Medium' | 'Low';
export type DailyRecommendation = 'Restore' | 'Steady' | 'Build';

export interface DailyWellnessScore {
  dayDate: Date;
  dailyBalance: number;
  loadPressure: number;
  sleepReserveHours: number;
  confidence: WellnessConfidence;
  recommendation: DailyRecommendation;
  detail: string;
}

export interface EpochFeature {
  timestamp: Date;
  hrMean: number;
  hrStd: number;
  hrMin: number;
  hrMax: number;
  hrDeltaFromBaseline: number;
  motionMagnitude: number;
  motionStd: number;
  motionCount: number;
  stillFraction: number;
  rmssd: number;
  sdnn: number;
  rrMean: number;
  respiratoryRate: number;
  respiratoryStd: number;
  spo2: number;
  skinTemp: number;
  skinTempDelta: number;
  clockSin: number;
  clockCos: number;
  skinContact: number;
  signalCompleteness: number;
}

export interface EpochClassification {
  timestamp: Date;
  stage: 'Wake' | 'Light' | 'Deep' | 'REM';
  confidence: number;
  probabilities: [number, number, number, number]; // [wake, light, deep, rem]
}
