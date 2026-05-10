import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';
import { HistoricalRecord } from '../ble/packet-types';

// Shared MMKV store used by AuthContext. Clearing these keys from
// here on a 401 signs the user out in-app, not just in our local
// HTTP layer.
const mmkv = new MMKV();

const DEFAULT_BASE_URL = 'https://api.noop.enform.co';
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  DEFAULT_BASE_URL;
const REQUEST_TIMEOUT_MS = 20000;
export const INSPECTOR_WEB_URL = process.env.EXPO_PUBLIC_INSPECTOR_URL || 'https://noop.enform.co';

let sessionToken: string | null = null;

function withBaseHeaders(headers: HeadersInit = {}): HeadersInit {
  return {
    'ngrok-skip-browser-warning': 'true',
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
    stress: string;
    spo2: string;
    skinTemp: string;
    strain: string;
    skinTempDelta: string;
    recoveryIndex: string;
    trainingLoad: string;
    trainingLoadRiskZone: string;
    spo2Dips: string;
    activityFeed: Array<{
      type: string;
      duration: string;
      strain: string;
      intensity: string;
      time: string;
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
  metrics: Array<{
    label: string;
    value: string;
    detail: string | null;
  }>;
  factorInsights: Array<{
    factorTag: string;
    deepDelta: string | null;
    remDelta: string | null;
    sampleCount: number;
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

async function clearSession() {
  sessionToken = null;
  await AsyncStorage.removeItem('sessionToken');
  // Also clear the MMKV keys AuthContext watches, so a 401 actually
  // signs the user out in the UI (not just in our local fetch layer).
  try {
    mmkv.delete('AuthProvider.authToken');
    mmkv.delete('AuthProvider.authEmail');
  } catch {
    // best effort
  }
}

// Called from the UI "Log Out" button to force a sign-out without
// needing to wait for a 401 response.
export async function forceLogout() {
  await clearSession();
}

export function setSessionToken(token?: string | null) {
  sessionToken = token ?? null;
}

async function requestJson(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: withBaseHeaders(init.headers),
    signal: controller.signal,
  });

    if (res.status === 401) {
      await clearSession();
    }

    const text = await res.text();
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
      throw new Error(message);
    }

    return data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function initAuth() {
  sessionToken = await AsyncStorage.getItem('sessionToken');
}

export function isAuthenticated() {
  return sessionToken !== null;
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

export async function register(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password, name: email }),
  });
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res);
    throw new AuthError(res.status, code, message);
  }
  const data = await res.json();
  sessionToken = data.token;
  await AsyncStorage.setItem('sessionToken', data.token);
  return true;
}

export async function login(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res);
    throw new AuthError(res.status, code, message);
  }
  const data = await res.json();
  if (!data?.token) {
    throw new AuthError(res.status, 'NO_TOKEN', 'Sign-in succeeded but the server returned no token.');
  }
  sessionToken = data.token;
  await AsyncStorage.setItem('sessionToken', data.token);
  return true;
}

export async function logout() {
  await clearSession();
}

export async function apiGet(path: string) {
  return requestJson(path, {
    headers: withBaseHeaders({ Authorization: `Bearer ${sessionToken}` }),
  });
}

export async function apiPost(path: string, body: any) {
  return requestJson(path, {
    method: 'POST',
    headers: withBaseHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }),
    body: JSON.stringify(body),
  });
}

export async function apiPut(path: string, body: any) {
  return requestJson(path, {
    method: 'PUT',
    headers: withBaseHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }),
    body: JSON.stringify(body),
  });
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
      historicalSensorRecords: batch.map(r => ({
        timestamp: r.timestamp.toISOString(),
        heartRate: r.heartRate,
        rrAverageMs: r.rrIntervals.length > 0
          ? r.rrIntervals.reduce((a, b) => a + b, 0) / r.rrIntervals.length
          : null,
        spo2Red: r.spo2Red ?? null,
        spo2IR: r.spo2IR ?? null,
        skinTempRaw: r.skinTempRaw ?? null,
        gravityMagnitude: Math.sqrt(r.gravityX ** 2 + r.gravityY ** 2 + r.gravityZ ** 2),
        gravityX: r.gravityX ?? null,
        gravityY: r.gravityY ?? null,
        gravityZ: r.gravityZ ?? null,
        respRateRaw: r.respRateRaw ?? null,
        skinContact: r.skinContact,
        ppgGreen: r.ppgGreen ?? null,
        ppgRedIr: r.ppgRedIr ?? null,
        ambientLight: r.ambientLight ?? null,
        ledDrive1: r.ledDrive1 ?? null,
        ledDrive2: r.ledDrive2 ?? null,
        signalQuality: r.signalQuality ?? null,
      })),
    };
    const result = await apiPost('/pipeline/ingest', payload);
    totalSignal += result?.signalSamples ?? 0;
    totalSensor += result?.sensorRecords ?? 0;
  }

  return { signalSamples: totalSignal, sensorRecords: totalSensor };
}

export async function runPipeline(): Promise<{ ok: boolean; computed: any }> {
  return apiPost('/pipeline/run', {});
}

export async function fetchResults(): Promise<PipelineResults> {
  return apiGet('/pipeline/results');
}

export async function fetchHomeView(date: string): Promise<HomeViewModel> {
  return apiGet(`/views/home?date=${encodeURIComponent(date)}`);
}

export async function fetchSleepView(date: string): Promise<SleepViewModel> {
  return apiGet(`/views/sleep?date=${encodeURIComponent(date)}`);
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
  return apiGet(`/views/trends?days=${days}`);
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
  return apiPost('/healthkit/sync', payload);
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
  return apiPost('/healthkit/barometer', payload);
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
  return apiPost('/healthkit/motion-activity', payload);
}

export async function fetchDebugOverview(date: string): Promise<DebugOverview> {
  return apiGet(`/debug/overview?date=${encodeURIComponent(date)}`);
}

export async function fetchDebugRawRecords(date: string, limit = 120): Promise<DebugRawRecords> {
  return apiGet(`/debug/raw-records?date=${encodeURIComponent(date)}&limit=${limit}`);
}

export async function fetchDebugSleepNight(date: string): Promise<DebugSleepNight> {
  return apiGet(`/debug/sleep-night?date=${encodeURIComponent(date)}`);
}

export async function fetchDebugPipelineResults(): Promise<DebugPipelineResults> {
  return apiGet('/debug/pipeline-results');
}

export async function runDebugPipeline(date: string): Promise<{ runResult: { ok: boolean; computed: Record<string, number> }; overview: DebugOverview }> {
  return apiPost(`/debug/pipeline/run?date=${encodeURIComponent(date)}`, {});
}

export async function recomputeDebugViews(date: string): Promise<DebugViewsRecompute> {
  return apiPost(`/debug/views/recompute?date=${encodeURIComponent(date)}`, {});
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
