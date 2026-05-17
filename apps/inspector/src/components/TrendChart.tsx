import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { TrendPoint } from "../api"
import { SectionHead } from "./primitives"

export function TrendChart({
  title,
  subtitle,
  data,
  color = "#3b82f6",
  unit,
  decimals = 1,
  formatValue,
  height = 180,
  compact = false,
  domain,
  onDomainChange,
  cursorMs,
  onCursorChange,
}: {
  title: string
  subtitle?: string
  data: TrendPoint[]
  color?: string
  unit?: string
  decimals?: number
  formatValue?: (v: number) => string
  height?: number
  compact?: boolean
  domain?: [number, number]
  onDomainChange?: (d: [number, number]) => void
  cursorMs?: number | null
  onCursorChange?: (ms: number | null) => void
}) {
  const points = data.map((d) => ({
    t: new Date(d.timestamp).getTime(),
    v: d.value,
  }))
  const validValues = points.map((p) => p.v).filter((v) => Number.isFinite(v))
  const mean =
    validValues.length > 0
      ? validValues.reduce((a, b) => a + b, 0) / validValues.length
      : null
  const min = validValues.length > 0 ? Math.min(...validValues) : 0
  const max = validValues.length > 0 ? Math.max(...validValues) : 0
  const pad = (max - min) * 0.1 || 1
  const latest =
    points.length > 0 ? points[points.length - 1].v : null

  const tickFmt = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })

  const fmt = (v: number) =>
    formatValue ? formatValue(v) : v.toFixed(decimals)

  const xDomain: [number | string, number | string] =
    domain ?? ["dataMin", "dataMax"]

  const startIndex =
    domain && points.length > 0
      ? Math.max(0, points.findIndex((p) => p.t >= domain[0]))
      : undefined

  const endIndex =
    domain && points.length > 0
      ? (() => {
          let last = points.length - 1
          for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].t <= domain[1]) { last = i; break }
          }
          return last
        })()
      : undefined

  return (
    <div className={`bg-surface-1 border border-border rounded-2xl ${compact ? "p-3" : "p-5"}`}>
      <div className="flex items-baseline justify-between mb-1">
        <SectionHead>{title}</SectionHead>
        <div className="text-right">
          {latest != null && Number.isFinite(latest) ? (
            <p className="text-lg font-semibold tracking-tight">
              {fmt(latest)}
              {unit ? <span className="text-text-2 text-sm font-normal ml-1">{unit}</span> : null}
            </p>
          ) : (
            <p className="text-lg text-text-2">—</p>
          )}
          {mean != null && Number.isFinite(mean) && (
            <p className="text-text-2 text-xs">avg {fmt(mean)}{unit ? unit : ""}</p>
          )}
        </div>
      </div>
      {subtitle && <p className="text-text-2 text-xs mb-3">{subtitle}</p>}

      {data.length === 0 ? (
        <div
          className="flex items-center justify-center text-text-2 text-sm"
          style={{ height }}
        >
          No data in range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={points}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            onMouseMove={(e) => {
              if (!onCursorChange) return
              const ev = e as unknown as { activePayload?: Array<{ payload: { t: number; v: number } }> }
              if (ev?.activePayload?.[0]) {
                onCursorChange(ev.activePayload[0].payload.t)
              }
            }}
            onMouseLeave={() => onCursorChange?.(null)}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <XAxis
              dataKey="t"
              type="number"
              domain={xDomain}
              tickFormatter={tickFmt}
              tick={{ fill: "var(--color-text-2)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tickFormatter={(v) => fmt(v)}
              tick={{ fill: "var(--color-text-2)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              width={50}
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
                if (!Number.isFinite(ts)) return ""
                return new Date(ts).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              }}
              formatter={(value) => {
                const v = Number(value)
                return [
                  Number.isFinite(v) ? `${fmt(v)}${unit ?? ""}` : "—",
                  unit ?? "",
                ]
              }}
            />
            {mean != null && Number.isFinite(mean) && (
              <ReferenceLine
                y={mean}
                stroke="rgba(255,255,255,0.18)"
                strokeDasharray="3 3"
              />
            )}
            {cursorMs != null && Number.isFinite(cursorMs) && (
              <ReferenceLine
                x={cursorMs}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )}
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2.5, fill: color, stroke: "none" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {onDomainChange && (
              <Brush
                dataKey="t"
                height={20}
                stroke="rgba(255,255,255,0.15)"
                fill="rgba(255,255,255,0.04)"
                travellerWidth={6}
                startIndex={startIndex}
                endIndex={endIndex}
                onChange={(brushRange) => {
                  const { startIndex: si, endIndex: ei } = brushRange as {
                    startIndex: number
                    endIndex: number
                  }
                  if (
                    si != null &&
                    ei != null &&
                    points[si] != null &&
                    points[ei] != null
                  ) {
                    onDomainChange([points[si].t, points[ei].t])
                  }
                }}
                tickFormatter={tickFmt}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
