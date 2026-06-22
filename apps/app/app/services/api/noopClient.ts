export function forceLogout() {}

export type SeriesPoint = {
  timestamp: string;
  value: number;
};

export type HomeMetricRing = {
  value: string;
  progress: number;
  // Numeric value (sleep score 0-100, recovery 0-100, strain 0-21) used by
  // the ring delta caption to compute ▲/▼ against `sevenDayAverage`. Null
  // when the user is brand-new and has no recent history.
  numericValue: number | null;
  sevenDayAverage: number | null;
};

export type MonitorState = "ok" | "warn" | "alert" | "stale"

export interface HealthVital {
  key: string
  label: string
  unit: string
  today: number | null
  avg7d: number | null
  avg30d: number | null
}

export interface HealthMonitorSummary {
  state: MonitorState
  verdict: string
  inRangeCount: number
  totalMetrics: number
  staleSinceMs: number | null
  lastReadingAt: string | null
  baselineReady?: boolean
  vitals?: HealthVital[]
}

export interface StressMonitorSummary {
  state: MonitorState
  score: number | null
  zone: "Calm" | "Moderate" | "High" | null
  lastReadingAt: string | null
  todayStrip: Array<number | null>
  timeInZone: { calm: number; moderate: number; high: number }
}

export interface HomeViewModel {
  selectedDate: string;
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  topStrip: {
    title: string;
    subtitle: string;
  };
  rings: {
    sleep: HomeMetricRing;
    recovery: HomeMetricRing;
    strain: HomeMetricRing;
  };
  cards: {
    recommendation: {
      title: string;
      subtitle: string;
      footer: string;
    };
    stress: {
      title: string;
      subtitle: string;
      footer: string;
    };
    loadPressure: {
      title: string;
      subtitle: string;
      footer: string;
    };
    liveHeartRate: {
      title: string;
      subtitle: string;
      footer: string;
    };
  };
  todayOverview: {
    headline: string;
    detail: string;
    dailyBalance: string;
    loadPressure: string;
    sleepReserve: string;
    confidence: string;
    dateLabel: string;
  };
  activities: {
    hrv: string;
    hrvMs: number | null;
    restingHr: string;
    baselineRhr: number | null;
    respiratoryRate: number | null;
    odiPerHour: number | null;
    stress: string;
    spo2: string;
    skinTemp: string;
    strain: string;
    skinTempDelta: string;
    trainingLoad: string;
    trainingLoadRiskZone: string;
    spo2Dips: string;
    activityFeed: Array<{
      type: string;
      duration: string;
      strain: string;
      intensity: string;
      time: string;
      // New fields propagated from the compute-engine ActivityBoutV1. Optional
      // on the wire so older API responses still parse; the new UI guards
      // each usage with a fallback.
      id?: string;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      heartRateAvg?: number;
      source?: "detected" | "candidate" | "healthkit" | "manual";
    }>;
    totalActiveMinutes: string;
    activityCount: number;
  };
  confidence: {
    confidence: string;
    pipelineStatus: string;
    sourceBlend: string;
    storageMode: string;
    persistenceHealth: string;
    disclaimer: string;
  };
  trendSummary: {
    summary: string;
    samples: SeriesPoint[];
  };
  stressTrend: SeriesPoint[];
  strainTrend: SeriesPoint[];
  noDataReasons: Record<string, string>;
  dayRibbon?: DayRibbon;
  pendingActivityCards: PendingActivityCard[];
  monitors?: {
    health: HealthMonitorSummary
    stress: StressMonitorSummary
  }
}

export interface DayRibbon {
  sleepWindow: { bedtime: string; wakeTime: string } | null;
  activities: Array<{
    startTime: string;
    endTime: string;
    type: string;
  }>;
  hrSeries: SeriesPoint[];
}

export interface PendingActivityCard {
  id: string;
  activityType: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  intensity: string;
  heartRateAvg: number;
  strainScore: number;
  confidence: number;
  // New: max HR observed during the candidate window. Optional on the wire
  // so older API responses still parse. Falls back to heartRateAvg in UI.
  heartRateMax?: number;
  // New: normalised HR sparkline samples (0..1) for the candidate card.
  hrSparkline?: number[];
}

