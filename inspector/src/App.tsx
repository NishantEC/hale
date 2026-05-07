import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode, MouseEvent as RME } from 'react'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3009'
const TK = 'noop.inspector.token'
const EK = 'noop.inspector.email'

// ── Types ────────────────────────────────────────────────────

type Overview = {
  selectedDate: string; selectedDateTitle: string; selectedDateSubtitle: string
  selectedNightDate: string | null; selectionMode: string; selectionReason: string
  counts: { rawRecordCount: number; sleepDetectionCount: number; sleepStageCount: number; dailyScoreCount: number; dailyMetricCount: number; selectedDayRawRecordCount: number }
  earliestRawTimestamp: string | null; latestRawTimestamp: string | null
  latestSyncMetadata: { lastRawRecordAt: string | null; lastSleepPlanUpdateAt: string | null; plannerConfigured: boolean }
  selectedEntities: { detectionId: string | null; stageId: string | null; featureId: string | null; epochTimelineCount: number }
  lastPipelineRunStatus: string
  viewSummary: { home: { title: string; headline: string; recommendation: string }; sleep: { title: string; isEmpty: boolean; bedtime: string; wakeTime: string } }
}
type RawRecords = { selectedDate: string; count: number; rows: Array<{ id: string; timestamp: string; heartRate: number; rrAverageMs: number | null; skinContact: boolean | null; gravityMagnitude: number | null; gravityX: number | null; gravityY: number | null; gravityZ: number | null; respRateRaw: number | null; spo2Red: number | null; spo2IR: number | null; skinTempRaw: number | null }> }
type SleepNight = {
  selectedDate: string; selectedNightDate: string | null; selectionMode: string; selectionReason: string
  selectedDetection: { id: string; nightDate: string; bedtime: string | null; wakeTime: string | null; durationHours: number; interruptionCount: number; continuity: number; regularity: number; validCoverage: number; confidence: number } | null
  selectedStage: { id: string; nightDate: string; remMinutes: number; coreMinutes: number; deepMinutes: number; awakeMinutes: number; unknownMinutes: number; confidence: number; source: string; epochMinutes: number } | null
  selectedNightFeature: { id: string; nightDate: string; restingHeartRate: number; rmssd: number; sdnn: number; respiratoryRate: number; continuity: number; regularity: number; validCoverage: number; confidenceRaw: number; sleepEstimateHours: number; sourceBlend: string } | null
  stageTotals: { remMinutes: number; lightMinutes: number; deepMinutes: number; awakeMinutes: number; unknownMinutes: number } | null
  epochTimelineCount: number; epochTimeline: Array<{ timestamp: string; stage: string }>
}
type PipelineResults = { rawRecordCount: number; earliestRawTimestamp: string | null; latestRawTimestamp: string | null; results: { nightFeatures: unknown[]; sleepDetections: unknown[]; sleepStages: unknown[]; dailyScores: unknown[]; dailyMetrics: unknown[]; baselineProfile: unknown | null; sleepPlan: unknown | null; typicalRanges: unknown | null; journalCorrelations: unknown[] } }
type Telemetry = { events: { totalCount: number; summary: Record<string, number>; recent: Array<{ eventName: string; eventNumber: number; deviceId: string; capturedAt: string; receivedAt: string }> }; realtime: { totalCount: number; sessions: Record<string, { dataType: string; count: number; earliest: string; latest: string }>; recent: Array<{ dataType: string; heartRate: number | null; sessionId: string; capturedAt: string }> }; consoleLogs?: { totalCount: number; deviceInfo: Record<string, any> | null; recent: Array<{ message: string; logLevel: string | null; deviceId: string; metadata: Record<string, any> | null; capturedAt: string; receivedAt: string }> } }
type Views = { selectedDate: string; homeView: { selectedDateTitle: string; selectedDateSubtitle: string; todayOverview: { headline: string; detail: string }; cards: { recommendation: { title: string; subtitle: string } } }; sleepView: { selectedDateTitle: string; selectedDateSubtitle: string; emptyState: { isEmpty: boolean; title: string; subtitle: string }; header: { bedtime: string; wakeTime: string; duration: string }; sleepInsight: string | null }; overview: Overview }
type Tab = 'overview' | 'sleep' | 'raw' | 'pipeline' | 'telemetry'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg> },
  { id: 'sleep', label: 'Sleep', icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg> },
  { id: 'raw', label: 'Raw Data', icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c.621 0 1.125.504 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" /></svg> },
  { id: 'pipeline', label: 'Pipeline', icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg> },
  { id: 'telemetry', label: 'Telemetry', icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg> },
]

