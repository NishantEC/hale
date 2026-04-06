import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3009'
const TOKEN_KEY = 'noop.inspector.token'
const EMAIL_KEY = 'noop.inspector.email'

type DebugOverview = {
  selectedDate: string
  selectedDateTitle: string
  selectedDateSubtitle: string
  selectedNightDate: string | null
  selectionMode: string
  selectionReason: string
  counts: {
    rawRecordCount: number
    sleepDetectionCount: number
    sleepStageCount: number
    dailyScoreCount: number
    dailyMetricCount: number
    selectedDayRawRecordCount: number
  }
  earliestRawTimestamp: string | null
  latestRawTimestamp: string | null
  latestSyncMetadata: {
    lastRawRecordAt: string | null
    lastSleepPlanUpdateAt: string | null
    plannerConfigured: boolean
  }
  selectedEntities: {
    detectionId: string | null
    stageId: string | null
    featureId: string | null
    epochTimelineCount: number
  }
  lastPipelineRunStatus: string
  viewSummary: {
    home: {
      title: string
      headline: string
      recommendation: string
    }
    sleep: {
      title: string
      isEmpty: boolean
      bedtime: string
      wakeTime: string
    }
  }
}

type DebugRawRecords = {
  selectedDate: string
  count: number
  rows: Array<{
    id: string
    timestamp: string
    heartRate: number
    rrAverageMs: number | null
    skinContact: boolean | null
    gravityMagnitude: number | null
    gravityX: number | null
    gravityY: number | null
    gravityZ: number | null
    respRateRaw: number | null
    spo2Red: number | null
    spo2IR: number | null
    skinTempRaw: number | null
  }>
}

type DebugSleepNight = {
  selectedDate: string
  selectedNightDate: string | null
  selectionMode: string
  selectionReason: string
  selectedDetection: {
    id: string
    nightDate: string
    bedtime: string | null
    wakeTime: string | null
    durationHours: number
    interruptionCount: number
    continuity: number
    regularity: number
    validCoverage: number
    confidence: number
  } | null
  selectedStage: {
    id: string
    nightDate: string
    remMinutes: number
    coreMinutes: number
    deepMinutes: number
    awakeMinutes: number
    unknownMinutes: number
    confidence: number
    source: string
    epochMinutes: number
  } | null
  selectedNightFeature: {
    id: string
    nightDate: string
    restingHeartRate: number
    rmssd: number
    sdnn: number
    respiratoryRate: number
    continuity: number
    regularity: number
    validCoverage: number
    confidenceRaw: number
    sleepEstimateHours: number
    sourceBlend: string
  } | null
  stageTotals: {
    remMinutes: number
    lightMinutes: number
    deepMinutes: number
    awakeMinutes: number
    unknownMinutes: number
  } | null
  epochTimelineCount: number
  epochTimeline: Array<{ timestamp: string; stage: string }>
}

type DebugPipelineResults = {
  rawRecordCount: number
  earliestRawTimestamp: string | null
  latestRawTimestamp: string | null
  results: {
    nightFeatures: unknown[]
    sleepDetections: unknown[]
    sleepStages: unknown[]
    dailyScores: unknown[]
    dailyMetrics: unknown[]
    baselineProfile: unknown | null
    sleepPlan: unknown | null
    typicalRanges: unknown | null
    journalCorrelations: unknown[]
  }
}