export interface SleepViewModel {
  selectedDate: string;
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  emptyState: {
    isEmpty: boolean;
    title: string;
    subtitle: string;
    support?: string | null;
  };
  header: {
    bedtime: string;
    wakeTime: string;
    duration: string;
    restorative: string;
    timeInBed: string;
    durationVsTypical: string;
    restorativeVsTypical: string;
  };
  sleepInsight: string | null;
  hrChart: {
    samples: SeriesPoint[];
  };
  stageRows: Array<{
    id: string;
    label: string;
    percent: number;
    durationFormatted: string;
    color: string;
    barFraction: number;
    typicalRange: { lower: number; upper: number } | null;
  }>;
  epochTimeline: Array<{
    timestamp: string;
    stage: string;
  }>;
  durationTrend: {
    targetHours: number;
    samples: SeriesPoint[];
  };
  sleepScoreTrend: SeriesPoint[];
  hrvTrend: SeriesPoint[];
  score: {
    value: number | null;
    label: string;
    confidence: string;
    detail: string;
    deltaVsWeek: number | null;
  };
  vitalsDelta: {
    efficiency: number | null;
    rhr: number | null;
    hrv: number | null;
    skinTempDelta: number | null;
  };
  metrics: Array<{
    label: string;
    value: string;
    detail: string | null;
  }>;
  factorInsights: Array<{
    factorTag: string;
    occurrences: number;
    deepMin: number;
    remMin: number;
    awakeMin: number;
    effectSize: number;
  }>;
  planner: {
    targetSleepMinutes: number;
    wakeMinutes: number;
    alarmEnabled: boolean;
    alarmMinutes: number;
    smartWakeEnabled: boolean;
    alarmStatusText: string;
    sleepReserveText: string;
    estimatedSleepHours: string;
    smartWakeStatusText: string;
  };
  confidence: {
    confidence: string;
    pipelineStatus: string;
    sourceBlend: string;
    storageMode: string;
    persistenceHealth: string;
    disclaimer: string;
  };
}

export interface SleepPlanInput {
  targetSleepMinutes: number;
  wakeMinutes: number;
  alarmEnabled: boolean;
  alarmMinutes: number;
  smartWakeEnabled: boolean;
}

export interface PipelineResults {
  nightFeatures: any[];
  sleepDetections: any[];
  sleepStages: any[];
  dailyScores: any[];
  dailyMetrics: any[];
  baselineProfile: any | null;
  sleepPlan: any | null;
  typicalRanges: any | null;
  journalCorrelations: any[];
}

export type PipelineRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface PipelineRunSnapshot {
  runId: string;
  status: PipelineRunStatus;
  skipped?: boolean;
  startedAt: string;
  completedAt: string | null;
  durationMs?: number;
  detections?: number;
  sleepStages?: number;
  features?: number;
  stages?: Record<string, number> | null;
  error: string | null;
}

export interface ActivityBoutDetail {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  activityType: string;
  intensity: "light" | "moderate" | "hard";
  source: "detected" | "candidate" | "healthkit" | "manual";
  confidence: number;
  heartRateAvg: number;
  heartRateMax: number;
  strainScore: number;
  hrCurve: { t: number; hr: number }[];
  zonePercents: number[];
  zoneMinutes: number[];
  motionIntensity?: number[];
}

export interface TrendsViewModel {
  days: number;
  dataPoints: number;
  hrvTrend: SeriesPoint[];
  restingHrTrend: SeriesPoint[];
  sleepDurationTrend: SeriesPoint[];
  recoveryTrend: SeriesPoint[];
  trainingLoadTrend: SeriesPoint[];
  consistencyTrend: SeriesPoint[];
  strainTrend: SeriesPoint[];
  stressTrend: SeriesPoint[];
  respiratoryRateTrend: SeriesPoint[];
  spo2Trend: SeriesPoint[];
  summaries: {
    hrv: { current: number | null; weekAgo: number | null; trend: string | null };
    restingHr: { current: number | null; weekAgo: number | null; trend: string | null };
    sleepDuration: { avgHours: number | null; nights: number };
  };
}

export type CoverageKind = 'full' | 'partial' | 'none';

export interface CoverageResponse {
  days: Array<{ date: string; coverage: CoverageKind }>;
}

export interface HealthContributor {
  key: string;
  label: string;
  section: 'Sleep' | 'Strain' | 'Fitness';
  thirtyDayValue: number | null;
  sixMonthValue: number | null;
  unitsLabel: string;
  axisLo: number;
  axisHi: number;
  direction: 'higher' | 'lower';
  impactYears: number;
}

export interface HealthAssessment {
  id: string;
  weekStart: string;
  chronologicalAge: number;
  noopAge: number;
  paceOfAging: number | null;
  contributors: HealthContributor[];
  coachingTitle: string | null;
  coachingBody: string | null;
  generatedAt: string;
}

export interface UserProfileData {
  dateOfBirth: string | null;
  biologicalSex: 'male' | 'female' | 'other' | null;
  heightCm: number | null;
  weightKg: number | null;
}

export interface HealthViewModel {
  current: HealthAssessment | null;
  history: HealthAssessment[];
  profile: UserProfileData | null;
  needsDateOfBirth: boolean;
}

export interface JournalEntryResponse {
  id: string;
  factorTag: string;
  intensity: number;
  note: string;
  timestamp: string;
  createdAt: string;
}

export type InsightMetric = 'sleep' | 'recovery' | 'hrv' | 'strain';

export type ImpactConfidence = 'low' | 'medium' | 'high';

export interface FactorImpact {
  factorTag: string;
  daysWith: number;
  daysWithout: number;
  meanWith: number;
  meanWithout: number;
  delta: number;
  helps: boolean;
  confidence: ImpactConfidence;
}

export interface MetricInsights {
  metric: InsightMetric;
  metricLabel: string;
  sampleDays: number;
  factors: FactorImpact[];
}

export interface InsightsViewModel {
  windowDays: number;
  totalDays: number;
  hasEnoughData: boolean;
  daysUntilReady: number;
  insights: MetricInsights[];
}