// ── API ──────────────────────────────────────────────────────

const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, 'ngrok-skip-browser-warning': 'true' })
async function jp<T>(r: Response): Promise<T> { const t = await r.text(); if (!r.ok) throw new Error(t || `${r.status}`); return JSON.parse(t) as T }
const get = <T,>(p: string, t: string) => fetch(`${API}${p}`, { headers: hdr(t) }).then(r => jp<T>(r))
const post = <T,>(p: string, t: string) => fetch(`${API}${p}`, { method: 'POST', headers: hdr(t) }).then(r => jp<T>(r))

const fts = (v: string | null) => v ? new Date(v).toLocaleString() : '—'
const ftime = (v: string | null) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
const fn = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v)) ? '—' : v.toFixed(d)

// ── Hypnogram constants (reference repo) ─────────────────────

const STAGES = {
  awake: { pos: 0, label: 'Awake', color: '#FE8A73' },
  rem:   { pos: 1, label: 'REM',   color: '#3FB1E7' },
  core:  { pos: 2, label: 'Core',  color: '#1B81FE' },
  deep:  { pos: 3, label: 'Deep',  color: '#403EA7' },
} as const
const SK = ['awake', 'rem', 'core', 'deep'] as const
const CH = 260, MG = 16, RH = (CH - MG) / 4, BH = RH * 0.45, BO = BH * 0.8, BW = 2, DSH = 3
const CT = 'M6 7V15H5C5 15 5.30874 11.8133 4.02284 10.107C2.73695 8.40073 0 8 0 8V7H6Z'
const CB = 'M6 8V0H5C5 0 5.28401 3.15824 4 5C2.71599 6.84176 0 7 0 7V8H6Z'

type Seg = { id: number; type: keyof typeof STAGES; fromMin: number; toMin: number }

function normS(s: string): keyof typeof STAGES {
  const k = s.toLowerCase()
  return k === 'light' ? 'core' : k === 'sws' ? 'deep' : k in STAGES ? k as keyof typeof STAGES : 'core'
}
function mkSegs(ep: { stage: string }[]): Seg[] {
  if (!ep.length) return []
  const o: Seg[] = []; let c = normS(ep[0].stage), s = 0
  for (let i = 1; i < ep.length; i++) { const n = normS(ep[i].stage); if (n !== c) { o.push({ id: o.length, type: c, fromMin: s, toMin: i }); c = n; s = i } }
  o.push({ id: o.length, type: c, fromMin: s, toMin: ep.length }); return o
}
function lerp(v: number, a: number, b: number, c: number, d: number) { return b === a ? c : c + ((v - a) / (b - a)) * (d - c) }

// ── App ──────────────────────────────────────────────────────

