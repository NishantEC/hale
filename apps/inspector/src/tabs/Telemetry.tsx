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

export function TelemetryTab({
  telemetry,
  batteryHistory,
  live,
  toggleLive,
}: {
  telemetry: Telemetry | null
  batteryHistory: BatteryHistory | null
  live: boolean
  toggleLive: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLive}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            live
              ? "bg-green-soft text-green"
              : "text-text-1 border border-border hover:border-border-strong"
          }`}
        >
          {live ? "Live · 5s" : "Auto-refresh off"}
        </button>
        {live && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-green"
            style={{ animation: "pulse 1.5s ease-in-out infinite" }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Num
          label="Device events"
          value={telemetry?.events.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.events.summary ?? {}).length} event types`}
        />
        <Num
          label="Realtime samples"
          value={telemetry?.realtime.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.realtime.sessions ?? {}).length} sessions`}
        />
      </div>

      <BatterySection history={batteryHistory} fgSocTenths={typeof telemetry?.consoleLogs?.deviceInfo?.batterySocTenths === "number" ? (telemetry.consoleLogs.deviceInfo.batterySocTenths as number) : null} />

      {telemetry && Object.keys(telemetry.events.summary).length > 0 && (
        <EventBreakdown summary={telemetry.events.summary} />
      )}

      <div className="grid grid-cols-2 gap-10">
        <div>
          <SectionHead>Recent events</SectionHead>
          <div className="mt-3 overflow-auto rounded-xl border border-border max-h-96">
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
                {telemetry?.events.recent.slice(0, 40).map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{e.eventName}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">
                      {e.deviceId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.capturedAt)}</td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.receivedAt)}</td>
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
                <tr>
                  {["Type", "HR", "Session", "Captured"].map((h) => (
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
                {telemetry?.realtime.recent.slice(0, 40).map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{s.dataType}</td>
                    <td className="px-4 py-2.5">{s.heartRate ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">
                      {s.sessionId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(s.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {telemetry?.consoleLogs && (
        <>
          <div className="grid grid-cols-2 gap-8 mt-2">
            <Num
              label="Console logs"
              value={telemetry.consoleLogs.totalCount}
              sub="firmware output lines"
            />
          </div>

          {telemetry.consoleLogs.deviceInfo &&
            Object.keys(telemetry.consoleLogs.deviceInfo).length > 0 && (
              <div>
                <SectionHead>Device info (from logs)</SectionHead>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                  {Object.entries(telemetry.consoleLogs.deviceInfo).map(
                    ([k, v]) => (
                      <div key={k} className="flex items-baseline gap-2">
                        <span className="text-text-2 text-xs">{k}</span>
                        <span className="text-sm font-medium">{String(v)}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

          <div>
            <SectionHead>Recent console logs</SectionHead>
            <div className="mt-3 overflow-auto rounded-xl border border-border max-h-[32rem]">
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
                  {telemetry.consoleLogs.recent.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                      <td className="px-4 py-2 w-16">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            l.logLevel === "error"
                              ? "bg-red-soft text-red"
                              : l.logLevel === "warn"
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
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
        <SectionHead>Event breakdown</SectionHead>
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
              <SectionHead>Unknown events</SectionHead>
              <Pill tone="yellow">needs RE</Pill>
            </div>
            <p className="text-text-2 text-xs">
              {unknownTotal} sample{unknownTotal === 1 ? "" : "s"} across{" "}
              {unknownEntries.length} event number{unknownEntries.length === 1 ? "" : "s"}
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

  // FG SOC comes from the firmware console log as a single tenths int.
  // It updates rarely (~once per boot/event) so use it as a sanity check
  // against the much fresher BLE event stream.
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
          label="SOC"
          value={latestSoc != null ? `${latestSoc.toFixed(1)}%` : "—"}
          tone={socTone}
        />
        <BatteryStat
          label="Voltage"
          value={latestVolt != null ? `${(latestVolt / 1000).toFixed(3)} V` : "—"}
        />
        <BatteryStat
          label="Temp"
          value={latestTemp != null ? `${latestTemp.toFixed(1)} °C` : "—"}
          tone={tempTone}
        />
        <BatteryStat
          label="Icon level"
          value={latestIcon != null ? `${latestIcon} / 7` : "—"}
        />
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-text-2">
        {latestAt ? <span>Latest event {formatTime(latestAt)}</span> : null}
        <span>·</span>
        <span>{history.count} samples · last {history.hours}h</span>
        {fgSoc != null ? (
          <>
            <span>·</span>
            <span>
              Firmware FG SOC {fgSoc.toFixed(1)}%
              {drift != null ? (
                <span className={Math.abs(drift) > 2 ? "text-yellow ml-1" : "ml-1"}>
                  (Δ {drift >= 0 ? "+" : ""}{drift.toFixed(1)})
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
        {tone !== "neutral" ? <Pill tone={tone}>{tone === "green" ? "ok" : tone === "yellow" ? "warn" : "low"}</Pill> : null}
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
              formatter={(value: number) => [`${value.toFixed(dataKey === "volt" ? 0 : 1)}${unit}`, title.split(" ")[0]]}
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
