// Centralized API client and response types. The inspector hits the
// noop backend's debug + views endpoints — all bearer-authenticated via
// a token obtained from /api/auth/sign-in/email.

import { AuthError, NetworkError, ParseError, ServerError } from "./utils/errors";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3009";

const TOKEN_KEY = "noop.inspector.token";
const EMAIL_KEY = "noop.inspector.email";

// Browser-resolved IANA time zone (e.g. "Asia/Kolkata"). Passed to every
// date-scoped backend request so "May 17" means "May 17 in the user's local
// calendar," not "May 17 UTC." Backend's resolveTimeZone falls back to UTC if
// this is missing — which is why an IST user looking at May 17 used to see
// no records: the UTC-day bounds excluded their actual May 17 IST window.
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Append `&timeZone=...` (or `?timeZone=...`) to a path so the backend
// computes day boundaries in the caller's time zone.
export function withTimeZone(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}timeZone=${encodeURIComponent(browserTimeZone())}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "ngrok-skip-browser-warning": "true",
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new AuthError("Session expired or invalid token");
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      msg = j.message ?? j.error ?? msg;
    } catch {
      if (text) msg = text;
    }
    throw new ServerError(msg, res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : "Could not parse JSON");
  }
}

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new NetworkError(e.message);
    }
    throw e;
  }
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await safeFetch(`${API_BASE_URL}${path}`, { headers: authHeaders(token) });
  return parseJson<T>(res);
}

export async function apiPost<T>(path: string, token: string): Promise<T> {
  const res = await safeFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseJson<T>(res);
}

// ── Auth ────────────────────────────────────────────────────

export type AuthResult = { token: string; email: string };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const res = await safeFetch(`${API_BASE_URL}/api/auth/sign-in/email`, {
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
  const res = await safeFetch(`${API_BASE_URL}/api/auth/sign-up/email`, {
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

// Revoke the session row server-side before clearing the local token,
// so a forgotten browser tab doesn't leave a usable session in the DB.
// Failures are swallowed: if the network's down or the token already
// expired the user still wants to sign out locally.
export async function signOut(token: string): Promise<void> {
  if (!token) return;
  try {
    await safeFetch(`${API_BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
    });
  } catch {
    // Best-effort. Local clear in tokenStorage.clear() runs regardless.
  }
}

// Token lives in sessionStorage so it dies with the tab. This avoids the
// "logged in forever after a backend rotation" footgun. Email persists in
// localStorage as a UX nicety for the sign-in form.
export const tokenStorage = {
  get: () => sessionStorage.getItem(TOKEN_KEY) ?? "",
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
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
  // When the newest raw_sensor_record row was upserted on the backend.
  // Distinct from latestRawTimestamp — fresh uploads with stale timestamps
  // indicate the drainer is filling earlier-strap-time gaps (catching up
  // backlog) rather than the strap being silent.
  latestRawUpdatedAt: string | null;
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
  params.set("timeZone", browserTimeZone());
  return apiPost(`/debug/pipeline/run?${params.toString()}`, token);
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
