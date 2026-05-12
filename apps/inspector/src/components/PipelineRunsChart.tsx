import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { PipelineRunsHistory } from "../api"
import { SectionHead, Pill } from "./primitives"
import { formatDuration } from "../format"

// Stage-timing regression watch.
// Renders the last N pipeline_runs as stacked bars (one stack per run,
// segments colored per stage). Skipped runs render as a thin grey bar
// so the cadence is still visible. A dashed line marks median total
// duration; bars exceeding 2× median get a red border so regressions
// jump out.

const STAGE_COLORS: Record<string, string> = {
  fetch: "#3FB1E7",
  "sleep-detect": "#1B81FE",
  "activity-detect": "#403EA7",
  "sleep-stages": "#a78bfa",
  compute: "#22c55e",
  write: "#eab308",
}

function colorFor(stage: string): string {
  return STAGE_COLORS[stage] ?? "#6b7280"
}

type BarRow = {
  idx: number
  label: string
  startedAt: string
  total: number
  skipped: boolean
  isOutlier: boolean
} & Record<string, number | string | boolean>

export function PipelineRunsChart({
  history,
}: {
  history: PipelineRunsHistory | null
}) {
  if (!history || history.runs.length === 0) {
    return (
      <div>
        <SectionHead>Recent pipeline runs</SectionHead>
        <p className="text-text-2 text-sm mt-3">
          No runs recorded yet. The pipeline writes a history row each time
          it runs (or skips via the watermark).
        </p>
      </div>
    )
  }

  // Newest is index 0 from the API — flip to chronological so the chart
  // reads left-to-right "older to newer".
  const ordered = [...history.runs].reverse()
  const stageNames = Array.from(
    new Set(
      ordered.flatMap((r) => (r.stages ? Object.keys(r.stages) : [])),
    ),
  )

  const totals = ordered
    .filter((r) => !r.skipped)
    .map((r) => r.durationMs)
    .sort((a, b) => a - b)
  const medianTotal =
    totals.length > 0 ? totals[Math.floor(totals.length / 2)] : 0
  const outlierThreshold = medianTotal * 2

  const data: BarRow[] = ordered.map((r, i) => {
    const row: BarRow = {
      idx: i,
      label: new Date(r.startedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      startedAt: r.startedAt,
      total: r.durationMs,
      skipped: r.skipped,
      isOutlier: !r.skipped && r.durationMs > outlierThreshold,
    }
    if (r.skipped) {
      // Show as a small visible bar so the run is still visible on the
      // axis; use a sentinel "_skipped" stage that renders grey.
      row._skipped = Math.max(50, Math.min(200, medianTotal * 0.1))
    } else if (r.stages) {
      for (const name of stageNames) {
        row[name] = r.stages[name] ?? 0
      }
    } else {
      row.total = r.durationMs
    }
    return row
  })

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionHead>Recent pipeline runs</SectionHead>
        <span className="text-text-2 text-xs">
          {history.count} runs · median{" "}
          {formatDuration(medianTotal || null)} · 2× threshold{" "}
          {formatDuration(outlierThreshold || null)}
        </span>
      </div>
      <div className="bg-surface-1 border border-border rounded-2xl p-4">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-text-2)", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v / 1000)}s`}
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
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              formatter={(value, name) => [
                formatDuration(Number(value)),
                String(name) === "_skipped" ? "skipped" : String(name),
              ]}
            />
            {medianTotal > 0 && (
              <ReferenceLine
                y={medianTotal}
                stroke="rgba(255,255,255,0.25)"
                strokeDasharray="3 3"
                label={{
                  value: "median",
                  position: "right",
                  fill: "var(--color-text-2)",
                  fontSize: 10,
                }}
              />
            )}
            {stageNames.map((name) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="a"
                fill={colorFor(name)}
                isAnimationActive={false}
              >
                {data.map((row, i) => (
                  <Cell
                    key={i}
                    stroke={row.isOutlier ? "var(--color-red)" : undefined}
                    strokeWidth={row.isOutlier ? 1.5 : 0}
                  />
                ))}
              </Bar>
            ))}
            <Bar
              dataKey="_skipped"
              stackId="a"
              fill="rgba(255,255,255,0.18)"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-border">
          {stageNames.map((name) => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: colorFor(name) }}
              />
              <span className="text-text-1 text-xs">{name}</span>
              {history.stageMedians[name] != null && (
                <span className="text-text-2 text-xs">
                  ({formatDuration(history.stageMedians[name])})
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-white/20" />
            <span className="text-text-1 text-xs">skipped</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Pill tone="red">2× median</Pill>
            <span className="text-text-2 text-xs">= regression flag</span>
          </div>
        </div>
      </div>
    </div>
  )
}
