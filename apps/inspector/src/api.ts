// Centralized API client and response types. The inspector hits the
// noop backend's debug + views endpoints — all bearer-authenticated via
// a token obtained from /api/auth/sign-in/email.

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3009";

const TOKEN_KEY = "noop.inspector.token";
const EMAIL_KEY = "noop.inspector.email";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "ngrok-skip-browser-warning": "true",
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    // Try to lift a useful message out of the JSON envelope; fall back
    // to the raw text or HTTP status.
    try {
      const j = JSON.parse(text);
      throw new Error(j.message ?? j.error ?? `${res.status} ${res.statusText}`);
    } catch {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
  }
  return JSON.parse(text) as T;
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders(token) });
  return parseJson<T>(res);
}

export async function apiPost<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseJson<T>(res);
}

// ── Auth ────────────────────────────────────────────────────

export type AuthResult = { token: string; email: string };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson<{ token: string }>(res);
  return { token: data.token, email };
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ email, password, name: name ?? email }),
  });
  const data = await parseJson<{ token: string }>(res);
  return { token: data.token, email };
}

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY) ?? "",
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const emailStorage = {
  get: () => localStorage.getItem(EMAIL_KEY) ?? "",
  set: (email: string) => localStorage.setItem(EMAIL_KEY, email),
};

// ── Response types ──────────────────────────────────────────

export type Overview = {
  selectedDate: string;
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  selectedNightDate: string | null;
  selectionMode: string;
  selectionReason: string;
  counts: {
    rawRecordCount: number;
    sleepDetectionCount: number;
    sleepStageCount: number;
    dailyScoreCount: number;
    dailyMetricCount: number;
    selectedDayRawRecordCount: number;
  };
  earliestRawTimestamp: string | null;
  latestRawTimestamp: string | null;
  latestSyncMetadata: {
    lastRawRecordAt: string | null;
    lastSleepPlanUpdateAt: string | null;
    plannerConfigured: boolean;
  };
  selectedEntities: {
    detectionId: string | null;
    stageId: string | null;
    featureId: string | null;
    epochTimelineCount: number;
  };
  lastPipelineRunStatus: string;
  viewSummary: {
    home: { title: string; headline: string; recommendation: string };
    sleep: { title: string; isEmpty: boolean; bedtime: string; wakeTime: string };
  };
};

export type RawRecords = {
  selectedDate: string;
  count: number;
  rows: Array<{
    id: string;
    timestamp: string;
    heartRate: number;
    rrAverageMs: number | null;
    skinContact: boolean | null;
    gravityMagnitude: number | null;
    gravityX: number | null;
    gravityY: number | null;
    gravityZ: number | null;
    respRateRaw: number | null;
    spo2Red: number | null;
    spo2IR: number | null;
    skinTempRaw: number | null;
  }>;
};

export type SleepNight = {
  selectedDate: string;
  selectedNightDate: string | null;
  selectionMode: string;
  selectionReason: string;
  selectedDetection: {
    id: string;
    nightDate: string;
    bedtime: string | null;
    wakeTime: string | null;
    durationHours: number;
    interruptionCount: number;
    continuity: number;
    regularity: number;
    validCoverage: number;
    confidence: number;
  } | null;
  selectedStage: {
    id: string;
    nightDate: string;
    remMinutes: number;
    coreMinutes: number;
    deepMinutes: number;
    awakeMinutes: number;
    unknownMinutes: number;
    confidence: number;
    source: string;
    epochMinutes: number;
  } | null;
  selectedNightFeature: {
    id: string;
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
  } | null;
  stageTotals: {
    remMinutes: number;
    lightMinutes: number;
    deepMinutes: number;
    awakeMinutes: number;
    unknownMinutes: number;
  } | null;
  epochTimelineCount: number;
  epochTimeline: Array<{ timestamp: string; stage: string }>;
};

export type BaselineProfileRow = {
  restingHeartRate: number;
  rmssd: number;
  sdnn: number;
  nightsUsed: number;
  maxHeartRate: number | null;
};

export type JournalCorrelation = {
  factorTag: string;
  avgDeepDelta: number;
  avgRemDelta: number;
  avgDurationDelta: number;
  sampleCount: number;
};

export type PipelineResults = {
  rawRecordCount: number;
  earliestRawTimestamp: string | null;
  latestRawTimestamp: string | null;
  results: {
    nightFeatures: unknown[];
    sleepDetections: unknown[];
    sleepStages: unknown[];
    dailyScores: unknown[];
    dailyMetrics: unknown[];
    baselineProfile: BaselineProfileRow | null;
    sleepPlan: unknown | null;
    typicalRanges: unknown | null;
    journalCorrelations: JournalCorrelation[];
  };
};

