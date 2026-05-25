import { HistoricalRecord } from '../ble/packet-types';
import { recordApiFailure, type ApiFailureKind } from '../sync/syncTelemetry';

const DEFAULT_BASE_URL = 'https://api.noop.enform.co';
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  DEFAULT_BASE_URL;
// 30 s default. Cloud Run can take 3-8 s to wake a cold instance even
// with min-instances=1 (e.g. after a deploy, or when scaling from 1→2
// under load); a 20 s default left no margin and surfaced as a spurious
// "Request timed out" on the first call after idle. Most well-behaved
// endpoints respond in <500 ms — this just widens the cold-start safety
// net. View and bulk-upload endpoints still use their own larger budgets.
const REQUEST_TIMEOUT_MS = 30000;

// Cap concurrent in-flight HTTP requests from the app. Without this, the
// daemon, sync, view, telemetry, and downlink modules can collectively
// fire 25+ requests in parallel during a single foreground/sync moment.
// That floods Cloud Run's concurrency * max-instances slot budget and
// returns immediate `429 Rate exceeded` for the overflow (verified via
// gcloud logs 2026-05-21). 6 in-flight keeps server-side queueing tight
// while still allowing UI views, telemetry, and ingest to make progress
// in parallel.
const MAX_IN_FLIGHT_REQUESTS = 6;
let activeRequestCount = 0;
const requestWaiters: Array<() => void> = [];

async function acquireRequestSlot(): Promise<void> {
  if (activeRequestCount < MAX_IN_FLIGHT_REQUESTS) {
    activeRequestCount += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    requestWaiters.push(() => {
      activeRequestCount += 1;
      resolve();
    });
  });
}

function releaseRequestSlot(): void {
  activeRequestCount -= 1;
  const next = requestWaiters.shift();
  if (next) next();
}
// Aggregate reads (home/sleep/trends/health views, debug overview) join across
// raw + derived tables; under cold-backend / mobile-network conditions a single
// request can easily push past 20s. Bumped per-endpoint so fast CRUD paths
// still surface stalls quickly.
const VIEW_TIMEOUT_MS = 45000;
// Bulk uploads (HealthKit batches, raw record ingest) ship up to a few MB of
// JSON and gate on a server-side insert. 60s leaves room for backpressure
// without hiding genuinely broken endpoints.
const BULK_UPLOAD_TIMEOUT_MS = 60000;
const PIPELINE_TIMEOUT_MS = 300000;
export const INSPECTOR_WEB_URL = process.env.EXPO_PUBLIC_INSPECTOR_URL || 'https://noop.enform.co';

let sessionToken: string | null = null;

let sessionClearedCallback: (() => void) | null = null

export function registerSessionClearedCallback(cb: () => void): void {
  sessionClearedCallback = cb
}

