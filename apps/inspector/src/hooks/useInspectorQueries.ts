import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  apiGet,
  apiPost,
  triggerPipelineRun,
  withTimeZone,
  type BatteryHistory,
  type HomeView,
  type Overview,
  type PipelineResults,
  type PipelineRunOptions,
  type PipelineRunsHistory,
  type PipelineState,
  type RawRecords,
  type SleepNight,
  type SleepView,
  type Telemetry,
  type TrendsView,
} from "../api"

// Centralised query keys so invalidation stays consistent.
export const queryKeys = {
  overview: (date: string) => ["overview", date] as const,
  raw: (date: string) => ["raw", date] as const,
  sleep: (date: string) => ["sleep", date] as const,
  results: () => ["results"] as const,
  state: () => ["pipeline-state"] as const,
  runs: () => ["pipeline-runs"] as const,
  homeView: (date: string) => ["home-view", date] as const,
  sleepView: (date: string) => ["sleep-view", date] as const,
  telemetry: () => ["telemetry"] as const,
  batteryHistory: () => ["battery-history"] as const,
  trends: (days: number) => ["trends", days] as const,
}

const enc = encodeURIComponent

export function useOverview(token: string, date: string) {
  return useQuery({
    queryKey: queryKeys.overview(date),
    queryFn: () =>
      apiGet<Overview>(withTimeZone(`/debug/overview?date=${enc(date)}`), token),
    enabled: !!token,
  })
}

export function useRaw(token: string, date: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.raw(date),
    queryFn: () =>
      apiGet<RawRecords>(
        withTimeZone(`/debug/raw-records?date=${enc(date)}&limit=5000`),
        token,
      ),
    enabled: !!token && (opts?.enabled ?? true),
  })
}

export function useSleep(token: string, date: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.sleep(date),
    queryFn: () =>
      apiGet<SleepNight>(withTimeZone(`/debug/sleep-night?date=${enc(date)}`), token),
    enabled: !!token && (opts?.enabled ?? true),
  })
}

export function usePipelineResults(token: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.results(),
    queryFn: () => apiGet<PipelineResults>("/debug/pipeline-results", token),
    enabled: !!token && (opts?.enabled ?? true),
  })
}

export function usePipelineState(token: string) {
  return useQuery({
    queryKey: queryKeys.state(),
    queryFn: () => apiGet<PipelineState>("/debug/pipeline-state", token),
    enabled: !!token,
  })
}

export function usePipelineRuns(token: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.runs(),
    queryFn: () => apiGet<PipelineRunsHistory>("/debug/pipeline-runs?limit=30", token),
    enabled: !!token && (opts?.enabled ?? true),
  })
}

export function useHomeView(token: string, date: string) {
  return useQuery({
    queryKey: queryKeys.homeView(date),
    queryFn: () => apiGet<HomeView>(withTimeZone(`/views/home?date=${enc(date)}`), token),
    enabled: !!token,
  })
}

export function useSleepView(token: string, date: string) {
  return useQuery({
    queryKey: queryKeys.sleepView(date),
    queryFn: () =>
      apiGet<SleepView>(withTimeZone(`/views/sleep?date=${enc(date)}`), token),
    enabled: !!token,
  })
}

export function useTelemetry(
  token: string,
  opts?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.telemetry(),
    queryFn: () => apiGet<Telemetry>("/debug/telemetry?limit=200", token),
    enabled: !!token && (opts?.enabled ?? true),
    refetchInterval: opts?.refetchInterval ?? false,
  })
}

export function useBatteryHistory(
  token: string,
  opts?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.batteryHistory(),
    queryFn: () => apiGet<BatteryHistory>("/debug/battery-history?hours=24", token),
    enabled: !!token && (opts?.enabled ?? true),
    refetchInterval: opts?.refetchInterval ?? false,
  })
}

export function useTrends(token: string, days: number) {
  return useQuery({
    queryKey: queryKeys.trends(days),
    queryFn: () => apiGet<TrendsView>(`/views/trends?days=${days}`, token),
    enabled: !!token,
  })
}

// Invalidate everything that derives from raw or pipeline state. Used
// after a successful run or seed.
function invalidateAll(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries()
}

export function useRunPipeline(token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (opts: PipelineRunOptions) => triggerPipelineRun(token, opts),
    onSuccess: () => invalidateAll(client),
  })
}

export function useSeed(token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost("/debug/seed?nights=7", token),
    onSuccess: () => invalidateAll(client),
  })
}
