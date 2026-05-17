import { useEffect, useMemo, useRef, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { BatteryHistory, Telemetry } from "../api"
import { Num, Pill, SectionHead } from "../components/primitives"
import { formatTime } from "../format"

type LogLevel = "error" | "warn" | "info" | "debug"
const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"]

function normaliseLevel(raw: string | null): LogLevel {
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") return raw
  return "info"
}

export function TelemetryTab({
  telemetry,
  batteryHistory,
  live,
}: {
  telemetry: Telemetry | null
  batteryHistory: BatteryHistory | null
  live: boolean
  toggleLive: () => void
}) {
  const [tabHidden, setTabHidden] = useState(false)
  const hiddenSinceRef = useRef<number | null>(null)
  const [pausedMs, setPausedMs] = useState<number | null>(null)

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now()
        setTabHidden(true)
      } else {
        const since = hiddenSinceRef.current
        if (since !== null) {
          setPausedMs(Date.now() - since)
        }
        hiddenSinceRef.current = null
        setTabHidden(false)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  useEffect(() => {
    if (pausedMs === null) return
    const id = setTimeout(() => setPausedMs(null), 4_000)
    return () => clearTimeout(id)
  }, [pausedMs])

  const [logSearch, setLogSearch] = useState("")
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS))

  function toggleLevel(level: LogLevel) {
    setEnabledLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        if (next.size === 1) return prev
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  const filteredLogs = useMemo(() => {
    const logs = telemetry?.consoleLogs?.recent ?? []
    const needle = logSearch.trim().toLowerCase()
    return logs.filter((l) => {
      const level = normaliseLevel(l.logLevel)
      if (!enabledLevels.has(level)) return false
      if (needle && !l.message.toLowerCase().includes(needle)) return false
      return true
    })
  }, [telemetry?.consoleLogs?.recent, logSearch, enabledLevels])

  return (
    <div className="space-y-8">
      {tabHidden && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text-2">
          <span className="w-2 h-2 rounded-full bg-text-2 shrink-0" />
          Polling paused while tab is hidden — data will refresh when you return
        </div>
      )}
      {!tabHidden && pausedMs !== null && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-1 border border-border text-sm text-text-2">
          <span className="w-2 h-2 rounded-full bg-green shrink-0" />
          Resumed — refreshing after {Math.round(pausedMs / 1000)}s pause
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border">
          <span
            className={`w-1.5 h-1.5 rounded-full ${live ? "bg-green animate-pulse" : "bg-text-2"}`}
          />
          <span className="text-xs font-medium text-text-1">
            {live ? "Live tail active — polling every 5s via TopBar" : "Live tail off — toggle in TopBar"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Num
          label="Device events"
          value={telemetry?.events.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.events.summary ?? {}).length} distinct event types received from strap`}
        />
        <Num
          label="BLE realtime samples"
          value={telemetry?.realtime.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.realtime.sessions ?? {}).length} streaming sessions — heart rate, accel, etc.`}
        />
      </div>

      <BatterySection
        history={batteryHistory}
        fgSocTenths={
          typeof telemetry?.consoleLogs?.deviceInfo?.batterySocTenths === "number"
            ? (telemetry.consoleLogs.deviceInfo.batterySocTenths as number)
            : null
        }
      />

      {telemetry && Object.keys(telemetry.events.summary).length > 0 && (
        <EventBreakdown summary={telemetry.events.summary} />
      )}

      <div className="grid grid-cols-2 gap-10">
        <div>
          <SectionHead>Recent device events</SectionHead>
          <p className="text-text-2 text-xs mt-1 mb-3">
            Named BLE events emitted by the strap firmware (e.g. BatteryLevel, StepCount)
          </p>
          <div className="overflow-auto rounded-xl border border-border max-h-96">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>
                  {["Event", "Device", "Captured", "Received"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(telemetry?.events.recent ?? []).slice(0, 40).map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{e.eventName}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">
                      {e.deviceId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.capturedAt)}</td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.receivedAt)}</td>
                  </tr>
                ))}
                {(telemetry?.events.recent ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-text-2 text-sm text-center">
                      No events yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionHead>BLE streaming sessions</SectionHead>
          <p className="text-text-2 text-xs mt-1 mb-3">
            Continuous real-time data streams grouped by session (each session = one app connection window)
          </p>
          <RealtimeSessions sessions={telemetry?.realtime.sessions ?? {}} recent={telemetry?.realtime.recent ?? []} />
        </div>
      </div>

      {telemetry?.consoleLogs && (
        <>
          <div className="grid grid-cols-2 gap-8 mt-2">
            <Num
              label="Console log lines"
              value={telemetry.consoleLogs.totalCount}
              sub="firmware stdout captured over BLE — includes boot messages, sensor init, errors"
            />
          </div>

          {telemetry.consoleLogs.deviceInfo &&
            Object.keys(telemetry.consoleLogs.deviceInfo).length > 0 && (
              <div>
                <SectionHead>Device info (parsed from logs)</SectionHead>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                  {Object.entries(telemetry.consoleLogs.deviceInfo).map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <span className="text-text-2 text-xs">{k}</span>
                      <span className="text-sm font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div>
                <SectionHead>Console logs</SectionHead>
                <p className="text-text-2 text-xs mt-1">
                  Raw firmware output lines — filter by level or search message text
                </p>
              </div>
              <span className="text-text-2 text-xs tabular-nums">
                {filteredLogs.length} / {telemetry.consoleLogs.recent.length} shown
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter by message..."
                className="flex-1 min-w-[200px] bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-border-strong placeholder:text-text-2"
              />
              <div className="flex items-center gap-1.5">
                {ALL_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      enabledLevels.has(level)
                        ? level === "error"
                          ? "bg-red-soft text-red"
                          : level === "warn"
                          ? "bg-yellow-soft text-yellow"
                          : "bg-surface-2 text-text-0 border border-border-strong"
                        : "text-text-2 border border-border opacity-40"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-border max-h-[32rem]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-surface-1 z-10">
                  <tr>
                    {["Level", "Message", "Time"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                      <td className="px-4 py-2 w-16">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            normaliseLevel(l.logLevel) === "error"
                              ? "bg-red-soft text-red"
                              : normaliseLevel(l.logLevel) === "warn"
                              ? "bg-yellow-soft text-yellow"
                              : "text-text-2"
                          }`}
                        >
                          {l.logLevel ?? "info"}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-pre-wrap break-all">
                        {l.message}
                      </td>
                      <td className="px-4 py-2 text-text-1 text-xs whitespace-nowrap">
                        {formatTime(l.capturedAt)}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-text-2 text-sm text-center">
                        No logs match the current filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function RealtimeSessions({
  sessions,
  recent,
}: {
  sessions: Record<string, { dataType: string; count: number; earliest: string; latest: string }>
  recent: Array<{ dataType: string; heartRate: number | null; sessionId: string; capturedAt: string }>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sessionEntries = useMemo(() => {
    return Object.entries(sessions).sort(
      (a, b) => new Date(b[1].latest).getTime() - new Date(a[1].latest).getTime(),
    )
  }, [sessions])

  const recentBySession = useMemo(() => {
    const map = new Map<string, typeof recent>()
    for (const row of recent) {
      const arr = map.get(row.sessionId) ?? []
      arr.push(row)
      map.set(row.sessionId, arr)
    }
    return map
  }, [recent])

  function toggleSession(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (sessionEntries.length === 0) {
    return (
      <div className="rounded-xl border border-border px-4 py-6 text-text-2 text-sm text-center">
        No streaming sessions recorded yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessionEntries.map(([sessionId, meta]) => {
        const isOpen = expanded.has(sessionId)
        const elapsedMs =
          new Date(meta.latest).getTime() - new Date(meta.earliest).getTime()
        const elapsedSec = Math.round(elapsedMs / 1000)
        const elapsedLabel =
          elapsedSec < 60
            ? `${elapsedSec}s`
            : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
        const sessionRecent = recentBySession.get(sessionId) ?? []

        return (
          <div
            key={sessionId}
            className="rounded-xl border border-border overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleSession(sessionId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-surface-1 hover:bg-surface-2 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOpen ? "bg-green" : "bg-text-2"}`}
                />
                <span className="font-mono text-xs text-text-1 truncate">
                  {sessionId.slice(0, 12)}
                </span>
                <span className="text-xs text-text-2 shrink-0">{meta.dataType}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                <span className="text-xs text-text-2 tabular-nums">{meta.count} samples</span>
                <span className="text-xs text-text-2 tabular-nums">{elapsedLabel}</span>
                <span className="text-xs text-text-2">{formatTime(meta.latest)}</span>
                <span className="text-text-2 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border">
                <div className="px-4 py-2 flex gap-6 text-xs text-text-2 bg-surface/50">
                  <span>Start: {formatTime(meta.earliest)}</span>
                  <span>Latest: {formatTime(meta.latest)}</span>
                  <span>Elapsed: {elapsedLabel}</span>
                  <span>{meta.count} total samples</span>
                </div>
                {sessionRecent.length > 0 ? (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        {["Type", "HR", "Captured"].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border bg-surface-1"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sessionRecent.slice(0, 20).map((s, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                          <td className="px-4 py-2">{s.dataType}</td>
                          <td className="px-4 py-2">{s.heartRate ?? "—"}</td>
                          <td className="px-4 py-2 text-text-1">{formatTime(s.capturedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-4 py-3 text-text-2 text-xs">
                    No recent samples buffered for this session
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EventBreakdown({ summary }: { summary: Record<string, number> }) {
  const entries = Object.entries(summary)
  const knownEntries: Array<[string, number]> = []
  const unknownEntries: Array<[string, number]> = []
  for (const [name, count] of entries) {
    if (name.startsWith("unknown_")) unknownEntries.push([name, count])
    else knownEntries.push([name, count])
  }
  knownEntries.sort((a, b) => b[1] - a[1])
  unknownEntries.sort((a, b) => b[1] - a[1])

  const unknownTotal = unknownEntries.reduce((acc, [, c]) => acc + c, 0)

  return (
    <div className="space-y-5">
      <div>
        <SectionHead>Event type breakdown</SectionHead>
        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
          {knownEntries.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-text-1">{name}</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {unknownEntries.length > 0 ? (
        <div className="bg-yellow-soft/40 border border-yellow/30 rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <SectionHead>Unknown event numbers</SectionHead>
              <Pill tone="yellow">needs RE</Pill>
            </div>
            <p className="text-text-2 text-xs">
              {unknownTotal} sample{unknownTotal === 1 ? "" : "s"} across{" "}
              {unknownEntries.length} event number{unknownEntries.length === 1 ? "" : "s"} — payloads
              captured, protocol not yet reverse-engineered
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 mt-3">
            {unknownEntries.map(([name, count]) => {
              const numStr = name.slice("unknown_".length)
              const num = parseInt(numStr, 10)
              return (
                <div key={name} className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm">
                      evt {Number.isFinite(num) ? num : numStr}
                    </span>
                    {Number.isFinite(num) ? (
                      <span className="text-text-2 text-xs">
                        0x{num.toString(16).padStart(2, "0")}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              )
            })}
          </div>

          <p className="text-text-2 text-xs mt-3">
            Payloads already in <code className="text-text-1">device_events.rawPayload</code>.
            Run <code className="text-text-1">apps/backend/src/scripts/dump-battery-payloads.ts</code>{" "}
            (or adapt for these event numbers) for structural analysis.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function BatterySection({
  history,
  fgSocTenths,
}: {
  history: BatteryHistory | null
  fgSocTenths: number | null
}) {
  if (!history || history.series.length === 0) {
    return (
      <div>
        <SectionHead>Battery</SectionHead>
        <p className="text-text-2 text-sm mt-3">
          No battery events yet — strap pushes BatteryLevel (evt 3) and ExtendedBatteryInformation (evt 63) ~every 4 min.
        </p>
      </div>
    )
  }

  const { latest, series } = history
  const latestSoc = typeof latest.socPct === "number" ? latest.socPct : null
  const latestVolt = typeof latest.voltageMv === "number" ? latest.voltageMv : null
  const latestTemp = typeof latest.temperatureC === "number" ? latest.temperatureC : null
  const latestIcon = typeof latest.iconLevel === "number" ? latest.iconLevel : null
  const latestAt = typeof latest.capturedAt === "string" ? latest.capturedAt : null

  const socTone =
    latestSoc == null
      ? "neutral"
      : latestSoc >= 50
        ? "green"
        : latestSoc >= 20
          ? "yellow"
          : "red"
  const tempTone = latestTemp == null ? "neutral" : latestTemp >= 40 ? "yellow" : "neutral"

  const fgSoc = fgSocTenths != null ? fgSocTenths / 10 : null
  const drift = latestSoc != null && fgSoc != null ? latestSoc - fgSoc : null

  const points = series.map((p) => ({
    t: new Date(p.capturedAt).getTime(),
    soc: p.socPct,
    volt: p.voltageMv,
    temp: p.temperatureC,
  }))

  const tickFmt = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })

  return (
    <div>
      <SectionHead>Battery</SectionHead>

      <div className="grid grid-cols-4 gap-6 mt-3">
        <BatteryStat
          label="State of charge"
          value={latestSoc != null ? `${latestSoc.toFixed(1)}%` : "—"}
          tone={socTone}
        />
        <BatteryStat
          label="Voltage"
          value={latestVolt != null ? `${(latestVolt / 1000).toFixed(3)} V` : "—"}
        />
        <BatteryStat
          label="Temperature"
          value={latestTemp != null ? `${latestTemp.toFixed(1)} °C` : "—"}
          tone={tempTone}
        />
        <BatteryStat
          label="Icon level"
          value={latestIcon != null ? `${latestIcon} / 7` : "—"}
        />
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-text-2">
        {latestAt ? <span>Latest reading {formatTime(latestAt)}</span> : null}
        <span>·</span>
        <span>{history.count} readings · last {history.hours}h</span>
        {fgSoc != null ? (
          <>
            <span>·</span>
            <span>
              Firmware fuel-gauge SOC {fgSoc.toFixed(1)}%
              {drift != null ? (
                <span className={Math.abs(drift) > 2 ? "text-yellow ml-1" : "ml-1"}>
                  (drift {drift >= 0 ? "+" : ""}{drift.toFixed(1)})
                </span>
              ) : null}
            </span>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <BatteryChart
          title="SOC %"
          points={points}
          dataKey="soc"
          color="#22c55e"
          unit="%"
          tickFmt={tickFmt}
          domain={[0, 100]}
        />
        <BatteryChart
          title="Voltage (mV)"
          points={points}
          dataKey="volt"
          color="#3b82f6"
          unit=" mV"
          tickFmt={tickFmt}
          domain={["dataMin - 50", "dataMax + 50"]}
        />
        <BatteryChart
          title="Temp (°C)"
          points={points}
          dataKey="temp"
          color="#f97316"
          unit=" °C"
          tickFmt={tickFmt}
          domain={["dataMin - 1", "dataMax + 1"]}
        />
      </div>
    </div>
  )
}

function BatteryStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "green" | "yellow" | "red" | "neutral"
}) {
  return (
    <div>
      <p className="text-text-2 text-xs uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {tone !== "neutral" ? (
          <Pill tone={tone}>{tone === "green" ? "ok" : tone === "yellow" ? "warn" : "low"}</Pill>
        ) : null}
      </div>
    </div>
  )
}

function BatteryChart({
  title,
  points,
  dataKey,
  color,
  unit,
  tickFmt,
  domain,
}: {
  title: string
  points: Array<{ t: number; soc: number | null; volt: number | null; temp: number | null }>
  dataKey: "soc" | "volt" | "temp"
  color: string
  unit: string
  tickFmt: (t: number) => string
  domain: [number | string, number | string]
}) {
  const filtered = points.filter((p) => p[dataKey] != null)
  return (
    <div className="bg-surface-1 border border-border rounded-2xl p-4">
      <p className="text-text-2 text-xs uppercase tracking-wider mb-1">{title}</p>
      {filtered.length < 2 ? (
        <p className="text-text-2 text-sm py-6">Not enough samples yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={filtered} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="t"
              tickFormatter={tickFmt}
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke="rgba(255,255,255,0.3)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={domain}
              stroke="rgba(255,255,255,0.3)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(20,20,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(ts) =>
                new Date(ts as number).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              }
              formatter={(value) => {
                const n = Number(value)
                if (!Number.isFinite(n)) return ["", ""]
                return [
                  `${n.toFixed(dataKey === "volt" ? 0 : 1)}${unit}`,
                  title.split(" ")[0],
                ]
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