// React Native's fetch doesn't send Origin by default. better-auth's CSRF
// check rejects requests with a missing/null origin (403 "missing or null
// origin") AND rejects an Origin that isn't in trustedOrigins (403 "invalid
// origin"). Send a value that's already in the deployed server's
// trustedOrigins list so the request is accepted without a backend redeploy.
// Configurable via EXPO_PUBLIC_AUTH_ORIGIN if needed.
const AUTH_ORIGIN = process.env.EXPO_PUBLIC_AUTH_ORIGIN || 'http://localhost:3009';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function deviceDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function withDeviceTimeZone(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}timeZone=${encodeURIComponent(deviceTimeZone())}`;
}

function withBaseHeaders(headers: HeadersInit = {}): HeadersInit {
  return {
    Origin: AUTH_ORIGIN,
    ...headers,
  };
}

export type SeriesPoint = {
  timestamp: string;
  value: number;
};

export type HomeMetricRing = {
  value: string;
  progress: number;
};

export type MonitorState = "ok" | "warn" | "alert" | "stale"

export interface HealthMonitorSummary {
  state: MonitorState
  verdict: string
  inRangeCount: number
  totalMetrics: number
  staleSinceMs: number | null
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

export interface DebugOverview {
  selectedDate: string;
  selectedDateTitle: string;
  selectedDateSubtitle: string;
  selectedNightDate: string | null;
  selectionMode: 'exactMatch' | 'fallbackToLatestCompletedNight' | 'noNightAvailable';
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
  // When the newest raw_sensor_record row was upserted on the backend. This
  // can be fresh (~minutes ago) while latestRawTimestamp is stale (days ago)
  // when the drainer is filling earlier-strap-time gaps. LiveMonitor uses the
  // skew between the two to tell "actually silent" from "catching up backlog."
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
    home: {
      title: string;
      headline: string;
      recommendation: string;
    };
    sleep: {
      title: string;
      isEmpty: boolean;
      bedtime: string;
      wakeTime: string;
    };
  };
  latestSignalSampleAt: string | null;
  recentNights: Array<{
    nightDate: string;
    hasDetection: boolean;
    rawRecordCount: number;
  }>;
  todayCoverageMinutes: number;
}

export interface DebugSleepNight {
  selectedDate: string;
  selectedNightDate: string | null;
  selectionMode: 'exactMatch' | 'fallbackToLatestCompletedNight' | 'noNightAvailable';
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
  epochTimeline: Array<{
    timestamp: string;
    stage: string;
  }>;
}

export interface DebugRawRecords {
  selectedDate: string;
  startTimestamp: string;
  endTimestamp: string;
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
}

export interface DebugPipelineResults {
  rawRecordCount: number;
  earliestRawTimestamp: string | null;
  latestRawTimestamp: string | null;
  results: PipelineResults;
}

export interface DebugViewsRecompute {
  selectedDate: string;
  homeView: HomeViewModel;
  sleepView: SleepViewModel;
  overview: DebugOverview;
}

function clearSession() {
  sessionToken = null
  sessionClearedCallback?.()
}

export function forceLogout() {
  clearSession()
}

export function setSessionToken(token?: string | null) {
  sessionToken = token ?? null;
}

// Backoff schedule for retrying network-class failures. Two retries
// cover the common transient WiFi-handoff and cell-reauth windows
// without blowing past the per-call timeout budget (300+900=1.2 s on
// top of one normal attempt is below most upstream timeouts).
const NETWORK_RETRY_DELAYS_MS = [300, 900];

// Methods we'll retry on network blip at the HTTP layer.
// - GET/HEAD/OPTIONS: idempotent by HTTP spec; resending is always safe.
// - POST/PUT/DELETE: NOT retried here. If the request reached the server
//   and was processed before the response was lost, a retry duplicates
//   the side effect. Mutating callers either: (a) live behind the
//   outbound queue (uplinkDrainer + outboundQueue.ts), which has its
//   own claim/lease/backoff aware of partial success; or (b) are user-
//   initiated UI actions that should surface the error rather than
//   silently re-submit. To opt a POST back into HTTP-level retry once
//   server-side idempotency is verified, set `retryOnNetwork: true` in
//   the call's RequestInitExt (see apiPost). Don't enable this without
//   confirming the route is idempotent under repeat.
type RequestInitExt = RequestInit & { retryOnNetwork?: boolean };
function shouldRetryOnNetwork(init: RequestInitExt): boolean {
  if (init.retryOnNetwork === true) return true;
  if (init.retryOnNetwork === false) return false;
  const m = (init.method ?? 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

async function requestJson(path: string, init: RequestInitExt = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const canRetry = shouldRetryOnNetwork(init);
  const maxAttempts = canRetry ? NETWORK_RETRY_DELAYS_MS.length : 0;
  // Each ATTEMPT acquires/releases its own slot. Holding a slot during
  // the retry backoff was a real bug — with 3 retries × 60 s timeout
  // + 1.2 s backoff, one stuck request could pin a slot for ~3 min;
  // under sustained bad connectivity all 6 slots cascade into sleeping
  // retries and the whole app's API queue stalls. Better to release
  // during the sleep and re-queue for the next attempt; the server
  // never sees more than MAX_IN_FLIGHT_REQUESTS at once anyway.
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const isFinalAttempt = attempt === maxAttempts;
    await acquireRequestSlot();
    try {
      // Suppress network-failure telemetry on non-final attempts so a
      // recoverable blip doesn't litter the Inspector with N entries.
      return await requestJsonImpl(path, init, timeoutMs, isFinalAttempt);
    } catch (err) {
      // Only retry network failures that happened BEFORE fetch resolved.
      // requestJsonImpl tags the error with `__preFetch` when it knows
      // the request body never reached the server — that's the only
      // safe case to resend automatically. Post-fetch failures (body
      // reader threw, malformed JSON, HTTP non-2xx) all indicate the
      // request DID reach the server and may have side-effected.
      const isNetworkClass =
        err instanceof TypeError ||
        (err instanceof Error && /Network request failed/i.test(err.message));
      const wasPreFetch = isPreFetchError(err);
      const shouldRetry = canRetry && isNetworkClass && wasPreFetch;
      if (!shouldRetry || isFinalAttempt) {
        throw err;
      }
      lastNetworkError = err;
    } finally {
      releaseRequestSlot();
    }
    // Backoff happens AFTER releasing the slot so other requests can
    // make progress while we wait. The next iteration will re-acquire.
    await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAYS_MS[attempt]));
  }
  // Unreachable — the loop either returns or throws — but TS doesn't know.
  throw lastNetworkError;
}

function tagPreFetch(err: unknown): unknown {
  if (err && typeof err === 'object') {
    try {
      (err as any).__preFetch = true;
    } catch {
      // Some error objects are sealed (rare); fall through.
    }
  }
  return err;
}

function isPreFetchError(err: unknown): boolean {
  return !!(err && typeof err === 'object' && (err as any).__preFetch === true);
}

async function requestJsonImpl(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  recordNetworkFailure: boolean = true,
) {
  const controller = new AbortController();
  // Include path so the user (and we) know which endpoint stalled — the
  // CFNetwork `<private>` URL redaction in iOS logs makes this impossible to
  // recover after the fact otherwise.
  const timeoutMessage = `Request timed out after ${Math.round(timeoutMs / 1000)}s: ${init.method ?? 'GET'} ${path}`;
  // Race BOTH the headers phase (fetch) AND the body-read phase
  // (res.text()) against this promise. A slowloris server that
  // returns headers fast and then dribbles the body would otherwise
  // hang us past `timeoutMs` even though the timer aborts the
  // underlying fetch — and a fetch implementation that ignores the
  // AbortSignal (RN has shipped buggy ones) still gets cut off here.
  let didTimeout = false;
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  // If the request finishes before timeoutMs, this promise's rejection
  // would surface as an unhandledRejection. Pre-attach a no-op handler.
  timeoutPromise.catch(() => {});

  try {
    let res: Response;
    try {
      res = await Promise.race([
        fetch(`${BASE_URL}${path}`, {
          ...init,
          headers: withBaseHeaders(init.headers),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
    } catch (fetchErr) {
      // Failure here means fetch never produced a Response — safe to
      // retry. Tag the error so the retry layer can distinguish this
      // from a post-fetch failure (where the server may have side-
      // effected and we must not auto-retry mutating requests).
      throw tagPreFetch(fetchErr);
    }

    if (res.status === 401) {
      clearSession()
    }

    const text = await Promise.race([res.text(), timeoutPromise]);
    const contentType = res.headers.get('content-type') ?? '';
    const looksJson =
      contentType.includes('application/json') ||
      contentType.includes('+json') ||
      text.trim().startsWith('{') ||
      text.trim().startsWith('[');

    let data: any = null;
    if (text) {
      if (looksJson) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Server returned malformed JSON.');
        }
      } else if (!res.ok) {
        if (text.trim().startsWith('<')) {
          throw new Error(`Server returned HTML instead of JSON (${res.status} ${res.statusText}). Check the backend/ngrok endpoint.`);
        }
        throw new Error(text.slice(0, 180));
      } else {
        const prefix = text.slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(
          `Server returned a non-JSON response for ${path} (status ${res.status}, content-type "${contentType}"): ${prefix}`,
        );
      }
    }

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error ||
        `Request failed: ${res.status} ${res.statusText}`;
      // Only record 5xx; 4xx (auth, validation) is user-facing and not
      // the kind of stall we want filling the Inspector's failure list.
      if (res.status >= 500) {
        recordFailureSafe({
          method: init.method ?? 'GET',
          path,
          kind: 'server',
          message,
          status: res.status,
        });
      }
      throw new ApiError(res.status, message);
    }

    return data;
  } catch (error: any) {
    if (didTimeout || error?.name === 'AbortError') {
      recordFailureSafe({
        method: init.method ?? 'GET',
        path,
        kind: 'timeout',
        message: timeoutMessage,
      });
      throw new ApiError(0, timeoutMessage);
    }
    // Re-thrown ApiError from the !res.ok branch above — already recorded.
    if (error instanceof ApiError) throw error;
    // Network / DNS / TLS failure: TypeError from fetch in RN, or anything
    // else that didn't make it to a response. Skip telemetry on
    // intermediate retry attempts so a transient blip that recovers
    // doesn't litter the Inspector's API failure list.
    if (recordNetworkFailure) {
      recordFailureSafe({
        method: init.method ?? 'GET',
        path,
        kind: 'network',
        message: error?.message ?? String(error),
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout!);
  }
}

// Wraps recordApiFailure so an unexpected throw from telemetry can't
// mask the original API error. Belt-and-suspenders.
function recordFailureSafe(input: {
  method: string;
  path: string;
  kind: ApiFailureKind;
  message: string;
  status?: number;
}): void {
  try {
    recordApiFailure({
      at: Date.now(),
      method: input.method,
      path: input.path,
      kind: input.kind,
      message: input.message,
      status: input.status ?? null,
    });
  } catch (err) {
    console.warn('[noopClient] recordApiFailure threw', err);
  }
}

export function isAuthenticated() {
  return sessionToken !== null;
}

// Thrown for any non-2xx response or transport-level failure (network
// down, timeout). `status` is the HTTP status code; 0 indicates a
// timeout or local-side abort with no response. Callers (notably the
// outbound drainer) inspect `status` to decide whether a retry makes
// sense — see `isTransientApiError`.
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// 0 → network error / timeout (transient).
// 5xx → server error (transient).
// 408 Request Timeout, 429 Too Many Requests, 425 Too Early → transient even
// though they are 4xx by spec.
// 401 → transient. Treating "session token expired mid-drain" as permanent
// dead-lettered the entire in-flight batch the moment a token rotated — that
// silently lost user data. The right behavior is: clearSession() runs in
// requestJsonImpl, the user re-auths via AuthContext, and the next drain
// retries with the fresh token.
// All other 4xx → permanent: malformed request, schema rejection, forbidden.
// Retrying won't help.
export function isTransientApiError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true; // unknown shape — assume transient
  if (err.status === 0) return true;
  if (err.status >= 500) return true;
  if (err.status === 401 || err.status === 408 || err.status === 425 || err.status === 429) return true;
  return false;
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function readAuthErrorBody(res: Response): Promise<{ code: string | null; message: string }> {
  try {
    const data = (await res.json()) as { code?: string; message?: string };
    return {
      code: data.code ?? null,
      message: data.message ?? `HTTP ${res.status}`,
    };
  } catch {
    return { code: null, message: `HTTP ${res.status}` };
  }
}

export async function register(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password, name: email }),
  })
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res)
    throw new AuthError(res.status, code, message)
  }
  const data = await res.json()
  if (!data?.token) {
    throw new AuthError(res.status, 'NO_TOKEN', 'Sign-up succeeded but the server returned no token.')
  }
  sessionToken = data.token
  return data.token
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res)
    throw new AuthError(res.status, code, message)
  }
  const data = await res.json()
  if (!data?.token) {
    throw new AuthError(res.status, 'NO_TOKEN', 'Sign-in succeeded but the server returned no token.')
  }
  sessionToken = data.token
  return data.token
}

export async function apiGet(path: string, timeoutMs = REQUEST_TIMEOUT_MS) {
  return requestJson(path, {
    headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }),
  }, timeoutMs);
}

export async function apiPost(path: string, body: any, timeoutMs = REQUEST_TIMEOUT_MS) {
  return requestJson(path, {
    method: 'POST',
    headers: withBaseHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }),
    body: JSON.stringify(body),
  }, timeoutMs);
}

export async function apiPut(path: string, body: any, timeoutMs = REQUEST_TIMEOUT_MS) {
  return requestJson(path, {
    method: 'PUT',
    headers: withBaseHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }),
    body: JSON.stringify(body),
  }, timeoutMs);
}

// Pipeline interfaces and functions

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

export async function ingestHistoricalRecords(records: HistoricalRecord[]): Promise<{ signalSamples: number; sensorRecords: number }> {
  const BATCH_SIZE = 500;
  let totalSignal = 0;
  let totalSensor = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const payload = {
      signalSamples: batch.map(r => ({
        timestamp: r.timestamp.toISOString(),
        source: "strap-history",
        heartRate: r.heartRate,
        ibiMs: r.rrIntervals.length > 0
          ? r.rrIntervals.reduce((a, b) => a + b, 0) / r.rrIntervals.length
          : null,
        motionScore: null,
        qualityScore: r.skinContact ? 1 : 0,
      })),
      historicalSensorRecords: batch.map(r => {
        const hasGravity = r.gravityX != null && r.gravityY != null && r.gravityZ != null;
        return {
          timestamp: r.timestamp.toISOString(),
          heartRate: r.heartRate,
          rrAverageMs: r.rrIntervals.length > 0
            ? r.rrIntervals.reduce((a, b) => a + b, 0) / r.rrIntervals.length
            : null,
          spo2Red: r.spo2Red,
          spo2IR: r.spo2IR,
          skinTempRaw: r.skinTempRaw,
          gravityMagnitude: hasGravity
            ? Math.sqrt(r.gravityX! ** 2 + r.gravityY! ** 2 + r.gravityZ! ** 2)
            : null,
          gravityX: r.gravityX,
          gravityY: r.gravityY,
          gravityZ: r.gravityZ,
          respRateRaw: r.respRateRaw,
          skinContact: r.skinContact,
          ppgGreen: r.ppgGreen,
          ppgRedIr: r.ppgRedIr,
          ambientLight: r.ambientLight,
          ledDrive1: r.ledDrive1,
          ledDrive2: r.ledDrive2,
          signalQuality: r.signalQuality,
        };
      }),
    };
    const result = await apiPost('/pipeline/ingest', payload, BULK_UPLOAD_TIMEOUT_MS);
    totalSignal += result?.signalSamples ?? 0;
    totalSensor += result?.sensorRecords ?? 0;
  }

  return { signalSamples: totalSignal, sensorRecords: totalSensor };
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

// Kick off a pipeline run. Backend returns 202 + runId immediately and
// processes asynchronously (codex adversarial review 2026-05-21,
// finding #3). Old behavior — synchronous HTTP request holding for up
// to 25 min of compute — encouraged 503 storms and 300 s client
// timeouts; this is the replacement contract.
export async function enqueuePipelineRun(): Promise<{
  runId: string;
  status: PipelineRunStatus;
  startedAt: string;
  deduped: boolean;
}> {
  return apiPost(withDeviceTimeZone('/pipeline/run'), {}, REQUEST_TIMEOUT_MS);
}

export async function fetchPipelineRunStatus(
  runId: string,
): Promise<PipelineRunSnapshot> {
  return apiGet(`/pipeline/run/${encodeURIComponent(runId)}`, REQUEST_TIMEOUT_MS);
}

// Polls the runId until it reaches a terminal status or the overall
// deadline expires. PIPELINE_TIMEOUT_MS now bounds the whole poll
// loop instead of one HTTP request, so a slow compute can't hang a
// single Cloud Run request slot forever.
//
// Individual poll failures (network blip, single GET timeout) are
// swallowed — the loop continues against the overall deadline. Only
// the deadline itself produces a thrown error. Without this, the
// 30 s per-GET timeout would abort the whole 300 s budget after the
// very first transient poll failure.
export async function awaitPipelineRun(
  runId: string,
  opts: {
    deadlineMs?: number;
    intervalMs?: number;
    onUpdate?: (snap: PipelineRunSnapshot) => void;
  } = {},
): Promise<PipelineRunSnapshot> {
  const deadlineBudget = opts.deadlineMs ?? PIPELINE_TIMEOUT_MS;
  const deadline = Date.now() + deadlineBudget;
  const interval = opts.intervalMs ?? 5_000;
  let last: PipelineRunSnapshot | null = null;
  let lastErr: unknown = null;
  for (;;) {
    try {
      last = await fetchPipelineRunStatus(runId);
      lastErr = null;
      opts.onUpdate?.(last);
      if (last.status === 'succeeded' || last.status === 'failed') return last;
    } catch (err) {
      // Don't abort the budget for one bad poll. We'll either get a
      // good snapshot on the next iteration or hit the deadline.
      lastErr = err;
    }
    if (Date.now() >= deadline) {
      const lastDescription = last
        ? `last status ${last.status}`
        : `no successful poll yet (last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown")})`;
      throw new Error(
        `Pipeline run ${runId} did not finish within ${deadlineBudget / 1000}s (${lastDescription})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// Backwards-compat shim for callers that still use the old single-call
// shape. New callers should use enqueuePipelineRun + awaitPipelineRun
// directly so they can show progress while the run is in flight.
export async function runPipeline(): Promise<{ ok: boolean; computed: any }> {
  const { runId } = await enqueuePipelineRun();
  const snap = await awaitPipelineRun(runId);
  if (snap.status === 'failed') {
    throw new Error(snap.error ?? 'pipeline run failed');
  }
  return {
    ok: true,
    computed: {
      detections: snap.detections ?? 0,
      sleepStages: snap.sleepStages ?? 0,
      features: snap.features ?? 0,
      stages: snap.stages ?? null,
      skipped: snap.skipped ?? false,
    },
  };
}

export async function fetchResults(): Promise<PipelineResults> {
  return apiGet('/pipeline/results', VIEW_TIMEOUT_MS);
}

export async function fetchHomeView(date: string): Promise<HomeViewModel> {
  return apiGet(
    withDeviceTimeZone(`/views/home?date=${encodeURIComponent(date)}`),
    VIEW_TIMEOUT_MS,
  );
}

export async function confirmActivity(
  id: string,
  confirmedType?: string,
): Promise<{ ok: boolean }> {
  return apiPost(`/activities/${encodeURIComponent(id)}/confirm`, {
    confirmedType,
  });
}

export async function dismissActivity(id: string): Promise<{ ok: boolean }> {
  return apiPost(`/activities/${encodeURIComponent(id)}/dismiss`, {});
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

export async function fetchActivityBout(id: string): Promise<ActivityBoutDetail> {
  return apiGet(`/activities/${encodeURIComponent(id)}`);
}

export async function deleteActivity(id: string): Promise<{ ok: boolean }> {
  return requestJson(
    `/activities/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }),
    },
    REQUEST_TIMEOUT_MS,
  );
}

