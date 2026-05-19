import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  HomeSkeleton,
  SleepSkeleton,
  PipelineSkeleton,
  RawSkeleton,
  TrendsSkeleton,
  InsightsSkeleton,
  TelemetrySkeleton,
} from "../tabs/skeletons"

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
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { CommandPalette, type Command } from "../shell/CommandPalette"
import { HelpModal } from "../shell/HelpModal"
import { Masthead } from "../shell/Masthead"
import { Sidebar, type SidebarTab } from "../shell/Sidebar"
import { NetworkError, ServerError, isAuthError } from "../utils/errors"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import {
  AlertCircle,
  Home as HomeIcon,
  Moon,
  Lightbulb,
  TrendingUp,
  Table as TableIcon,
  Workflow,
  Activity,
} from "lucide-react"
import { toast } from "sonner"

function shiftDateIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

const HomeTab = lazy(() => import("../tabs/Home").then((m) => ({ default: m.HomeTab })))
const TrendsTab = lazy(() => import("../tabs/Trends").then((m) => ({ default: m.TrendsTab })))
const InsightsTab = lazy(() => import("../tabs/Insights").then((m) => ({ default: m.InsightsTab })))
const SleepTab = lazy(() => import("../tabs/Sleep").then((m) => ({ default: m.SleepTab })))
const RawTab = lazy(() => import("../tabs/Raw").then((m) => ({ default: m.RawTab })))
const PipelineTab = lazy(() => import("../tabs/Pipeline").then((m) => ({ default: m.PipelineTab })))
const TelemetryTab = lazy(() => import("../tabs/Telemetry").then((m) => ({ default: m.TelemetryTab })))

type TabId = "home" | "sleep" | "pipeline" | "raw" | "trends" | "insights" | "telemetry"

const TAB_SKELETONS: Record<string, ReactNode> = {
  home: <HomeSkeleton />,
  overview: <HomeSkeleton />,
  sleep: <SleepSkeleton />,
  pipeline: <PipelineSkeleton />,
  raw: <RawSkeleton />,
  trends: <TrendsSkeleton />,
  insights: <InsightsSkeleton />,
  telemetry: <TelemetrySkeleton />,
}

