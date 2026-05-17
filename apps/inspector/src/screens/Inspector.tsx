import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { API_BASE_URL, type PipelineRunOptions } from "../api"
import { useUrlState } from "../hooks/useUrlState"
import {
  useBatteryHistory,
  useHomeView,
  useOverview,
  usePipelineResults,
  usePipelineRuns,
  usePipelineState,
  useRaw,
  useRunPipeline,
  useSeed,
  useSleep,
  useSleepView,
  useTelemetry,
  useTrends,
} from "../hooks/useInspectorQueries"
import { IconRail, type RailTab } from "../shell/IconRail"
import { TopBar } from "../shell/TopBar"
import { isAuthError } from "../utils/errors"

const OverviewTab = lazy(() => import("../tabs/Overview").then((m) => ({ default: m.OverviewTab })))
const TrendsTab = lazy(() => import("../tabs/Trends").then((m) => ({ default: m.TrendsTab })))
const InsightsTab = lazy(() => import("../tabs/Insights").then((m) => ({ default: m.InsightsTab })))
const SleepTab = lazy(() => import("../tabs/Sleep").then((m) => ({ default: m.SleepTab })))
const RawTab = lazy(() => import("../tabs/Raw").then((m) => ({ default: m.RawTab })))
const PipelineTab = lazy(() => import("../tabs/Pipeline").then((m) => ({ default: m.PipelineTab })))
const TelemetryTab = lazy(() => import("../tabs/Telemetry").then((m) => ({ default: m.TelemetryTab })))

type TabId = "home" | "sleep" | "pipeline" | "raw" | "trends" | "insights" | "telemetry"

