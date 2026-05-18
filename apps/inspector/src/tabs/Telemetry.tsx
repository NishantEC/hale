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
import { Pill, SectionHead } from "../components/primitives"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { ScrollArea } from "../components/ui/scroll-area"
import * as TagsInput from "@diceui/tags-input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { BlurFade } from "../components/magicui/blur-fade"
import { Marquee } from "../components/magicui/marquee"
import { NumberTicker } from "../components/magicui/number-ticker"
import { formatTime } from "../format"
import { cn } from "@/lib/utils"

type LogLevel = "error" | "warn" | "info" | "debug"
const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"]

function normaliseLevel(raw: string | null): LogLevel {
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") return raw
  return "info"
}

const LEVEL_STYLE: Record<LogLevel, { badge: string; itemClass: string; label: string }> = {
  error: {
    badge: "bg-destructive/10 text-destructive",
    itemClass: "data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive data-[state=on]:border-destructive/40",
    label: "Error",
  },
  warn: {
    badge: "bg-warning/10 text-warning",
    itemClass: "data-[state=on]:bg-warning/15 data-[state=on]:text-warning data-[state=on]:border-warning/40",
    label: "Warn",
  },
  info: {
    badge: "",
    itemClass: "data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:border-primary/40",
    label: "Info",
  },
  debug: {
    badge: "text-muted-foreground",
    itemClass: "data-[state=on]:bg-muted data-[state=on]:text-muted-foreground data-[state=on]:border-border",
    label: "Debug",
  },
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

  const [logTerms, setLogTerms] = useState<string[]>([])
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS))

  function handleLevelChange(values: string[]) {
    if (values.length === 0) return
    setEnabledLevels(new Set(values as LogLevel[]))
  }

  const filteredLogs = useMemo(() => {
    const logs = telemetry?.consoleLogs?.recent ?? []
    const needles = logTerms.map((t) => t.toLowerCase()).filter(Boolean)
    return logs.filter((l) => {
      const level = normaliseLevel(l.logLevel)
      if (!enabledLevels.has(level)) return false
      const message = l.message.toLowerCase()
      // AND filter: every term must match somewhere in the message.
      for (const n of needles) if (!message.includes(n)) return false
      return true
    })
  }, [telemetry?.consoleLogs?.recent, logTerms, enabledLevels])

  const liveMarqueeLogs = useMemo(() => {
    if (!live || logTerms.length > 0) return []
    return (telemetry?.consoleLogs?.recent ?? []).slice(-10)
  }, [live, logTerms, telemetry?.consoleLogs?.recent])

  return (
    <div className="space-y-10">
      <SectionHead
        n="00"
        kicker="Live device events, BLE samples, console logs, and battery, sampled from the strap."
        meta={
          <span
            className={cn(
              "eyebrow inline-flex items-center gap-1.5",
              live ? "text-[var(--accent-cyan)]" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "bg-[var(--accent-cyan)] animate-pulse" : "bg-foreground/30",
              )}
            />
            {live ? "live · 5s poll" : "live off"}
          </span>
        }
      >
        Telemetry
      </SectionHead>

      {tabHidden && (
        <Alert>
          <span className="w-2 h-2 rounded-full bg-foreground/30 shrink-0 inline-block mt-1" />
          <AlertTitle>Polling paused</AlertTitle>
          <AlertDescription>
            Data will refresh automatically when you return to this tab.
          </AlertDescription>
        </Alert>
      )}

      {!tabHidden && pausedMs !== null && (
        <BlurFade key={pausedMs} duration={0.3}>
          <Alert>
            <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] shrink-0 inline-block mt-1" />
            <AlertTitle>Resumed</AlertTitle>
            <AlertDescription>
              Refreshing after {Math.round(pausedMs / 1000)}s pause.
            </AlertDescription>
          </Alert>
        </BlurFade>
      )}

      <section className="grid grid-cols-2 gap-4">
        <Card accent="cyan">
          <p className="eyebrow">Device events</p>
          <p className="text-[2.25rem] leading-none tabular-nums tracking-tight font-bold text-[var(--accent-cyan)]">
            <NumberTicker value={telemetry?.events.totalCount ?? 0} />
          </p>
          <p className="text-xs text-muted-foreground">
            {Object.keys(telemetry?.events.summary ?? {}).length} distinct event types received from strap
          </p>
        </Card>
        <Card accent="magenta">
          <p className="eyebrow">BLE realtime samples</p>
          <p className="text-[2.25rem] leading-none tabular-nums tracking-tight font-bold text-[var(--accent-magenta)]">
            <NumberTicker value={telemetry?.realtime.totalCount ?? 0} />
          </p>
          <p className="text-xs text-muted-foreground">
            {Object.keys(telemetry?.realtime.sessions ?? {}).length} streaming sessions — heart rate, accel, etc.
          </p>
        </Card>
      </section>

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
          <p className="text-muted-foreground text-xs mt-1 mb-3">
            Named BLE events emitted by the strap firmware (e.g. BatteryLevel, StepCount)
          </p>
          <ScrollArea className="h-96 rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Event", "Device", "Captured", "Received"].map((h) => (
                    <TableHead key={h} className="text-xs uppercase tracking-wider text-muted-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(telemetry?.events.recent ?? []).slice(0, 40).map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.eventName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.deviceId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{formatTime(e.capturedAt)}</TableCell>
                    <TableCell>{formatTime(e.receivedAt)}</TableCell>
                  </TableRow>
                ))}
                {(telemetry?.events.recent ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      No events yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div>
          <SectionHead>BLE streaming sessions</SectionHead>
          <p className="text-muted-foreground text-xs mt-1 mb-3">
            Continuous real-time data streams grouped by session (each session = one app connection window)
          </p>
          <RealtimeSessions
            sessions={telemetry?.realtime.sessions ?? {}}
            recent={telemetry?.realtime.recent ?? []}
          />
        </div>
      </div>

      {telemetry?.consoleLogs && (
        <>
          <div className="grid grid-cols-2 gap-8 mt-2">
            <Card className="p-4 gap-1">
              <p className="text-muted-foreground text-sm">Console log lines</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                <NumberTicker value={telemetry.consoleLogs.totalCount} />
              </p>
              <p className="text-muted-foreground text-sm">
                Firmware stdout captured over BLE — includes boot messages, sensor init, errors
              </p>
            </Card>
          </div>

          {telemetry.consoleLogs.deviceInfo &&
            Object.keys(telemetry.consoleLogs.deviceInfo).length > 0 && (
              <div>
                <SectionHead>Device info (parsed from logs)</SectionHead>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                  {Object.entries(telemetry.consoleLogs.deviceInfo).map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <span className="text-muted-foreground text-xs">{k}</span>
                      <span className="text-sm font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <Card>
            <CardHeader className="border-b pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Console logs</CardTitle>
                  <CardDescription className="mt-1">
                    Raw firmware output lines — filter by level or search message text
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="tabular-nums shrink-0">
                  {filteredLogs.length} / {telemetry.consoleLogs.recent.length} shown
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <TagsInput.Root
                  value={logTerms}
                  onValueChange={setLogTerms}
                  addOnPaste
                  className="flex-1 min-w-[240px] min-h-8 flex flex-wrap items-center gap-1 px-2 py-1 rounded-md bg-background border border-input focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring"
                >
                  {logTerms.map((term) => (
                    <TagsInput.Item
                      key={term}
                      value={term}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded bg-muted text-foreground text-xs font-mono data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"
                    >
                      <TagsInput.ItemText>{term}</TagsInput.ItemText>
                      <TagsInput.ItemDelete className="opacity-60 hover:opacity-100">
                        ×
                      </TagsInput.ItemDelete>
                    </TagsInput.Item>
                  ))}
                  <TagsInput.Input
                    placeholder={logTerms.length === 0 ? "Filter messages — Enter to add a term" : ""}
                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground h-6"
                  />
                </TagsInput.Root>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  value={Array.from(enabledLevels)}
                  onValueChange={handleLevelChange}
                  className="gap-1"
                >
                  {ALL_LEVELS.map((level) => (
                    <ToggleGroupItem
                      key={level}
                      value={level}
                      className={cn("h-7 px-2.5 text-xs font-semibold", LEVEL_STYLE[level].itemClass)}
                    >
                      {LEVEL_STYLE[level].label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {liveMarqueeLogs.length > 0 && (
                <div className="border-b border-border bg-muted/30 py-1.5 overflow-hidden">
                  <Marquee pauseOnHover repeat={2} className="[--duration:30s] py-0">
                    {liveMarqueeLogs.map((l, i) => (
                      <span
                        key={i}
                        className="mx-6 flex items-center gap-2 text-xs text-muted-foreground font-mono"
                      >
                        <span className="text-muted-foreground/60 shrink-0">
                          {formatTime(l.capturedAt)}
                        </span>
                        <span className="truncate max-w-[300px]">{l.message}</span>
                      </span>
                    ))}
                  </Marquee>
                </div>
              )}
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Level", "Message", "Time"].map((h) => (
                        <TableHead key={h} className="text-xs uppercase tracking-wider text-muted-foreground">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((l, i) => {
                      const lvl = normaliseLevel(l.logLevel)
                      return (
                        <TableRow key={i}>
                          <TableCell className="w-16">
                            <span
                              className={cn(
                                "text-xs font-semibold px-1.5 py-0.5 rounded",
                                LEVEL_STYLE[lvl].badge || "text-muted-foreground",
                              )}
                            >
                              {l.logLevel ?? "info"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-pre-wrap break-all max-w-[480px]">
                            {l.message}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatTime(l.capturedAt)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {filteredLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No logs match the current filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
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

  if (sessionEntries.length === 0) {
    return (
      <div className="rounded-xl border border-border px-4 py-6 text-muted-foreground text-sm text-center">
        No streaming sessions recorded yet
      </div>
    )
  }

  return (
    <Accordion type="multiple" className="rounded-xl border border-border overflow-hidden divide-y divide-border">
      {sessionEntries.map(([sessionId, meta]) => {
        const elapsedMs =
          new Date(meta.latest).getTime() - new Date(meta.earliest).getTime()
        const elapsedSec = Math.round(elapsedMs / 1000)
        const elapsedLabel =
          elapsedSec < 60
            ? `${elapsedSec}s`
            : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
        const sessionRecent = recentBySession.get(sessionId) ?? []

        return (
          <AccordionItem key={sessionId} value={sessionId} className="border-b-0">
            <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 hover:no-underline transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                <span className="font-mono text-xs truncate max-w-[100px]">
                  {sessionId.slice(0, 12)}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {meta.dataType}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {meta.count} samples
                </span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {elapsedLabel}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTime(meta.latest)}
                </span>
              </div>
            </AccordionTrigger>

            <AccordionContent className="pb-0">
              <div className="border-t border-border">
                <div className="px-4 py-2 flex gap-6 text-xs text-muted-foreground bg-muted/30">
                  <span>Start: {formatTime(meta.earliest)}</span>
                  <span>Latest: {formatTime(meta.latest)}</span>
                  <span>Elapsed: {elapsedLabel}</span>
                  <span>{meta.count} total samples</span>
                </div>
                {sessionRecent.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Data type", "Heart rate", "Captured"].map((h) => (
                          <TableHead
                            key={h}
                            className="text-xs uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionRecent.slice(0, 20).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell>{s.dataType}</TableCell>
                          <TableCell>{s.heartRate != null ? `${s.heartRate} bpm` : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatTime(s.capturedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="px-4 py-3 text-muted-foreground text-xs">
                    No recent samples buffered for this session
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
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
              <span className="text-foreground">{name}</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {unknownEntries.length > 0 ? (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <SectionHead>Unknown event numbers</SectionHead>
              <Pill tone="yellow">needs RE</Pill>
            </div>
            <p className="text-muted-foreground text-xs">
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
                      Event {Number.isFinite(num) ? num : numStr}
                    </span>
                    {Number.isFinite(num) ? (
                      <span className="text-muted-foreground text-xs">
                        0x{num.toString(16).padStart(2, "0")}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              )
            })}
          </div>

          <p className="text-muted-foreground text-xs mt-3">
            Payloads already in <code className="text-foreground">device_events.rawPayload</code>.
            Run <code className="text-foreground">apps/backend/src/scripts/dump-battery-payloads.ts</code>{" "}
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
      <Card>
        <CardHeader>
          <CardTitle>Battery</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No battery events yet — strap pushes BatteryLevel (evt 3) and ExtendedBatteryInformation (evt 63) ~every 4 min.
          </p>
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Battery</CardTitle>
        <CardDescription>
          {history.count} readings over the last {history.hours}h
          {latestAt ? ` — latest at ${formatTime(latestAt)}` : ""}
          {fgSoc != null
            ? ` — firmware fuel-gauge ${fgSoc.toFixed(1)}%${
                drift != null
                  ? ` (drift ${drift >= 0 ? "+" : ""}${drift.toFixed(1)})`
                  : ""
              }`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-4 gap-6">
          <BatteryStat
            label="State of charge"
            value={latestSoc != null ? latestSoc : null}
            display={latestSoc != null ? `${latestSoc.toFixed(1)}%` : "—"}
            tone={socTone}
          />
          <BatteryStat
            label="Voltage"
            value={null}
            display={latestVolt != null ? `${(latestVolt / 1000).toFixed(3)} V` : "—"}
          />
          <BatteryStat
            label="Temperature"
            value={null}
            display={latestTemp != null ? `${latestTemp.toFixed(1)} °C` : "—"}
            tone={tempTone}
          />
          <BatteryStat
            label="Icon level"
            value={null}
            display={latestIcon != null ? `${latestIcon} / 7` : "—"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
      </CardContent>
    </Card>
  )
}

function BatteryStat({
  label,
  value,
  display,
  tone = "neutral",
}: {
  label: string
  value: number | null
  display: string
  tone?: "green" | "yellow" | "red" | "neutral"
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-semibold tracking-tight">
          {value != null && Number.isFinite(value) ? (
            <NumberTicker value={value} decimalPlaces={1} />
          ) : (
            display
          )}
        </p>
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
    <Card className="p-4 gap-2">
      <p className="text-muted-foreground text-xs uppercase tracking-wider">{title}</p>
      {filtered.length < 2 ? (
        <p className="text-muted-foreground text-sm py-6">Not enough samples yet</p>
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
    </Card>
  )
}