const TAB_DEFS: { id: TabId; label: string; shortcut: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", shortcut: "1", icon: <HomeIcon className="size-4" /> },
  { id: "sleep", label: "Sleep", shortcut: "2", icon: <Moon className="size-4" /> },
  { id: "insights", label: "Insights", shortcut: "6", icon: <Lightbulb className="size-4" /> },
  { id: "trends", label: "Trends", shortcut: "5", icon: <TrendingUp className="size-4" /> },
  { id: "raw", label: "Raw", shortcut: "4", icon: <TableIcon className="size-4" /> },
  { id: "pipeline", label: "Pipeline", shortcut: "3", icon: <Workflow className="size-4" /> },
  { id: "telemetry", label: "Telemetry", shortcut: "7", icon: <Activity className="size-4" /> },
]

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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

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
      const promise = runMutation.mutateAsync(opts)
      toast.promise(promise, {
        loading: "Running pipeline...",
        success: () => {
          const scope = opts.day
            ? `for ${opts.day}`
            : opts.from && opts.to
              ? "for selected range"
              : "(full window)"
          return `Pipeline ran ${scope}`
        },
        error: (e) => `Pipeline failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    },
    [runMutation],
  )

  const onSeed = useCallback(() => {
    const promise = seedMutation.mutateAsync()
    toast.promise(promise, {
      loading: "Seeding demo data...",
      success: "Demo data seeded (7 nights)",
      error: (e) => `Seed failed: ${e instanceof Error ? e.message : String(e)}`,
    })
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

  const tabs = useMemo<SidebarTab[]>(
    () =>
      TAB_DEFS.map((t) => ({
        id: t.id,
        label: t.label,
        shortcut: t.shortcut,
        icon: t.icon,
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

  const commands: Command[] = useMemo(() => {
    const navCommands: Command[] = TAB_DEFS.map((t) => ({
      id: `nav-${t.id}`,
      label: `Go to ${t.label}`,
      group: "Navigate",
      shortcut: t.shortcut,
      run: () => goTab(t.id),
    }))
    return [
      ...navCommands,
      {
        id: "refresh",
        label: "Refresh all data",
        group: "Actions",
        shortcut: "R",
        run: () => onRefresh(),
      },
      {
        id: "run-today",
        label: `Run pipeline · ${date} only`,
        group: "Actions",
        run: () => onRunPipeline({ day: date }),
      },
      {
        id: "run-7d",
        label: "Run pipeline · last 7 days",
        group: "Actions",
        run: () => {
          const to = new Date()
          const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
          onRunPipeline({ from: from.toISOString(), to: to.toISOString() })
        },
      },
      {
        id: "run-30d",
        label: "Run pipeline · last 30 days",
        group: "Actions",
        run: () => {
          const to = new Date()
          const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
          onRunPipeline({ from: from.toISOString(), to: to.toISOString() })
        },
      },
      {
        id: "run-full",
        label: "Run pipeline · full (last 45 days)",
        group: "Actions",
        run: () => onRunPipeline({}),
      },
      {
        id: "seed",
        label: "Seed demo data (7 nights)",
        group: "Actions",
        run: onSeed,
      },
      {
        id: "live",
        label: live ? "Pause live tail" : "Start live tail",
        group: "Data",
        shortcut: "L",
        run: () => setLive((v) => !v),
      },
      {
        id: "copy-link",
        label: "Copy permalink to this view",
        group: "Data",
        run: () => {
          void navigator.clipboard.writeText(window.location.href)
        },
      },
      {
        id: "signout",
        label: "Sign out",
        group: "Actions",
        run: onLogout,
      },
      {
        id: "date-prev",
        label: "Date · previous day",
        group: "Date",
        shortcut: "[",
        run: () => setDate(shiftDateIso(date, -1)),
      },
      {
        id: "date-next",
        label: "Date · next day",
        group: "Date",
        shortcut: "]",
        run: () => setDate(shiftDateIso(date, 1)),
      },
      {
        id: "date-today",
        label: "Date · today",
        group: "Date",
        shortcut: "T",
        run: () => setDate(new Date().toISOString().slice(0, 10)),
      },
      {
        id: "date-yesterday",
        label: "Date · yesterday",
        group: "Date",
        run: () => setDate(shiftDateIso(new Date().toISOString().slice(0, 10), -1)),
      },
    ]
  }, [date, goTab, live, onLogout, onRefresh, onRunPipeline, onSeed, setDate])

  const shortcuts = useMemo(
    () => ({
      "mod+k": () => setPaletteOpen(true),
      "?": () => setHelpOpen(true),
      r: () => onRefresh(),
      l: () => setLive((v) => !v),
      "1": () => goTab("home"),
      "2": () => goTab("sleep"),
      "3": () => goTab("pipeline"),
      "4": () => goTab("raw"),
      "5": () => goTab("trends"),
      "6": () => goTab("insights"),
      "7": () => goTab("telemetry"),
      "[": () => setDate(shiftDateIso(date, -1)),
      "]": () => setDate(shiftDateIso(date, 1)),
      t: () => setDate(new Date().toISOString().slice(0, 10)),
      escape: () => {
        setPaletteOpen(false)
        setHelpOpen(false)
      },
    }),
    [date, goTab, onRefresh, setDate],
  )

  useKeyboardShortcuts(shortcuts, !paletteOpen)

  return (
    <div className="min-h-screen flex">
      <Sidebar
        tabs={tabs}
        active={tab}
        onSelect={goTab}
        apiHost={API_BASE_URL.replace(/^https?:\/\//, "").slice(0, 40)}
        onSeed={onSeed}
        onLogout={onLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <Masthead
          date={date}
          onDateChange={setDate}
          pipelineState={pipelineState.data}
          lastRefreshedAt={lastRefreshedAt}
          busy={busy}
          onRefresh={onRefresh}
          onRunPipeline={onRunPipeline}
          live={live}
          onToggleLive={() => setLive((v) => !v)}
          onSelectTab={goTab}
        />

        <main className="flex-1">
          {firstError && (
            <div className="px-8 pt-6 max-w-[1600px] mx-auto w-full">
              <ErrorBanner error={firstError} onRetry={onRefresh} apiHost={API_BASE_URL} />
            </div>
          )}

          <div className="px-8 py-8 max-w-[1600px] mx-auto w-full">
            <Suspense fallback={TAB_SKELETONS[tab] ?? <div className="text-muted-foreground text-sm">Loading…</div>}>
            {(tab === "home" || tab === "overview") && (
                <HomeTab
                  overview={overview.data ?? null}
                  homeView={homeView.data ?? null}
                  sleepView={sleepView.data ?? null}
                  sleep={sleep.data ?? null}
                  pipelineState={pipelineState.data ?? null}
                  baseline={results.data?.results.baselineProfile ?? null}
                  trends={trends.data ?? null}
                  journalCorrelations={results.data?.results.journalCorrelations ?? []}
                  date={date}
                  onRunPipeline={onRunPipeline}
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
                  date={date}
                  onRunPipeline={onRunPipeline}
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  )
}

function ErrorBanner({
  error,
  onRetry,
  apiHost,
}: {
  error: unknown
  onRetry: () => void
  apiHost: string
}) {
  let title = "Could not load data"
  let detail: string = error instanceof Error ? error.message : String(error)
  if (error instanceof NetworkError) {
    title = "Could not reach the backend"
    detail = `Check that the server at ${apiHost.replace(/^https?:\/\//, "")} is running.`
  } else if (error instanceof ServerError && error.status >= 500) {
    title = "Backend returned an error"
  }
  return (
    <Alert variant="destructive" className="flex items-start gap-3">
      <AlertCircle className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{detail}</AlertDescription>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="text-destructive hover:bg-destructive/10 shrink-0 -my-1"
      >
        Retry
      </Button>
    </Alert>
  )
}