const RAIL_TABS: { id: TabId; label: string; icon: ReactNode; shortcut: string }[] = [
  {
    id: "home",
    label: "Home",
    shortcut: "1",
    icon: (
      <Icon path="M2.25 12 12 2.25 21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    ),
  },
  {
    id: "sleep",
    label: "Sleep",
    shortcut: "2",
    icon: <Icon path="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    shortcut: "3",
    icon: (
      <Icon path="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    ),
  },
  {
    id: "raw",
    label: "Raw",
    shortcut: "4",
    icon: (
      <Icon path="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125" />
    ),
  },
  {
    id: "trends",
    label: "Trends",
    shortcut: "5",
    icon: <Icon path="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />,
  },
  {
    id: "insights",
    label: "Insights",
    shortcut: "6",
    icon: <Icon path="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />,
  },
  {
    id: "telemetry",
    label: "Telemetry",
    shortcut: "7",
    icon: <Icon path="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />,
  },
]

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="w-[18px] h-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

export function Inspector({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useUrlState("tab", "home", () =>
    (localStorage.getItem("noop.tab") as TabId | null) ?? null,
  )
  const [date, setDate] = useUrlState("date", new Date().toISOString().slice(0, 10))
  const [trendsDaysStr, setTrendsDaysStr] = useUrlState(
    "trendsDays",
    "30",
    () => localStorage.getItem("noop.trendsDays"),
  )
  const trendsDays = Number(trendsDaysStr) || 30

  const [live, setLive] = useState(false)

  const overview = useOverview(token, date)
  const homeView = useHomeView(token, date)
  const sleepView = useSleepView(token, date)
  const sleep = useSleep(token, date, { enabled: tab === "sleep" || tab === "home" || tab === "insights" })
  const raw = useRaw(token, date, { enabled: tab === "sleep" || tab === "raw" })
  const results = usePipelineResults(token, {
    enabled: tab === "pipeline" || tab === "insights" || tab === "home",
  })
  const pipelineState = usePipelineState(token)
  const runs = usePipelineRuns(token, { enabled: tab === "pipeline" })
  const telemetry = useTelemetry(token, {
    enabled: tab === "telemetry" || live,
    refetchInterval: live ? 5_000 : false,
  })
  const battery = useBatteryHistory(token, {
    enabled: tab === "telemetry",
    refetchInterval: live ? 30_000 : false,
  })
  const trends = useTrends(token, trendsDays)

  const setTrendsDays = useCallback(
    (d: number) => {
      setTrendsDaysStr(String(d))
      localStorage.setItem("noop.trendsDays", String(d))
    },
    [setTrendsDaysStr],
  )

  const goTab = useCallback(
    (next: string) => {
      setTab(next)
      localStorage.setItem("noop.tab", next)
    },
    [setTab],
  )

  const runMutation = useRunPipeline(token)
  const seedMutation = useSeed(token)

  const onRunPipeline = useCallback(
    (opts: PipelineRunOptions) => {
      runMutation.mutate(opts)
    },
    [runMutation],
  )

  const onSeed = useCallback(() => {
    seedMutation.mutate()
  }, [seedMutation])

  const onRefresh = useCallback(() => {
    void overview.refetch()
    void homeView.refetch()
    void sleepView.refetch()
    void pipelineState.refetch()
    if (sleep.fetchStatus !== "idle") void sleep.refetch()
    if (raw.fetchStatus !== "idle") void raw.refetch()
    if (results.fetchStatus !== "idle") void results.refetch()
    if (runs.fetchStatus !== "idle") void runs.refetch()
    if (telemetry.fetchStatus !== "idle") void telemetry.refetch()
    if (battery.fetchStatus !== "idle") void battery.refetch()
    void trends.refetch()
  }, [overview, homeView, sleepView, pipelineState, sleep, raw, results, runs, telemetry, battery, trends])

  const busy = runMutation.isPending || seedMutation.isPending

  const railTabs = useMemo<RailTab[]>(
    () =>
      RAIL_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
        shortcut: t.shortcut,
        badge:
          t.id === "telemetry" && telemetry.data
            ? telemetry.data.events.totalCount
            : undefined,
        dot: t.id === "pipeline" && pipelineState.data?.isDirty ? "warn" : undefined,
      })),
    [pipelineState.data, telemetry.data],
  )

  const queries = [overview, homeView, sleepView, pipelineState, sleep, raw, results, runs, telemetry, battery, trends]
  const sawAuthFailure = queries.some((q) => q.error && isAuthError(q.error))
  useEffect(() => {
    if (sawAuthFailure) onLogout()
  }, [sawAuthFailure, onLogout])

  const lastRefreshedAt = overview.dataUpdatedAt
    ? new Date(overview.dataUpdatedAt).toISOString()
    : null

  const firstError = [overview, homeView, sleepView, pipelineState, results, trends].find(
    (q) => q.error && !isAuthError(q.error),
  )?.error

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar
        apiHost={API_BASE_URL.replace(/^https?:\/\//, "").slice(0, 40)}
        date={date}
        onDateChange={setDate}
        pipelineState={pipelineState.data}
        lastRefreshedAt={lastRefreshedAt}
        busy={busy}
        onRefresh={onRefresh}
        onRunPipeline={onRunPipeline}
        live={live}
        onToggleLive={() => setLive((v) => !v)}
      />

      <div className="flex-1 flex overflow-hidden">
        <IconRail
          tabs={railTabs}
          active={tab}
          onSelect={goTab}
          onSeed={onSeed}
          onLogout={onLogout}
        />

        <main className="flex-1 overflow-y-auto">
          {firstError && (
            <div className="px-8 pt-4">
              <p className="text-sm text-red bg-red-soft rounded-lg px-4 py-2.5">
                {firstError instanceof Error ? firstError.message : String(firstError)}
              </p>
            </div>
          )}

          <div className="px-8 py-6">
            <Suspense fallback={<div className="text-text-2 text-sm">Loading…</div>}>
              {(tab === "home" || tab === "overview") && (
                <OverviewTab
                  overview={overview.data ?? null}
                  homeView={homeView.data ?? null}
                  sleepView={sleepView.data ?? null}
                />
              )}
              {tab === "trends" && (
                <TrendsTab
                  trends={trends.data ?? null}
                  rangeDays={trendsDays}
                  onRangeChange={setTrendsDays}
                  onRunPipeline={onRunPipeline}
                  busy={busy}
                />
              )}
              {tab === "insights" && (
                <InsightsTab
                  sleep={sleep.data ?? null}
                  baseline={results.data?.results.baselineProfile ?? null}
                  trends={trends.data ?? null}
                  journalCorrelations={results.data?.results.journalCorrelations ?? []}
                />
              )}
              {tab === "sleep" && (
                <SleepTab
                  sleep={sleep.data ?? null}
                  epochs={sleep.data?.epochTimeline ?? []}
                  raw={raw.data ?? null}
                  selectedDate={date}
                  onRunPipeline={onRunPipeline}
                  busy={busy}
                />
              )}
              {tab === "raw" && <RawTab raw={raw.data ?? null} date={date} />}
              {tab === "pipeline" && (
                <PipelineTab
                  state={pipelineState.data ?? null}
                  results={results.data ?? null}
                  runs={runs.data ?? null}
                />
              )}
              {tab === "telemetry" && (
                <TelemetryTab
                  telemetry={telemetry.data ?? null}
                  batteryHistory={battery.data ?? null}
                  live={live}
                  toggleLive={() => setLive((v) => !v)}
                />
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