export default function App() {
  const [email, setEmail] = useState(() => localStorage.getItem(EK) ?? '')
  const [pw, setPw] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem(TK) ?? '')
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('noop.tab') as Tab) || 'overview')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const [raw, setRaw] = useState<RawRecords | null>(null)
  const [slp, setSlp] = useState<SleepNight | null>(null)
  const [pip, setPip] = useState<PipelineResults | null>(null)
  const [vw, setVw] = useState<Views | null>(null)
  const [tel, setTel] = useState<Telemetry | null>(null)
  const [live, setLive] = useState(false)
  const tr = useRef<ReturnType<typeof setInterval> | null>(null)

  const go = (t: Tab) => { setTab(t); localStorage.setItem('noop.tab', t) }

  const refresh = useCallback(async () => {
    if (!token) return; setBusy(true); setErr(null)
    try {
      const d = encodeURIComponent(date)
      const [a, b, c, e, hv, sv, g] = await Promise.all([
        get<Overview>(`/debug/overview?date=${d}`, token), get<RawRecords>(`/debug/raw-records?date=${d}&limit=200`, token),
        get<SleepNight>(`/debug/sleep-night?date=${d}`, token), get<PipelineResults>('/debug/pipeline-results', token),
        get<Views['homeView']>(`/views/home?date=${d}`, token), get<Views['sleepView']>(`/views/sleep?date=${d}`, token),
        get<Telemetry>('/debug/telemetry?limit=200', token).catch(() => null),
      ])
      const f: Views = { selectedDate: date, homeView: hv, sleepView: sv, overview: a }
      setOv(a); setRaw(b); setSlp(c); setPip(e); setVw(f); setTel(g); setMsg(`Refreshed ${new Date().toLocaleTimeString()}`)
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed') } finally { setBusy(false) }
  }, [date, token])

  const rTel = useCallback(async () => { if (!token) return; try { setTel(await get<Telemetry>('/debug/telemetry?limit=200', token)) } catch {} }, [token])
  useEffect(() => { if (token) void refresh() }, [refresh, token])
  useEffect(() => { if (live && tab === 'telemetry') tr.current = setInterval(() => void rTel(), 5000); return () => { if (tr.current) clearInterval(tr.current) } }, [live, tab, rTel])

  const login = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const h = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
      let r = await fetch(`${API}/api/auth/sign-in/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password: pw }) })
      if (!r.ok) r = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password: pw, name: email }) })
      if (!r.ok) throw new Error('Auth failed')
      const { token: t } = await jp<{ token: string }>(r)
      localStorage.setItem(TK, t); localStorage.setItem(EK, email); setToken(t); setPw('')
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed') } finally { setBusy(false) }
  }
  const logout = () => { localStorage.removeItem(TK); setToken(''); setOv(null); setRaw(null); setSlp(null); setPip(null); setVw(null); setTel(null) }
  const runPipe = async () => { if (!token) return; setBusy(true); try { await post('/debug/pipeline/run?date=' + encodeURIComponent(date), token); setMsg('Pipeline done.'); await refresh() } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); setBusy(false) } }
  const seed = async () => { if (!token) return; setBusy(true); try { await post('/debug/seed?nights=7', token); setMsg('Seeded.'); await refresh() } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); setBusy(false) } }
  const epochs = useMemo(() => slp?.epochTimeline ?? [], [slp?.epochTimeline])

  if (!token) return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold mb-1">Noop Inspector</h1>
        <p className="text-text-1 mb-8">Sign in with your backend account</p>
        <form className="space-y-4" onSubmit={login}>
          <input className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]" value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" />
          <input className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]" value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="Password" />
          <button className="w-full bg-text-0 text-surface font-semibold rounded-lg py-3 cursor-pointer disabled:opacity-40" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        {err && <p className="mt-4 text-red text-sm">{err}</p>}
      </div>
    </div>
  )

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-surface">
        <div className="px-5 py-6">
          <h1 className="text-base font-semibold tracking-tight">Noop Inspector</h1>
          <p className="text-text-2 text-xs mt-0.5">{API.replace(/^https?:\/\//, '').slice(0, 32)}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => go(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium cursor-pointer transition-colors
                ${tab === t.id ? 'bg-surface-2 text-text-0' : 'text-text-1 hover:bg-surface-1 hover:text-text-0'}`}>
              {t.icon}
              {t.label}
              {t.id === 'telemetry' && tel && tel.events.totalCount > 0 && (
                <span className="ml-auto text-[11px] bg-accent-soft text-accent font-semibold px-1.5 py-0.5 rounded-md">{tel.events.totalCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar controls */}
        <div className="px-4 py-5 border-t border-border space-y-3">
          <label className="block">
            <span className="text-text-2 text-xs font-medium">Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="mt-1 w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-border-strong" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => void refresh()} disabled={busy}
              className="flex-1 bg-surface-2 border border-border text-text-0 font-medium rounded-lg py-2 text-sm cursor-pointer hover:bg-surface-3 transition-colors disabled:opacity-40">{busy ? '...' : 'Refresh'}</button>
            <button onClick={() => void runPipe()} disabled={busy}
              className="flex-1 bg-accent text-white font-medium rounded-lg py-2 text-sm cursor-pointer hover:bg-accent/85 transition-colors disabled:opacity-40">Pipeline</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void seed()} disabled={busy}
              className="flex-1 bg-surface-1 border border-border text-text-1 rounded-lg py-2 text-sm cursor-pointer hover:text-text-0 hover:border-border-strong transition-colors disabled:opacity-40">Seed</button>
            <button onClick={logout}
              className="flex-1 text-text-2 text-sm cursor-pointer hover:text-text-0 transition-colors">Logout</button>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Banners */}
        {(msg || err) && (
          <div className="px-10 pt-4">
            {msg && <p className="text-sm text-green bg-green-soft rounded-lg px-4 py-2.5">{msg}</p>}
            {err && <p className="text-sm text-red bg-red-soft rounded-lg px-4 py-2.5">{err}</p>}
          </div>
        )}

        <div className="px-10 py-8 max-w-5xl">
          {tab === 'overview' && <TabOverview ov={ov} vw={vw} />}
          {tab === 'sleep' && <TabSleep slp={slp} epochs={epochs} />}
          {tab === 'raw' && <TabRaw raw={raw} date={date} />}
          {tab === 'pipeline' && <TabPipeline p={pip} />}
          {tab === 'telemetry' && <TabTelemetry t={tel} live={live} toggle={() => setLive(v => !v)} />}
        </div>
      </main>
    </div>
  )
}

