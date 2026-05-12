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
import { SectionHead } from "./primitives"

// Heart-rate timeline for the selected day with sleep windows overlaid.
//
// Inputs:
// - `raw.rows` from /debug/raw-records (we use the timestamp + heartRate
//   fields; non-positive HR values are dropped as "no skin contact" /
//   junk sentinels).
// - `sleep.selectedDetection.bedtime / wakeTime` for the overlay band.
//   The chart spans the full calendar day's data, not just the sleep
//   window, so you can see the HR shape leading into and out of sleep.
//
// At default fetch (limit=200) the chart is sparse. The parent should
// bump the limit when the user is on the Sleep tab — see App.tsx wiring.

export function DayTimeline({
  raw,
  sleep,
}: {
  raw: RawRecords | null
  sleep: SleepNight | null
}) {
  const points = useMemo(() => {
    if (!raw) return []
    return raw.rows
      .map((r) => ({
        t: new Date(r.timestamp).getTime(),
        hr: r.heartRate > 0 ? r.heartRate : null,
      }))
      .filter((p): p is { t: number; hr: number } => p.hr != null)
      .sort((a, b) => a.t - b.t)
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
    new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionHead>Day timeline · HR + sleep overlay</SectionHead>
        <span className="text-text-2 text-xs">
          {points.length} HR samples
        </span>
      </div>
      <div className="bg-surface-1 border border-border rounded-2xl p-4">
        {points.length === 0 ? (
          <div className="flex items-center justify-center text-text-2 text-sm h-44">
            No raw samples for this day — sync from the strap or bump the
            limit on /debug/raw-records.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={points}
              margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[minT ?? "dataMin", maxT ?? "dataMax"]}
                tickFormatter={tickFmt}
                tick={{ fill: "var(--color-text-2)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 5", "dataMax + 5"]}
                tickFormatter={(v) => `${Math.round(v)}`}
                tick={{ fill: "var(--color-text-2)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                width={42}
                label={{
                  value: "bpm",
                  position: "insideTopLeft",
                  fill: "var(--color-text-2)",
                  fontSize: 10,
                  dx: 8,
                  dy: -6,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border-strong)",
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
