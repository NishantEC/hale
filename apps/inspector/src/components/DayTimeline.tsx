import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { RawRecords, SleepNight } from "../api"
import { lttb } from "../utils/lttb"
import { SectionHead } from "./primitives"

// Heart-rate timeline for the selected day with sleep windows overlaid.
//
// Downsamples to ~500 points via LTTB so the chart stays at 60fps during
// hover even on 5000-sample fetches. `cursorMs` + `onCursorChange` opt
// the chart into the Sleep tab's cross-chart scrub controller.

const DOWNSAMPLE_THRESHOLD = 500

export function DayTimeline({
  raw,
  sleep,
  cursorMs,
  onCursorChange,
}: {
  raw: RawRecords | null
  sleep: SleepNight | null
  cursorMs?: number | null
  onCursorChange?: (ms: number | null) => void
}) {
  const points = useMemo(() => {
    if (!raw) return []
    const all = raw.rows
      .map((r) => ({
        x: new Date(r.timestamp).getTime(),
        y: r.heartRate,
      }))
      .filter((p) => p.y > 0)
      .sort((a, b) => a.x - b.x)
    const sampled = lttb(all, DOWNSAMPLE_THRESHOLD)
    return sampled.map((p) => ({ t: p.x, hr: p.y }))
  }, [raw])

  const bedtime = sleep?.selectedDetection?.bedtime
    ? new Date(sleep.selectedDetection.bedtime).getTime()
    : null
  const wakeTime = sleep?.selectedDetection?.wakeTime
    ? new Date(sleep.selectedDetection.wakeTime).getTime()
    : null

  const minT = points.length > 0 ? points[0].t : null
  const maxT = points.length > 0 ? points[points.length - 1].t : null

  const tickFmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  // Show external cursor only if within this chart's time range.
  const externalCursor =
    cursorMs != null && minT != null && maxT != null && cursorMs >= minT && cursorMs <= maxT
      ? cursorMs
      : null

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionHead>Day timeline · HR + sleep overlay</SectionHead>
        <span className="text-muted-foreground text-xs">
          {raw ? `${raw.count} raw · ${points.length} after downsample` : "—"}
        </span>
      </div>
      <div
        className="bg-card border border-border rounded-2xl p-4"
        onMouseLeave={() => onCursorChange?.(null)}
      >
        {points.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground text-sm h-44">
            No raw samples for this day. The strap may not have been worn or data hasn't synced.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={points}
              margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
              onMouseMove={(s) => {
                if (s.activeLabel != null) onCursorChange?.(Number(s.activeLabel))
              }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[minT ?? "dataMin", maxT ?? "dataMax"]}
                tickFormatter={tickFmt}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 5", "dataMax + 5"]}
                tickFormatter={(v) => `${Math.round(Number(v))}`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                width={42}
                label={{
                  value: "bpm",
                  position: "insideTopLeft",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                  dx: 8,
                  dy: -6,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--muted)",
                  border: "1px solid var(--ring)",
                  borderRadius: 12,
                  fontSize: 13,
                }}
                labelFormatter={(label) => {
                  const ts = Number(label)
                  return Number.isFinite(ts)
                    ? new Date(ts).toLocaleString(undefined, {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""
                }}
                formatter={(value) => [`${Math.round(Number(value))} bpm`, "HR"]}
              />
              {bedtime != null && wakeTime != null && bedtime < wakeTime && (
                <ReferenceArea
                  x1={bedtime}
                  x2={wakeTime}
                  fill="rgba(63, 177, 231, 0.10)"
                  stroke="rgba(63, 177, 231, 0.35)"
                  strokeDasharray="3 3"
                  ifOverflow="visible"
                  label={{
                    value: "sleep",
                    position: "insideTopLeft",
                    fill: "#3FB1E7",
                    fontSize: 10,
                  }}
                />
              )}
              {bedtime != null && (
                <ReferenceLine
                  x={bedtime}
                  stroke="rgba(63, 177, 231, 0.6)"
                  strokeDasharray="2 4"
                />
              )}
              {wakeTime != null && (
                <ReferenceLine
                  x={wakeTime}
                  stroke="rgba(63, 177, 231, 0.6)"
                  strokeDasharray="2 4"
                />
              )}
              {externalCursor != null && (
                <ReferenceLine x={externalCursor} stroke="var(--primary)" strokeWidth={1} />
              )}
              <Line
                type="monotone"
                dataKey="hr"
                stroke="#FE8A73"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
