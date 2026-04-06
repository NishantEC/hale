export class PushSyncDto {
  nightFeatures?: {
    nightDate: string;
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
  }[];

  sleepDetections?: {
    nightDate: string;
    bedtime: string;
    wakeTime: string;
    durationHours: number;
    interruptionCount: number;
    continuity: number;
    regularity: number;
    validCoverage: number;
    confidence: number;
  }[];

  sleepStages?: {
    nightDate: string;
    remMinutes: number;
    coreMinutes: number;
    deepMinutes: number;
    awakeMinutes: number;
    unknownMinutes: number;
    confidence: number;
    source: string;
    epochTimeline?: any;
    epochMinutes?: number;
  }[];

  dailyScores?: {
    dayDate: string;
    dailyBalance: number;
    loadPressure: number;
    sleepReserveHours: number;
    confidence: string;
    recommendation: string;
    detail: string;
  }[];

  dailyMetrics?: {
    dayDate: string;
    stressAverage?: number;
    spo2Average?: number;
    skinTempAvgCelsius?: number;
    skinTempDeltaCelsius?: number;
    strainScore?: number;
    sleepConsistencyScore?: number;
    detectedSleepNights?: number;
  }[];

  journalEntries?: {
    timestamp: string;
    factorTag: string;
    intensity: number;
    note?: string;
  }[];

  sleepPlan?: {
    targetSleepMinutes: number;
    wakeMinutes: number;
    alarmEnabled: boolean;
    alarmMinutes: number;
    smartWakeEnabled: boolean;
  };

  baselineProfile?: {
    restingHeartRate: number;
    rmssd: number;
    sdnn: number;
    nightsUsed: number;
  };
}
