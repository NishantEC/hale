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
import type { AccentKey } from "./primitives"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { cn } from "@/lib/utils"

const ACCENT_HEX: Record<AccentKey, string> = {
  cyan: "#00DCFF",
  magenta: "#FF2D6E",
  lime: "#BBFF38",
  amber: "#FFA42B",
}

function colorToAccent(color: string): AccentKey | undefined {
  for (const [key, hex] of Object.entries(ACCENT_HEX)) {
    if (hex.toLowerCase() === color.toLowerCase()) return key as AccentKey
  }
  return undefined
}

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
  const accent = colorToAccent(color)
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
  const latest = points.length > 0 ? points[points.length - 1].v : null

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
    <Card accent={accent} className={cn("gap-3", compact ? "py-3" : "py-5")}>
      <CardHeader className={cn("px-5 pb-0 pt-0", compact ? "gap-1" : "gap-2")}>
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {title}
          </CardTitle>
          <div className="text-right">
            {latest != null && Number.isFinite(latest) ? (
              <p className="text-lg font-semibold tracking-tight">
                {fmt(latest)}
                {unit ? (
                  <span className="text-muted-foreground text-sm font-normal ml-1">{unit}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-lg text-muted-foreground">—</p>
            )}
            {mean != null && Number.isFinite(mean) && (
              <p className="text-muted-foreground text-xs">
                avg {fmt(mean)}{unit ?? ""}
              </p>
            )}
          </div>
        </div>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>

      <CardContent className="px-5 pb-0">
        {data.length === 0 ? (
          <div
            className="flex items-center justify-center text-muted-foreground text-sm"
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
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                domain={[min - pad, max + pad]}
                tickFormatter={(v) => fmt(v)}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-muted)",
                  border: "1px solid var(--border)",
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
      </CardContent>
    </Card>
  )
}