export async function fetchSleepView(date: string): Promise<SleepViewModel> {
  return apiGet(
    withDeviceTimeZone(`/views/sleep?date=${encodeURIComponent(date)}`),
    VIEW_TIMEOUT_MS,
  );
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

export async function fetchTrendsView(days: number = 30): Promise<TrendsViewModel> {
  return apiGet(`/views/trends?days=${days}`, VIEW_TIMEOUT_MS);
}

export type CoverageKind = 'full' | 'partial' | 'none';

export interface CoverageResponse {
  days: Array<{ date: string; coverage: CoverageKind }>;
}

export async function fetchCoverage(
  fromMonth: string,
  toMonth: string,
): Promise<CoverageResponse> {
  return apiGet(
    withDeviceTimeZone(
      `/views/coverage?from=${encodeURIComponent(fromMonth)}&to=${encodeURIComponent(toMonth)}`,
    ),
    VIEW_TIMEOUT_MS,
  );
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

export async function fetchHealthView(week?: string): Promise<HealthViewModel> {
  const qs = week ? `?week=${encodeURIComponent(week)}` : '';
  return apiGet(`/views/health${qs}`, VIEW_TIMEOUT_MS);
}

export async function fetchProfile(): Promise<UserProfileData> {
  return apiGet('/profile');
}

export async function updateProfile(patch: Partial<UserProfileData>): Promise<UserProfileData> {
  return apiPut('/profile', patch);
}

export async function updateSleepPlan(input: SleepPlanInput): Promise<{ ok: boolean; sleepView: SleepViewModel }> {
  return apiPut('/views/sleep-plan', input);
}

export interface HealthkitSyncPayload {
  summaries?: Array<{
    dayDate: string;
    steps?: number | null;
    activeEnergyKcal?: number | null;
    exerciseMinutes?: number | null;
    standMinutes?: number | null;
    walkingDistanceMeters?: number | null;
    flightsClimbed?: number | null;
    restingHeartRate?: number | null;
    hrvSdnnMs?: number | null;
    oxygenSaturationAverage?: number | null;
    respiratoryRateAverage?: number | null;
  }>;
  workouts?: Array<{
    uuid: string;
    activityName: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    totalEnergyKcal?: number | null;
    totalDistanceMeters?: number | null;
    averageHeartRate?: number | null;
    source?: string | null;
  }>;
}

export async function pushHealthkitSync(
  payload: HealthkitSyncPayload,
): Promise<{ ok: boolean; summariesUpserted: number; workoutsUpserted: number }> {
  return apiPost('/healthkit/sync', payload, BULK_UPLOAD_TIMEOUT_MS);
}

export interface BarometerSamplePayload {
  samples: Array<{
    timestamp: string;
    pressureHpa: number;
    relativeAltitudeMeters: number | null;
  }>;
}

export async function pushBarometerSamples(
  payload: BarometerSamplePayload,
): Promise<{ ok: boolean; inserted: number }> {
  return apiPost('/healthkit/barometer', payload, BULK_UPLOAD_TIMEOUT_MS);
}

export interface MotionActivityPayload {
  samples: Array<{
    timestamp: string;
    activity: 'stationary' | 'walking' | 'running' | 'automotive' | 'cycling' | 'unknown';
    confidence: 'low' | 'medium' | 'high';
  }>;
}

export async function pushMotionActivity(
  payload: MotionActivityPayload,
): Promise<{ ok: boolean; inserted: number }> {
  return apiPost('/healthkit/motion-activity', payload, BULK_UPLOAD_TIMEOUT_MS);
}

export async function fetchDebugOverview(date: string): Promise<DebugOverview> {
  return apiGet(
    withDeviceTimeZone(`/debug/overview?date=${encodeURIComponent(date)}`),
    VIEW_TIMEOUT_MS,
  );
}

export async function fetchDebugRawRecords(date: string, limit = 120): Promise<DebugRawRecords> {
  return apiGet(
    withDeviceTimeZone(`/debug/raw-records?date=${encodeURIComponent(date)}&limit=${limit}`),
    VIEW_TIMEOUT_MS,
  );
}

export async function fetchDebugSleepNight(date: string): Promise<DebugSleepNight> {
  return apiGet(
    withDeviceTimeZone(`/debug/sleep-night?date=${encodeURIComponent(date)}`),
    VIEW_TIMEOUT_MS,
  );
}

export async function fetchDebugPipelineResults(): Promise<DebugPipelineResults> {
  return apiGet('/debug/pipeline-results', VIEW_TIMEOUT_MS);
}

export async function runDebugPipeline(date: string): Promise<{
  runResult:
    | { ok: boolean; computed: Record<string, number>; skipped?: undefined }
    | { ok: boolean; skipped: 'no-new-input'; computed?: undefined };
  overview: DebugOverview;
}> {
  return apiPost(
    withDeviceTimeZone(`/debug/pipeline/run?date=${encodeURIComponent(date)}`),
    {},
    PIPELINE_TIMEOUT_MS,
  );
}

export type DebugHourlyCoverage = {
  hours: number
  generatedAt: string
  series: Array<{ hourStartUtc: string; rows: number }>
}

export async function fetchDebugHourlyCoverage(hours = 12): Promise<DebugHourlyCoverage> {
  return apiGet(`/debug/hourly-coverage?hours=${hours}`, VIEW_TIMEOUT_MS)
}

export async function fetchDebugPipelineRuns(limit = 30): Promise<{
  count: number;
  stageMedians: Record<string, number>;
  runs: Array<{
    id: string;
    startedAt: string;
    durationMs: number;
    skipped: boolean;
    stages: Record<string, number> | null;
    detections: number;
    sleepStages: number;
    features: number;
  }>;
}> {
  return apiGet(`/debug/pipeline-runs?limit=${limit}`, VIEW_TIMEOUT_MS);
}

export async function recomputeDebugViews(date: string): Promise<DebugViewsRecompute> {
  return apiPost(
    withDeviceTimeZone(`/debug/views/recompute?date=${encodeURIComponent(date)}`),
    {},
    VIEW_TIMEOUT_MS,
  );
}

// Journal CRUD

export interface JournalEntryResponse {
  id: string;
  factorTag: string;
  intensity: number;
  note: string;
  timestamp: string;
  createdAt: string;
}

export async function createJournalEntry(entry: {
  factorTag: string;
  intensity: number;
  note?: string;
  timestamp?: string;
}): Promise<JournalEntryResponse> {
  return apiPost('/journal', {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });
}

export async function fetchJournalEntries(date: string): Promise<{ entries: JournalEntryResponse[] }> {
  return apiGet(`/journal?date=${encodeURIComponent(date)}`);
}

// Telemetry ingestion

export async function ingestDeviceEvents(events: any[]): Promise<{ count: number }> {
  return apiPost('/telemetry/events', { events });
}

export async function ingestRealtimeSamples(samples: any[]): Promise<{ count: number }> {
  return apiPost('/telemetry/realtime', { samples });
}

export async function deleteJournalEntry(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/journal/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }),
  });
}