type RecomputeViewsResponse = {
  selectedDate: string
  homeView: {
    selectedDateTitle: string
    selectedDateSubtitle: string
    todayOverview: { headline: string; detail: string }
    cards: { recommendation: { title: string; subtitle: string } }
  }
  sleepView: {
    selectedDateTitle: string
    selectedDateSubtitle: string
    emptyState: { isEmpty: boolean; title: string; subtitle: string }
    header: { bedtime: string; wakeTime: string; duration: string }
    sleepInsight: string | null
  }
  overview: DebugOverview
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    if (text.trim().startsWith('<')) {
      throw new Error(`Server returned HTML (${response.status}). Check VITE_API_BASE_URL.`)
    }
    throw new Error(text || `Request failed: ${response.status}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Server returned malformed JSON.')
  }
}

async function loginWithPassword(email: string, password: string) {
  const signIn = await fetch(`${API_BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ email, password }),
  })

  if (signIn.ok) {
    const data = await parseJsonResponse<{ token?: string }>(signIn)
    if (!data.token) throw new Error('Sign-in succeeded but no token was returned.')
    return data.token
  }

  const signUp = await fetch(`${API_BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ email, password, name: email }),
  })

  if (!signUp.ok) {
    throw new Error('Invalid email/password or account creation failed.')
  }

  const data = await parseJsonResponse<{ token?: string }>(signUp)
  if (!data.token) throw new Error('Sign-up succeeded but no token was returned.')
  return data.token
}

async function apiGet<T>(path: string, token: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
    },
  })
  return parseJsonResponse<T>(response)
}

async function apiPost<T>(path: string, token: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
    },
  })
  return parseJsonResponse<T>(response)
}

function formatTimestamp(value: string | null) {
  if (!value) return '--'
  return new Date(value).toLocaleString()
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '--'
  return value.toFixed(digits)
}

function stageColor(stage: string) {
  switch (stage.toLowerCase()) {
    case 'awake':
      return '#8c919f'
    case 'rem':
      return '#b35cff'
    case 'deep':
    case 'sws':
      return '#ff5f87'
    default:
      return '#7d8cff'
  }
}

function App() {
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [overview, setOverview] = useState<DebugOverview | null>(null)
  const [rawRecords, setRawRecords] = useState<DebugRawRecords | null>(null)
  const [sleepNight, setSleepNight] = useState<DebugSleepNight | null>(null)
  const [pipelineResults, setPipelineResults] = useState<DebugPipelineResults | null>(null)
  const [views, setViews] = useState<RecomputeViewsResponse | null>(null)

  const isAuthed = token.length > 0

  const refreshAll = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    setError(null)

    try {
      const [nextOverview, nextRawRecords, nextSleepNight, nextPipelineResults, nextViews] =
        await Promise.all([
          apiGet<DebugOverview>(`/debug/overview?date=${encodeURIComponent(selectedDate)}`, token),
          apiGet<DebugRawRecords>(
            `/debug/raw-records?date=${encodeURIComponent(selectedDate)}&limit=120`,
            token,
          ),
          apiGet<DebugSleepNight>(`/debug/sleep-night?date=${encodeURIComponent(selectedDate)}`, token),
          apiGet<DebugPipelineResults>('/debug/pipeline-results', token),
          apiPost<RecomputeViewsResponse>(
            `/debug/views/recompute?date=${encodeURIComponent(selectedDate)}`,
            token,
          ),
        ])

      setOverview(nextOverview)
      setRawRecords(nextRawRecords)
      setSleepNight(nextSleepNight)
      setPipelineResults(nextPipelineResults)
      setViews(nextViews)
      setBanner(`Refreshed ${new Date().toLocaleTimeString()}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load inspector data.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate, token])

  useEffect(() => {
    if (token) {
      void refreshAll()
    }
  }, [refreshAll, token])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setBanner(null)

    try {
      const nextToken = await loginWithPassword(email, password)
      localStorage.setItem(TOKEN_KEY, nextToken)
      localStorage.setItem(EMAIL_KEY, email)
      setToken(nextToken)
      setPassword('')
      setBanner('Authenticated.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Authentication failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setOverview(null)
    setRawRecords(null)
    setSleepNight(null)
    setPipelineResults(null)
    setViews(null)
    setBanner('Logged out.')
  }

  const rerunPipeline = async () => {
    if (!token) return
    setIsLoading(true)
    setError(null)

    try {
      const result = await apiPost<{ runResult: { ok: boolean; computed: Record<string, number> } }>(
        `/debug/pipeline/run?date=${encodeURIComponent(selectedDate)}`,
        token,
      )
      setBanner(
        `Pipeline reran. Detections ${result.runResult.computed.sleepDetections ?? 0}, stages ${result.runResult.computed.sleepStages ?? 0}.`,
      )
      await refreshAll()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Pipeline rerun failed.')
      setIsLoading(false)
    }
  }

  const hypnogram = useMemo(() => sleepNight?.epochTimeline ?? [], [sleepNight?.epochTimeline])

  if (!isAuthed) {
    return (
      <div className="page login-shell">
        <div className="login-card">
          <p className="eyebrow">Internal tool</p>
          <h1>Noop Sync Inspector</h1>
          <p className="muted">
            Sign in with the same backend account the mobile app uses. Debug routes must be
            enabled with <code>DEBUG_INSPECTOR_ENABLED=true</code>.
          </p>
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {error ? <p className="banner error">{error}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal tool</p>
          <h1>Noop Sync Inspector</h1>
          <p className="muted">{API_BASE_URL}</p>
        </div>

        <div className="toolbar">
          <label className="date-picker">
            <span>Date</span>
            <input
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
            />
          </label>
          <button onClick={() => void refreshAll()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={() => void rerunPipeline()} disabled={isLoading}>
            Run pipeline
          </button>
          <button className="ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {banner ? <div className="banner success">{banner}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <section className="metrics-grid">
        <MetricCard label="Raw rows" value={overview?.counts.rawRecordCount ?? 0} detail={`Selected day ${overview?.counts.selectedDayRawRecordCount ?? 0}`} />
        <MetricCard label="Detections" value={overview?.counts.sleepDetectionCount ?? 0} detail={overview?.selectionMode ?? '--'} />
        <MetricCard label="Stages" value={overview?.counts.sleepStageCount ?? 0} detail={`Epochs ${overview?.selectedEntities.epochTimelineCount ?? 0}`} />
        <MetricCard label="Scores" value={overview?.counts.dailyScoreCount ?? 0} detail={overview?.lastPipelineRunStatus ?? '--'} />
      </section>

      <section className="panel-grid">
        <Panel title="Overview" subtitle={overview ? `${overview.selectedDateTitle} · ${overview.selectedDateSubtitle}` : undefined}>
          <dl className="definition-list">
            <div><dt>Selection</dt><dd>{overview?.selectionMode ?? '--'}</dd></div>
            <div><dt>Selected night</dt><dd>{overview?.selectedNightDate ?? '--'}</dd></div>
            <div><dt>Earliest raw</dt><dd>{formatTimestamp(overview?.earliestRawTimestamp ?? null)}</dd></div>
            <div><dt>Latest raw</dt><dd>{formatTimestamp(overview?.latestRawTimestamp ?? null)}</dd></div>
            <div><dt>Plan updated</dt><dd>{formatTimestamp(overview?.latestSyncMetadata.lastSleepPlanUpdateAt ?? null)}</dd></div>
            <div><dt>Reason</dt><dd>{overview?.selectionReason ?? '--'}</dd></div>
          </dl>
        </Panel>

        <Panel title="Current views" subtitle="What Home and Sleep are actually selecting">
          <dl className="definition-list">
            <div><dt>Home title</dt><dd>{views?.homeView.selectedDateTitle ?? '--'}</dd></div>
            <div><dt>Home headline</dt><dd>{views?.homeView.todayOverview.headline ?? '--'}</dd></div>
            <div><dt>Recommendation</dt><dd>{views?.homeView.cards.recommendation.title ?? '--'}</dd></div>
            <div><dt>Sleep empty</dt><dd>{views?.sleepView.emptyState.isEmpty ? 'Yes' : 'No'}</dd></div>
            <div><dt>Bed / wake</dt><dd>{views ? `${views.sleepView.header.bedtime} → ${views.sleepView.header.wakeTime}` : '--'}</dd></div>
            <div><dt>Insight</dt><dd>{views?.sleepView.sleepInsight ?? '--'}</dd></div>
          </dl>
        </Panel>
      </section>

      <section className="panel-grid">
        <Panel title="Sleep night" subtitle={sleepNight?.selectionReason}>
          <div className="stack">
            <div className="triplet">
              <ValueBlock label="Duration" value={formatNumber(sleepNight?.selectedDetection?.durationHours, 2)} suffix=" h" />
              <ValueBlock label="RHR" value={formatNumber(sleepNight?.selectedNightFeature?.restingHeartRate, 0)} />
              <ValueBlock label="Epochs" value={sleepNight?.epochTimelineCount ?? 0} />
            </div>
            <div className="stage-total-grid">
              <StagePill label="Awake" value={sleepNight?.stageTotals?.awakeMinutes ?? 0} color="#8c919f" />
              <StagePill label="Light" value={sleepNight?.stageTotals?.lightMinutes ?? 0} color="#7d8cff" />
              <StagePill label="Deep" value={sleepNight?.stageTotals?.deepMinutes ?? 0} color="#ff5f87" />
              <StagePill label="REM" value={sleepNight?.stageTotals?.remMinutes ?? 0} color="#b35cff" />
            </div>
            <div className="hypnogram">
              {hypnogram.length === 0 ? (
                <p className="muted">No epoch timeline available.</p>
              ) : (
                hypnogram.map((epoch, index) => (
                  <div
                    key={`${epoch.timestamp}-${index}`}
                    className="hypnogram-segment"
                    style={{ backgroundColor: stageColor(epoch.stage) }}
                    title={`${epoch.stage} · ${formatTimestamp(epoch.timestamp)}`}
                  />
                ))
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Pipeline results"
          subtitle={`Night features ${pipelineResults?.results.nightFeatures.length ?? 0} · Metrics ${pipelineResults?.results.dailyMetrics.length ?? 0}`}
        >
          <dl className="definition-list">
            <div><dt>Raw count</dt><dd>{pipelineResults?.rawRecordCount ?? 0}</dd></div>
            <div><dt>Detections persisted</dt><dd>{pipelineResults?.results.sleepDetections.length ?? 0}</dd></div>
            <div><dt>Stages persisted</dt><dd>{pipelineResults?.results.sleepStages.length ?? 0}</dd></div>
            <div><dt>Scores persisted</dt><dd>{pipelineResults?.results.dailyScores.length ?? 0}</dd></div>
            <div><dt>Typical ranges</dt><dd>{pipelineResults?.results.typicalRanges ? 'Present' : 'Missing'}</dd></div>
            <div><dt>Journal correlations</dt><dd>{pipelineResults?.results.journalCorrelations.length ?? 0}</dd></div>
          </dl>
        </Panel>
      </section>

      <Panel title="Raw records" subtitle={`${rawRecords?.count ?? 0} rows for ${selectedDate}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>HR</th>
                <th>RR avg</th>
                <th>Skin</th>
                <th>Gravity</th>
                <th>Resp raw</th>
              </tr>
            </thead>
            <tbody>
              {rawRecords?.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatTimestamp(row.timestamp)}</td>
                  <td>{formatNumber(row.heartRate, 0)}</td>
                  <td>{formatNumber(row.rrAverageMs, 1)}</td>
                  <td>{row.skinContact == null ? '--' : row.skinContact ? 'Yes' : 'No'}</td>
                  <td>{formatNumber(row.gravityMagnitude, 3)}</td>
                  <td>{formatNumber(row.respRateRaw, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function MetricCard(props: { label: string; value: number; detail: string }) {
  return (
    <article className="metric-card">
      <p>{props.label}</p>
      <strong>{props.value}</strong>
      <span>{props.detail}</span>
    </article>
  )
}

function Panel(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{props.title}</h2>
          {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
        </div>
      </div>
      {props.children}
    </section>
  )
}

function ValueBlock(props: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="value-block">
      <span>{props.label}</span>
      <strong>
        {props.value}
        {props.suffix ?? ''}
      </strong>
    </div>
  )
}

function StagePill(props: { label: string; value: number; color: string }) {
  return (
    <div className="stage-pill">
      <span className="stage-dot" style={{ backgroundColor: props.color }} />
      <span>{props.label}</span>
      <strong>{props.value}m</strong>
    </div>
  )
}

export default App
