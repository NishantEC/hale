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

import type { PipelineRunRow, PipelineRunsHistory } from "../api"

type TooltipPayloadEntry = {
  dataKey?: string | number
  value?: number
  color?: string
  payload?: BarRow
}
type ChartTooltipProps = {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}
import { SectionHead, Pill } from "./primitives"
import { formatDuration } from "../format"

function describeWindow(run: PipelineRunRow): string {
  if (!run.windowFrom && !run.windowTo) return "full window (45d)"
  const from = run.windowFrom ? new Date(run.windowFrom) : null
  const to = run.windowTo ? new Date(run.windowTo) : null
  if (from && to) {
    const spanMs = to.getTime() - from.getTime()
    const days = Math.round(spanMs / 86_400_000)
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    return `${fmt(from)} → ${fmt(to)} (${days}d)`
  }
  return "custom window"
}

export const STAGE_COLORS: Record<string, string> = {
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
  runId: string
  label: string
  startedAt: string
  total: number
  skipped: boolean
  forced: boolean
  windowDescription: string
  detections: number
  isOutlier: boolean
  pipelineVersion?: string
} & Record<string, number | string | boolean>

export function PipelineRunsChart({
  history,
  onRunClick,
}: {
  history: PipelineRunsHistory | null
  onRunClick?: (id: string) => void
}) {
  if (!history || history.runs.length === 0) {
    return (
      <div>
        <SectionHead>Recent pipeline runs</SectionHead>
        <p className="text-text-2 text-sm mt-3">
          No runs recorded yet. The pipeline writes a history row each time
          it runs (or skips via the watermark).
        </p>
        <StaticLegend stageMedians={{}} />
      </div>
    )
  }

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
    const version = (r as any).pipelineVersion as string | undefined
    const row: BarRow = {
      idx: i,
      runId: r.id,
      label: new Date(r.startedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      startedAt: r.startedAt,
      total: r.durationMs,
      skipped: r.skipped,
      forced: r.forced,
      windowDescription: describeWindow(r),
      detections: r.detections,
      isOutlier: !r.skipped && r.durationMs > outlierThreshold,
      ...(version ? { pipelineVersion: version } : {}),
    }
    if (r.skipped) {
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

  const handleBarClick = (barData: { runId?: string } | null) => {
    if (onRunClick && barData?.runId) {
      onRunClick(barData.runId)
    }
  }

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
            style={onRunClick ? { cursor: "pointer" } : undefined}
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
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={<RunTooltip />}
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
                onClick={(barData) => handleBarClick(barData as { runId?: string })}
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
              onClick={(barData) => handleBarClick(barData as { runId?: string })}
            />
          </BarChart>
        </ResponsiveContainer>

        {data.some((r) => r.pipelineVersion) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pb-2 border-b border-border">
            {data.map((row) =>
              row.pipelineVersion ? (
                <span
                  key={row.idx}
                  className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-surface-3 text-text-2 border border-border"
                  title={`Run ${row.label}`}
                >
                  {row.pipelineVersion as string}
                </span>
              ) : null,
            )}
          </div>
        )}

        <StaticLegend stageMedians={history.stageMedians} />
      </div>
    </div>
  )
}

function StaticLegend({ stageMedians }: { stageMedians: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-border">
      {Object.entries(STAGE_COLORS).map(([name, color]) => (
        <div key={name} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-text-1 text-xs">{name}</span>
          {stageMedians[name] != null && (
            <span className="text-text-2 text-xs">
              ({formatDuration(stageMedians[name])})
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
  )
}

function RunTooltip(props: ChartTooltipProps) {
  if (!props.active || !props.payload || props.payload.length === 0) return null
  const row = props.payload[0].payload
  if (!row) return null
  const stageEntries = props.payload
    .filter(
      (p): p is TooltipPayloadEntry & { value: number; dataKey: string } =>
        p.dataKey !== "_skipped" &&
        typeof p.value === "number" &&
        typeof p.dataKey === "string",
    )
    .map((p) => ({
      name: p.dataKey,
      value: p.value,
      color: p.color ?? "#888",
    }))
  return (
    <div className="bg-surface-2 border border-border-strong rounded-xl p-3 shadow-2xl min-w-[220px]">
      <p className="text-text-0 text-sm font-semibold">{row.label}</p>
      <p className="text-text-2 text-xs">
        {row.skipped ? "skipped — no new input" : formatDuration(row.total)}
        {row.forced && (
          <>
            {" "}
            <span className="text-yellow">· forced</span>
          </>
        )}
      </p>
      <p className="text-text-2 text-xs mt-0.5">{row.windowDescription}</p>
      {row.pipelineVersion && (
        <p className="text-text-2 text-[10px] font-mono mt-0.5">{row.pipelineVersion as string}</p>
      )}
      {!row.skipped && stageEntries.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border space-y-0.5">
          {stageEntries.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-text-1 flex-1">{s.name}</span>
              <span className="text-text-0 font-medium">
                {formatDuration(s.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