export type PipelineState = {
  state: {
    lastRunAt: string | null;
    lastInputMaxUpdatedAt: string | null;
    lastRunDurationMs: number;
  } | null;
  inputs: {
    rawSensorRecords: {
      count: number;
      latestUpdatedAt: string | null;
      latestTimestamp: string | null;
    };
    signalSamples: {
      count: number;
      latestUpdatedAt: string | null;
      latestTimestamp: string | null;
    };
  };
  currentMaxUpdatedAt: string | null;
  isDirty: boolean;
  windowStart: string;
};

export type Telemetry = {
  events: {
    totalCount: number;
    summary: Record<string, number>;
    recent: Array<{
      eventName: string;
      eventNumber: number;
      deviceId: string;
      capturedAt: string;
      receivedAt: string;
    }>;
  };
  realtime: {
    totalCount: number;
    sessions: Record<
      string,
      { dataType: string; count: number; earliest: string; latest: string }
    >;
    recent: Array<{
      dataType: string;
      heartRate: number | null;
      sessionId: string;
      capturedAt: string;
    }>;
  };
  consoleLogs?: {
    totalCount: number;
    deviceInfo: Record<string, any> | null;
    recent: Array<{
      message: string;
      logLevel: string | null;
      deviceId: string;
      metadata: Record<string, any> | null;
      capturedAt: string;
      receivedAt: string;
    }>;
  };
};

export type BatteryHistory = {
  hours: number;
  count: number;
  latest: {
    socPct: number | null;
    voltageMv: number | null;
    temperatureC: number | null;
    iconLevel: number | null;
    capturedAt: string | null;
  };
  series: Array<{
    capturedAt: string;
    source: "evt3" | "evt63";
    socPct: number | null;
    voltageMv: number | null;
    temperatureC: number | null;
    iconLevel: number | null;
  }>;
};

export type PipelineRunRow = {
  id: string;
  startedAt: string;
  durationMs: number;
  skipped: boolean;
  stages: Record<string, number> | null;
  detections: number;
  sleepStages: number;
  features: number;
  windowFrom: string | null;
  windowTo: string | null;
  forced: boolean;
};

export type PipelineRunOptions = {
  // YYYY-MM-DD — single-day rerun (plus 1-day buffer on each side for
  // sleep-detection context). Mutually exclusive with from/to.
  day?: string;
  // ISO timestamps or YYYY-MM-DD for an arbitrary window.
  from?: string;
  to?: string;
  // Bypass the watermark short-circuit.
  force?: boolean;
};

export async function triggerPipelineRun(
  token: string,
  opts: PipelineRunOptions = {},
): Promise<unknown> {
  const params = new URLSearchParams();
  if (opts.day) params.set("day", opts.day);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.force) params.set("force", "true");
  const qs = params.toString();
  return apiPost(`/debug/pipeline/run${qs ? `?${qs}` : ""}`, token);
}

export type PipelineRunsHistory = {
  count: number;
  stageMedians: Record<string, number>;
  runs: PipelineRunRow[];
};

export type TrendPoint = { timestamp: string; value: number };

export type TrendsView = {
  days: number;
  dataPoints: number;
  hrvTrend: TrendPoint[];
  restingHrTrend: TrendPoint[];
  sleepDurationTrend: TrendPoint[];
  recoveryTrend: TrendPoint[];
  trainingLoadTrend: TrendPoint[];
  consistencyTrend: TrendPoint[];
  strainTrend: TrendPoint[];
  stressTrend: TrendPoint[];
  respiratoryRateTrend: TrendPoint[];
  spo2Trend: TrendPoint[];
  summaries: {
    hrv: { current: number | null; weekAgo: number | null; trend: "improving" | "declining" | "stable" | null };
    restingHr: { current: number | null; weekAgo: number | null; trend: "improving" | "declining" | "stable" | null };
    sleepDuration: { avgHours: number | null; nights: number };
  };
};

export type HomeView = {
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  todayOverview: { headline: string; detail: string };
  cards: { recommendation: { title: string; subtitle: string } };
};

export type SleepView = {
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  emptyState: { isEmpty: boolean; title: string; subtitle: string };
  header: { bedtime: string; wakeTime: string; duration: string };
  sleepInsight: string | null;
};
