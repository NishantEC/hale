import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, ReactNode } from "react"

import {
  API_BASE_URL,
  apiGet,
  apiPost,
  emailStorage,
  type HomeView,
  type Overview,
  type PipelineResults,
  type PipelineState,
  type RawRecords,
  signIn,
  signUp,
  type SleepNight,
  type SleepView,
  type Telemetry,
  tokenStorage,
  type TrendsView,
} from "./api"
import { InsightsTab } from "./tabs/Insights"
import { OverviewTab } from "./tabs/Overview"
import { PipelineTab } from "./tabs/Pipeline"
import { RawTab } from "./tabs/Raw"
import { SleepTab } from "./tabs/Sleep"
import { TelemetryTab } from "./tabs/Telemetry"
import { TrendsTab } from "./tabs/Trends"
import { relativeTime } from "./format"

// ── Tabs ─────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "trends"
  | "insights"
  | "sleep"
  | "raw"
  | "pipeline"
  | "telemetry"

const TAB_DEFS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <Icon path="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />,
  },
  {
    id: "trends",
    label: "Trends",
    icon: <Icon path="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />,
  },
  {
    id: "insights",
    label: "Insights",
    icon: <Icon path="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />,
  },
  {
    id: "sleep",
    label: "Sleep",
    icon: <Icon path="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />,
  },
  {
    id: "raw",
    label: "Raw Data",
    icon: <Icon path="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125" />,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: <Icon path="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  },
  {
    id: "telemetry",
    label: "Telemetry",
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

// ── App ──────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(tokenStorage.get)

  if (!token) return <SignInScreen onAuthed={setToken} />
  return <Inspector token={token} onLogout={() => { tokenStorage.clear(); setToken("") }} />
}

// ── Auth screen ──────────────────────────────────────────────

function SignInScreen({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState(emailStorage.get)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === "signin" ? await signIn(email, password) : await signUp(email, password)
      tokenStorage.set(result.token)
      emailStorage.set(result.email)
      onAuthed(result.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold mb-1">Noop Inspector</h1>
        <p className="text-text-1 mb-2">
          {mode === "signin" ? "Sign in to your backend account" : "Create a new account"}
        </p>
        <p className="text-text-2 text-xs mb-8">
          {API_BASE_URL.replace(/^https?:\/\//, "")}
        </p>
        <form className="space-y-4" onSubmit={submit}>
          <input
            className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            autoComplete="email"
          />
          <input
            className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          <button
            type="submit"
            className="w-full bg-text-0 text-surface font-semibold rounded-lg py-3 cursor-pointer disabled:opacity-40"
            disabled={busy}
          >
            {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-text-2 text-sm hover:text-text-1 transition-colors cursor-pointer"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin")
            setError(null)
          }}
        >
          {mode === "signin"
            ? "No account yet? Create one."
            : "Already have an account? Sign in."}
        </button>
        {error && <p className="mt-4 text-red text-sm">{error}</p>}
      </div>
    </div>
  )
}

// ── Inspector main ───────────────────────────────────────────

function Inspector({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>(
    () => (localStorage.getItem("noop.tab") as Tab) || "overview",
  )
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [raw, setRaw] = useState<RawRecords | null>(null)
  const [sleep, setSleep] = useState<SleepNight | null>(null)
  const [results, setResults] = useState<PipelineResults | null>(null)
  const [state, setState] = useState<PipelineState | null>(null)
  const [homeView, setHomeView] = useState<HomeView | null>(null)
  const [sleepView, setSleepView] = useState<SleepView | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [trends, setTrends] = useState<TrendsView | null>(null)
  const [trendsDays, setTrendsDays] = useState<number>(
    () => Number(localStorage.getItem("noop.trendsDays")) || 30,
  )
  const [live, setLive] = useState(false)
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTab = (next: Tab) => {
    setTab(next)
    localStorage.setItem("noop.tab", next)
  }

  const refresh = useCallback(async () => {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      const d = encodeURIComponent(date)
      const [
        ovRes,
        rawRes,
        sleepRes,
        resultsRes,
        stateRes,
        homeRes,
        sleepViewRes,
        telRes,
        trendsRes,
      ] = await Promise.all([
        apiGet<Overview>(`/debug/overview?date=${d}`, token),
        apiGet<RawRecords>(`/debug/raw-records?date=${d}&limit=200`, token),
        apiGet<SleepNight>(`/debug/sleep-night?date=${d}`, token),
        apiGet<PipelineResults>("/debug/pipeline-results", token),
        apiGet<PipelineState>("/debug/pipeline-state", token).catch(() => null),
        apiGet<HomeView>(`/views/home?date=${d}`, token),
        apiGet<SleepView>(`/views/sleep?date=${d}`, token),
        apiGet<Telemetry>("/debug/telemetry?limit=200", token).catch(() => null),
        apiGet<TrendsView>(`/views/trends?days=${trendsDays}`, token).catch(() => null),
      ])
      setOverview(ovRes)
      setRaw(rawRes)
      setSleep(sleepRes)
      setResults(resultsRes)
      setState(stateRes)
      setHomeView(homeRes)
      setSleepView(sleepViewRes)
      setTelemetry(telRes)
      setTrends(trendsRes)
      setLastRefreshedAt(new Date().toISOString())
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }, [date, token, trendsDays])

  const refreshTelemetry = useCallback(async () => {
    if (!token) return
    try {
      setTelemetry(await apiGet<Telemetry>("/debug/telemetry?limit=200", token))
    } catch {
      // swallow — keep last good value
    }
  }, [token])

  useEffect(() => {
    if (token) void refresh()
  }, [refresh, token])

  // Auto-refresh on tab focus. Single-user inspector: when you come back
  // to the tab after a sync from the phone, you want fresh data without
  // hunting for the button.
  useEffect(() => {
    const onFocus = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (live && tab === "telemetry") {
      liveTimer.current = setInterval(() => void refreshTelemetry(), 5000)
    }
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current)
    }
  }, [live, tab, refreshTelemetry])

  const runPipeline = async () => {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      await apiPost(
        "/debug/pipeline/run?date=" + encodeURIComponent(date),
        token,
      )
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
      setBusy(false)
    }
  }

  const seedDemo = async () => {
    if (!token) return
    setBusy(true)
    setErr(null)
    try {
      await apiPost("/debug/seed?nights=7", token)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
      setBusy(false)
    }
  }

  const epochs = useMemo(() => sleep?.epochTimeline ?? [], [sleep?.epochTimeline])

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-surface">
        <div className="px-5 py-6">
          <h1 className="text-base font-semibold tracking-tight">Noop Inspector</h1>
          <p className="text-text-2 text-xs mt-0.5">
            {API_BASE_URL.replace(/^https?:\/\//, "").slice(0, 32)}
          </p>
          <p className="text-text-2 text-xs mt-2">
            {lastRefreshedAt
              ? `Refreshed ${relativeTime(lastRefreshedAt)}`
              : "Loading…"}
          </p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium cursor-pointer transition-colors ${
                tab === t.id
                  ? "bg-surface-2 text-text-0"
                  : "text-text-1 hover:bg-surface-1 hover:text-text-0"
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === "telemetry" && telemetry && telemetry.events.totalCount > 0 && (
                <span className="ml-auto text-[11px] bg-accent-soft text-accent font-semibold px-1.5 py-0.5 rounded-md">
                  {telemetry.events.totalCount}
                </span>
              )}
              {t.id === "pipeline" && state?.isDirty && (
                <span
                  className="ml-auto w-2 h-2 rounded-full bg-yellow"
                  title="Inputs changed since last run"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="px-4 py-5 border-t border-border space-y-3">
          <label className="block">
            <span className="text-text-2 text-xs font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-border-strong"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="flex-1 bg-surface-2 border border-border text-text-0 font-medium rounded-lg py-2 text-sm cursor-pointer hover:bg-surface-3 transition-colors disabled:opacity-40"
            >
              {busy ? "..." : "Refresh"}
            </button>
            <button
              onClick={() => void runPipeline()}
              disabled={busy}
              className="flex-1 bg-accent text-white font-medium rounded-lg py-2 text-sm cursor-pointer hover:bg-accent/85 transition-colors disabled:opacity-40"
            >
              Pipeline
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void seedDemo()}
              disabled={busy}
              className="flex-1 bg-surface-1 border border-border text-text-1 rounded-lg py-2 text-sm cursor-pointer hover:text-text-0 hover:border-border-strong transition-colors disabled:opacity-40"
            >
              Seed
            </button>
            <button
              onClick={onLogout}
              className="flex-1 text-text-2 text-sm cursor-pointer hover:text-text-0 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {err && (
          <div className="px-10 pt-4">
            <p className="text-sm text-red bg-red-soft rounded-lg px-4 py-2.5">{err}</p>
          </div>
        )}

        <div className="px-10 py-8 max-w-5xl">
          {tab === "overview" && (
            <OverviewTab
              overview={overview}
              homeView={homeView}
              sleepView={sleepView}
            />
          )}
          {tab === "trends" && (
            <TrendsTab
              trends={trends}
              rangeDays={trendsDays}
              onRangeChange={(d) => {
                setTrendsDays(d)
                localStorage.setItem("noop.trendsDays", String(d))
              }}
            />
          )}
          {tab === "insights" && (
            <InsightsTab
              sleep={sleep}
              baseline={results?.results.baselineProfile ?? null}
              trends={trends}
              journalCorrelations={results?.results.journalCorrelations ?? []}
            />
          )}
          {tab === "sleep" && <SleepTab sleep={sleep} epochs={epochs} />}
          {tab === "raw" && <RawTab raw={raw} date={date} />}
          {tab === "pipeline" && (
            <PipelineTab state={state} results={results} />
          )}
          {tab === "telemetry" && (
            <TelemetryTab
              telemetry={telemetry}
              live={live}
              toggleLive={() => setLive((v) => !v)}
            />
          )}
        </div>
      </main>
    </div>
  )
}