// ── Tab: Overview ────────────────────────────────────────────

function TabOverview({ ov, vw }: { ov: Overview | null; vw: Views | null }) {
  return (
    <div className="space-y-10">
      <div>
        <SectionHead>Counts</SectionHead>
        <div className="grid grid-cols-4 gap-8 mt-4">
          <Num label="Raw rows" value={ov?.counts.rawRecordCount ?? 0} sub={`Day: ${ov?.counts.selectedDayRawRecordCount ?? 0}`} />
          <Num label="Detections" value={ov?.counts.sleepDetectionCount ?? 0} sub={ov?.selectionMode ?? '—'} />
          <Num label="Stages" value={ov?.counts.sleepStageCount ?? 0} sub={`Epochs: ${ov?.selectedEntities.epochTimelineCount ?? 0}`} />
          <Num label="Scores" value={ov?.counts.dailyScoreCount ?? 0} sub={ov?.lastPipelineRunStatus ?? '—'} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <div>
          <SectionHead>Sync state</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Selection" v={ov?.selectionMode ?? '—'} />
            <Row k="Selected night" v={ov?.selectedNightDate ?? '—'} />
            <Row k="Earliest raw" v={fts(ov?.earliestRawTimestamp ?? null)} />
            <Row k="Latest raw" v={fts(ov?.latestRawTimestamp ?? null)} />
            <Row k="Plan updated" v={fts(ov?.latestSyncMetadata.lastSleepPlanUpdateAt ?? null)} />
            <Row k="Reason" v={ov?.selectionReason ?? '—'} />
          </div>
        </div>
        <div>
          <SectionHead>App views</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Headline" v={vw?.homeView.todayOverview.headline ?? '—'} />
            <Row k="Recommendation" v={vw?.homeView.cards.recommendation.title ?? '—'} />
            <Row k="Sleep empty" v={vw?.sleepView.emptyState.isEmpty ? 'Yes' : 'No'} />
            <Row k="Bed → Wake" v={vw ? `${vw.sleepView.header.bedtime} → ${vw.sleepView.header.wakeTime}` : '—'} />
            <Row k="Duration" v={vw?.sleepView.header.duration ?? '—'} />
            <Row k="Insight" v={vw?.sleepView.sleepInsight ?? '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Sleep ───────────────────────────────────────────────

function TabSleep({ slp, epochs }: { slp: SleepNight | null; epochs: Array<{ timestamp: string; stage: string }> }) {
  return (
    <div className="space-y-10">
      <div>
        <div className="grid grid-cols-4 gap-8">
          <Num label="Duration" value={`${fn(slp?.selectedDetection?.durationHours, 1)}h`} sub="total sleep" />
          <Num label="RHR" value={fn(slp?.selectedNightFeature?.restingHeartRate, 0)} sub="bpm" />
          <Num label="HRV" value={fn(slp?.selectedNightFeature?.rmssd, 1)} sub="RMSSD ms" />
          <Num label="Resp rate" value={fn(slp?.selectedNightFeature?.respiratoryRate, 1)} sub="breaths/min" />
        </div>
      </div>

      <div>
        <SectionHead>Hypnogram</SectionHead>
        <div className="mt-4">
          <Hypnogram epochs={epochs} />
        </div>
        <div className="flex gap-8 mt-5">
          {([['Awake', slp?.stageTotals?.awakeMinutes, STAGES.awake.color], ['REM', slp?.stageTotals?.remMinutes, STAGES.rem.color], ['Core', slp?.stageTotals?.lightMinutes, STAGES.core.color], ['Deep', slp?.stageTotals?.deepMinutes, STAGES.deep.color]] as const).map(([l, m, c]) => (
            <div key={l} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
              <span className="text-text-1 text-sm">{l}</span>
              <span className="text-base font-semibold">{m ?? 0}m</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <div>
          <SectionHead>Detection</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Night date" v={slp?.selectedDetection?.nightDate ?? '—'} />
            <Row k="Bedtime" v={fts(slp?.selectedDetection?.bedtime ?? null)} />
            <Row k="Wake" v={fts(slp?.selectedDetection?.wakeTime ?? null)} />
            <Row k="Interruptions" v={String(slp?.selectedDetection?.interruptionCount ?? '—')} />
            <Row k="Continuity" v={fn(slp?.selectedDetection?.continuity, 3)} />
            <Row k="Coverage" v={fn(slp?.selectedDetection?.validCoverage, 3)} />
            <Row k="Confidence" v={fn(slp?.selectedDetection?.confidence, 3)} />
          </div>
        </div>
        <div>
          <SectionHead>Night features</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="SDNN" v={fn(slp?.selectedNightFeature?.sdnn, 1)} />
            <Row k="Sleep est." v={`${fn(slp?.selectedNightFeature?.sleepEstimateHours, 2)}h`} />
            <Row k="Regularity" v={fn(slp?.selectedNightFeature?.regularity, 3)} />
            <Row k="Source" v={slp?.selectedNightFeature?.sourceBlend ?? '—'} />
            <Row k="Selection" v={slp?.selectionReason ?? '—'} />
            <Row k="Epochs" v={String(slp?.epochTimelineCount ?? 0)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Raw ─────────────────────────────────────────────────

function TabRaw({ raw, date }: { raw: RawRecords | null; date: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionHead>Raw sensor records</SectionHead>
        <span className="text-text-2 text-sm">{raw?.count ?? 0} rows · {date}</span>
      </div>
      <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: 'calc(100vh - 140px)' }}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-surface-1 z-10">
            <tr>{['Timestamp','HR','RR avg','Skin','Gravity','Resp','SpO2 R','SpO2 IR','Temp'].map(h =>
              <th key={h} className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border">{h}</th>
            )}</tr>
          </thead>
          <tbody>
            {raw?.rows.map(r => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-surface-1 transition-colors">
                <td className="px-4 py-2.5 text-text-1">{fts(r.timestamp)}</td>
                <td className="px-4 py-2.5">{fn(r.heartRate)}</td>
                <td className="px-4 py-2.5">{fn(r.rrAverageMs, 1)}</td>
                <td className="px-4 py-2.5">{r.skinContact == null ? '—' : r.skinContact ? 'Y' : 'N'}</td>
                <td className="px-4 py-2.5">{fn(r.gravityMagnitude, 3)}</td>
                <td className="px-4 py-2.5">{fn(r.respRateRaw, 2)}</td>
                <td className="px-4 py-2.5">{fn(r.spo2Red)}</td>
                <td className="px-4 py-2.5">{fn(r.spo2IR)}</td>
                <td className="px-4 py-2.5">{fn(r.skinTempRaw, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Pipeline ────────────────────────────────────────────

function TabPipeline({ p }: { p: PipelineResults | null }) {
  return (
    <div className="space-y-10">
      <div>
        <div className="grid grid-cols-4 gap-8">
          <Num label="Raw records" value={p?.rawRecordCount ?? 0} sub="total ingested" />
          <Num label="Detections" value={p?.results.sleepDetections.length ?? 0} sub="persisted" />
          <Num label="Stages" value={p?.results.sleepStages.length ?? 0} sub="persisted" />
          <Num label="Scores" value={p?.results.dailyScores.length ?? 0} sub="persisted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-16">
        <div>
          <SectionHead>Output</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Night features" v={String(p?.results.nightFeatures.length ?? 0)} />
            <Row k="Daily metrics" v={String(p?.results.dailyMetrics.length ?? 0)} />
            <Row k="Typical ranges" v={p?.results.typicalRanges ? 'Present' : 'Missing'} />
            <Row k="Baseline" v={p?.results.baselineProfile ? 'Present' : 'Missing'} />
            <Row k="Sleep plan" v={p?.results.sleepPlan ? 'Present' : 'Missing'} />
            <Row k="Journal corr." v={String(p?.results.journalCorrelations.length ?? 0)} />
          </div>
        </div>
        <div>
          <SectionHead>Time range</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Earliest" v={fts(p?.earliestRawTimestamp ?? null)} />
            <Row k="Latest" v={fts(p?.latestRawTimestamp ?? null)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Telemetry ───────────────────────────────────────────

function TabTelemetry({ t, live, toggle }: { t: Telemetry | null; live: boolean; toggle: () => void }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={toggle}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
            ${live ? 'bg-green-soft text-green' : 'text-text-1 border border-border hover:border-border-strong'}`}>
          {live ? 'Live · 5s' : 'Auto-refresh off'}
        </button>
        {live && <span className="inline-block w-2 h-2 rounded-full bg-green" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Num label="Device events" value={t?.events.totalCount ?? 0} sub={`${Object.keys(t?.events.summary ?? {}).length} event types`} />
        <Num label="Realtime samples" value={t?.realtime.totalCount ?? 0} sub={`${Object.keys(t?.realtime.sessions ?? {}).length} sessions`} />
      </div>

      {t && Object.keys(t.events.summary).length > 0 && (
        <div>
          <SectionHead>Event breakdown</SectionHead>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
            {Object.entries(t.events.summary).map(([name, count]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-text-1">{name}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-10">
        <div>
          <SectionHead>Recent events</SectionHead>
          <div className="mt-3 overflow-auto rounded-xl border border-border max-h-96">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>{['Event','Device','Captured','Received'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border">{h}</th>
                )}</tr>
              </thead>
              <tbody>
                {t?.events.recent.slice(0, 40).map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{e.eventName}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">{e.deviceId.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-text-1">{ftime(e.capturedAt)}</td>
                    <td className="px-4 py-2.5 text-text-1">{ftime(e.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <SectionHead>Recent samples</SectionHead>
          <div className="mt-3 overflow-auto rounded-xl border border-border max-h-96">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>{['Type','HR','Session','Captured'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border">{h}</th>
                )}</tr>
              </thead>
              <tbody>
                {t?.realtime.recent.slice(0, 40).map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{s.dataType}</td>
                    <td className="px-4 py-2.5">{s.heartRate ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">{s.sessionId.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-text-1">{ftime(s.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Console Logs */}
      {t?.consoleLogs && (
        <>
          <div className="grid grid-cols-2 gap-8 mt-2">
            <Num label="Console logs" value={t.consoleLogs.totalCount} sub="firmware output lines" />
          </div>

          {t.consoleLogs.deviceInfo && Object.keys(t.consoleLogs.deviceInfo).length > 0 && (
            <div>
              <SectionHead>Device info (from logs)</SectionHead>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                {Object.entries(t.consoleLogs.deviceInfo).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <span className="text-text-2 text-xs">{k}</span>
                    <span className="text-sm font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionHead>Recent console logs</SectionHead>
            <div className="mt-3 overflow-auto rounded-xl border border-border max-h-[32rem]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-surface-1 z-10">
                  <tr>{['Level','Message','Time'].map(h =>
                    <th key={h} className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border">{h}</th>
                  )}</tr>
                </thead>
                <tbody>
                  {t.consoleLogs.recent.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                      <td className="px-4 py-2 w-16">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          l.logLevel === 'error' ? 'bg-red-soft text-red' :
                          l.logLevel === 'warn' ? 'bg-yellow-soft text-yellow' :
                          'text-text-2'
                        }`}>{l.logLevel ?? 'info'}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-pre-wrap break-all">{l.message}</td>
                      <td className="px-4 py-2 text-text-1 text-xs whitespace-nowrap">{ftime(l.capturedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Hypnogram (1:1 port of react-native-sleep-stages) ────────

function Hypnogram({ epochs }: { epochs: Array<{ timestamp: string; stage: string }> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(0)
  const [cur, setCur] = useState<{ x: number; seg: Seg; dur: number; from: string; to: string } | null>(null)
  const segments = useMemo(() => mkSegs(epochs), [epochs])
  const total = epochs.length

  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width)); ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onMM = useCallback((e: RME) => {
    if (!cw || !segments.length) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - r.left, cw))
    const min = lerp(x, 0, cw, 0, total)
    const seg = segments.find(s => min >= s.fromMin && min < s.toMin) ?? (min <= segments[0].fromMin ? segments[0] : segments[segments.length - 1])
    const dur = seg.toMin - seg.fromMin
    setCur({ x, seg, dur, from: epochs[seg.fromMin] ? ftime(epochs[seg.fromMin].timestamp) : '', to: epochs[Math.min(seg.toMin, epochs.length - 1)] ? ftime(epochs[Math.min(seg.toMin, epochs.length - 1)].timestamp) : '' })
  }, [cw, segments, total, epochs])

  if (!segments.length) return <p className="text-text-2 py-10 text-center">No epoch timeline available.</p>

  const firstH = epochs[0] ? new Date(epochs[0].timestamp).getHours() : 0
  const lastH = epochs[epochs.length - 1] ? new Date(epochs[epochs.length - 1].timestamp).getHours() + 1 : 8
  const hc = lastH > firstH ? lastH - firstH : 24 - firstH + lastH
  const hours = Array.from({ length: hc }, (_, i) => (firstH + i) % 24)

  return (
    <div>
      <div ref={ref} className="relative select-none" style={{ height: CH, borderLeft: '1px solid rgba(255,255,255,0.12)', borderRight: '1px solid rgba(255,255,255,0.12)' }}
        onMouseMove={onMM} onMouseLeave={() => setCur(null)}>
        {cw > 0 && (<>
          {/* Axis rows */}
          {SK.map((key, i) => (
            <div key={key} className="absolute left-0 right-0" style={{ top: i * RH, height: RH }}>
              {i > 0 && <div className="absolute top-0 left-0 right-0" style={{ height: 0.5, background: 'rgba(255,255,255,0.08)' }} />}
              <span className="absolute text-text-2 pointer-events-none" style={{ fontSize: 11, left: 5, top: 5 }}>{STAGES[key].label}</span>
            </div>
          ))}

          {/* Dashed hour columns */}
          {hours.map((_, i) => {
            const colW = cw / hours.length
            return i < hours.length - 1 ? (
              <div key={`dh${i}`} className="absolute top-0" style={{ left: colW * (i + 1), width: 0.5, height: CH }}>
                {Array.from({ length: Math.floor(CH / (DSH * 2)) }).map((_, di) => (
                  <div key={di} style={{ width: 1, height: DSH, marginTop: DSH, background: 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            ) : null
          })}

          {/* SVG gradient underlay masked by bubbles + connectors */}
          <svg className="absolute top-0 left-0 pointer-events-none" width={cw} height={CH} style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="hg" x1="0" y1="0.2" x2="0" y2="0.95">
                {SK.map(k => <stop key={k} offset={STAGES[k].pos / 4} stopColor={STAGES[k].color} stopOpacity={0.3} />)}
              </linearGradient>
              <mask id="hm">
                {/* Bubbles */}
                {segments.map(s => {
                  const t = STAGES[s.type].pos * RH + BO
                  const l = lerp(s.fromMin, 0, total, 0, cw) - BW
                  const w = lerp(s.toMin - s.fromMin, 0, total, 0, cw) + BW
                  return <rect key={`b${s.id}`} x={l} y={t} width={Math.max(w, 4)} height={BH} rx={8} fill="white" />
                })}
                {/* Left connectors */}
                {segments.map((s, i) => {
                  if (i === 0) return null; const p = segments[i - 1]; if (p.type === s.type) return null
                  const to = STAGES[s.type].pos * RH + BO; const lo = lerp(s.fromMin, 0, total, 0, cw) - BW
                  const lh = (RH - BH) * Math.abs(STAGES[s.type].pos - STAGES[p.type].pos)
                  const y = STAGES[p.type].pos > STAGES[s.type].pos ? to + BH / 2 : to - lh + BH / 2
                  return <rect key={`lc${s.id}`} x={lo} y={y} width={BW} height={lh} fill="white" />
                })}
                {/* Right connectors */}
                {segments.map((s, i) => {
                  if (i === segments.length - 1) return null; const n = segments[i + 1]; if (n.type === s.type) return null
                  const to = STAGES[s.type].pos * RH + BO; const lo = lerp(s.fromMin, 0, total, 0, cw) - BW
                  const bw = lerp(s.toMin - s.fromMin, 0, total, 0, cw) + BW
                  const rh = (RH - BH) * Math.abs(STAGES[s.type].pos - STAGES[n.type].pos)
                  const y = STAGES[n.type].pos > STAGES[s.type].pos ? to + BH / 2 : to - rh + BH / 2
                  return <rect key={`rc${s.id}`} x={lo + bw - BW} y={y} width={BW} height={rh} fill="white" />
                })}
                {/* Corner SVGs */}
                {segments.map((s, i) => {
                  const parts: ReactNode[] = []
                  const to = STAGES[s.type].pos * RH + BO
                  const lo = lerp(s.fromMin, 0, total, 0, cw) - BW
                  const bw = lerp(s.toMin - s.fromMin, 0, total, 0, cw) + BW
                  if (i > 0 && segments[i - 1].type !== s.type && bw > 8) {
                    const pa = STAGES[segments[i - 1].type].pos > STAGES[s.type].pos
                    parts.push(<g key={`cl${s.id}`} transform={`translate(${lo + 1.3}, ${to - 7.2 + (pa ? BH - 1 : 1)}) rotate(180, 3, 7.5)`}><path d={CT} fill="white" /><path d={CB} fill="white" /></g>)
                  }
                  if (i < segments.length - 1 && segments[i + 1].type !== s.type && bw > 8) {
                    const na = STAGES[segments[i + 1].type].pos > STAGES[s.type].pos
                    parts.push(<g key={`cr${s.id}`} transform={`translate(${lo + bw - 7.3}, ${to - 7.2 + (na ? BH - 1 : 1)})`}><path d={CT} fill="white" /><path d={CB} fill="white" /></g>)
                  }
                  return parts
                })}
              </mask>
            </defs>
            <rect x={0} y={0} width={cw} height={CH} fill="url(#hg)" mask="url(#hm)" />
          </svg>

          {/* Foreground solid bars */}
          {segments.map(s => {
            const top = STAGES[s.type].pos * RH + BO + BW
            const left = lerp(s.fromMin, 0, total, 0, cw)
            const w = lerp(s.toMin - s.fromMin, 0, total, 0, cw) - BW
            return (
              <div key={`bar${s.id}`} className="absolute" style={{ top, left, width: Math.max(w, 1) }}>
                <div style={{ height: BH - BW * 2, borderRadius: 6, backgroundColor: STAGES[s.type].color, minWidth: 1 }} />
              </div>
            )
          })}

          {/* Cursor */}
          {cur && (<>
            <div className="absolute top-0 pointer-events-none" style={{ left: cur.x, width: 2.5, height: CH, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
            <div className="absolute pointer-events-none bg-surface-2 rounded-xl px-3 py-2.5 border border-border-strong shadow-lg"
              style={{ left: Math.max(0, Math.min(cur.x - 70, cw - 150)), top: 8 }}>
              <p className="text-text-1 text-xs uppercase tracking-wider">{cur.seg.type === 'awake' ? 'Awake' : `${STAGES[cur.seg.type].label} sleep`}</p>
              <p><span className="text-xl font-semibold">{cur.dur}</span><span className="text-text-2 text-xs"> min</span></p>
              <p className="text-text-2 text-xs">{cur.from} – {cur.to}</p>
            </div>
          </>)}
        </>)}
      </div>
      {/* Hour labels */}
      <div className="flex justify-between mt-2 px-0.5">
        {hours.map((h, i) => <span key={i} className="text-text-2 text-xs">{String(h).padStart(2, '0')}:00</span>)}
      </div>
    </div>
  )
}

// ── Primitives ───────────────────────────────────────────────

function Num({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div>
      <p className="text-text-2 text-sm">{label}</p>
      <p className="text-3xl font-semibold tracking-tight mt-1">{value}</p>
      <p className="text-text-2 text-sm mt-0.5">{sub}</p>
    </div>
  )
}

function SectionHead({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold text-text-2 uppercase tracking-widest">{children}</h3>
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-border/60">
      <span className="text-text-2">{k}</span>
      <span className="text-right max-w-[55%] truncate">{v}</span>
    </div>
  )
}
