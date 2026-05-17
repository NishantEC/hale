import { useMemo, useState } from "react"

import type { PipelineRunOptions, TrendsView } from "../api"
import { Num, Pill, SectionHead } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { TrendChart } from "../components/TrendChart"
import { formatNumber } from "../format"

const RANGE_OPTIONS = [
  { days: 30, label: "30d" },
  { days: 60, label: "60d" },
  { days: 90, label: "90d" },
] as const

const CHART_COLORS = {
  hrv: "#3FB1E7",
  rhr: "#FE8A73",
  sleep: "#403EA7",
  recovery: "#22c55e",
  consistency: "#1B81FE",
  strain: "#eab308",
  spo2: "#a78bfa",
  resp: "#f472b6",
  stress: "#ef4444",
  training: "#94a3b8",
}

function trendPill(trend: "improving" | "declining" | "stable" | null) {
  if (trend === "improving") return <Pill tone="green">improving</Pill>
  if (trend === "declining") return <Pill tone="yellow">declining</Pill>
  if (trend === "stable") return <Pill tone="neutral">stable</Pill>
  return <Pill tone="neutral">—</Pill>
}

export function TrendsTab({
  trends,
  rangeDays,
  onRangeChange,
  onRunPipeline,
  busy,
}: {
  trends: TrendsView | null
  rangeDays: number
  onRangeChange: (days: number) => void
  onRunPipeline: (opts: PipelineRunOptions) => void | Promise<void>
  busy: boolean
}) {
  const summaries = trends?.summaries

  const [compact, setCompact] = useState(false)
  const [sharedDomain, setSharedDomain] = useState<[number, number] | undefined>(undefined)
  const [cursorMs, setCursorMs] = useState<number | null>(null)

  const chartHeight = compact ? 90 : 180

  const hrvDelta = useMemo(() => {
    if (!summaries?.hrv.current || !summaries?.hrv.weekAgo) return null
    return summaries.hrv.current - summaries.hrv.weekAgo
  }, [summaries])
  const rhrDelta = useMemo(() => {
    if (!summaries?.restingHr.current || !summaries?.restingHr.weekAgo)
      return null
    return summaries.restingHr.current - summaries.restingHr.weekAgo
  }, [summaries])

  const sharedProps = {
    domain: sharedDomain,
    onDomainChange: setSharedDomain,
    cursorMs,
    onCursorChange: setCursorMs,
    height: chartHeight,
    compact,
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-1 text-sm">
            {trends?.dataPoints ?? 0} nights in the last {rangeDays} days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCompact((c) => !c)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              compact
                ? "bg-surface-3 border-border text-text-0"
                : "bg-surface-1 border-border text-text-2 hover:text-text-1"
            }`}
          >
            {compact ? "Comfortable" : "Compact"}
          </button>
          <div className="flex gap-1.5 bg-surface-1 border border-border rounded-lg p-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.days}
                onClick={() => onRangeChange(r.days)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  rangeDays === r.days
                    ? "bg-surface-3 text-text-0"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <RunPipelineMenu
            busy={busy}
            variant="secondary"
            label="Rerun"
            onRun={onRunPipeline}
            presets={[
              {
                kind: "lastDays",
                days: rangeDays,
                label: `Rerun last ${rangeDays} days`,
              },
              { kind: "full", label: "Rerun full (45d)" },
            ]}
          />
        </div>
      </div>

      <div>
        <SectionHead>Week-over-week</SectionHead>
        <div className="grid grid-cols-3 gap-8 mt-4">
          <div>
            <div className="flex items-baseline gap-2">
              <Num
                label="HRV (RMSSD)"
                value={formatNumber(summaries?.hrv.current, 1)}
                sub={
                  hrvDelta != null
                    ? `${hrvDelta > 0 ? "+" : ""}${hrvDelta.toFixed(1)} vs week ago`
                    : "—"
                }
              />
            </div>
            <div className="mt-1">{trendPill(summaries?.hrv.trend ?? null)}</div>
          </div>
          <div>
            <Num
              label="Resting HR"
              value={formatNumber(summaries?.restingHr.current, 0)}
              sub={
                rhrDelta != null
                  ? `${rhrDelta > 0 ? "+" : ""}${rhrDelta.toFixed(0)} bpm vs week ago`
                  : "—"
              }
            />
            <div className="mt-1">{trendPill(summaries?.restingHr.trend ?? null)}</div>
          </div>
          <Num
            label="Sleep avg"
            value={
              summaries?.sleepDuration.avgHours != null
                ? `${formatNumber(summaries.sleepDuration.avgHours, 1)}h`
                : "—"
            }
            sub={`${summaries?.sleepDuration.nights ?? 0} nights`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <TrendChart
          title="HRV (RMSSD)"
          subtitle="autonomic balance"
          data={trends?.hrvTrend ?? []}
          color={CHART_COLORS.hrv}
          unit=" ms"
          {...sharedProps}
        />
        <TrendChart
          title="Resting HR"
          subtitle="lower is generally better"
          data={trends?.restingHrTrend ?? []}
          color={CHART_COLORS.rhr}
          unit=" bpm"
          decimals={0}
          {...sharedProps}
        />
        <TrendChart
          title="Sleep duration"
          subtitle="hours per night"
          data={trends?.sleepDurationTrend ?? []}
          color={CHART_COLORS.sleep}
          unit="h"
          {...sharedProps}
        />
        <TrendChart
          title="Recovery"
          subtitle="daily balance score"
          data={trends?.recoveryTrend ?? []}
          color={CHART_COLORS.recovery}
          decimals={0}
          {...sharedProps}
        />
        <TrendChart
          title="Sleep consistency"
          data={trends?.consistencyTrend ?? []}
          color={CHART_COLORS.consistency}
          decimals={0}
          {...sharedProps}
        />
        <TrendChart
          title="Strain"
          data={trends?.strainTrend ?? []}
          color={CHART_COLORS.strain}
          {...sharedProps}
        />
        <TrendChart
          title="Respiratory rate"
          subtitle="breaths/min during sleep"
          data={trends?.respiratoryRateTrend ?? []}
          color={CHART_COLORS.resp}
          decimals={1}
          {...sharedProps}
        />
        <TrendChart
          title="SpO2 average"
          data={trends?.spo2Trend ?? []}
          color={CHART_COLORS.spo2}
          decimals={1}
          unit="%"
          {...sharedProps}
        />
        <TrendChart
          title="Stress"
          data={trends?.stressTrend ?? []}
          color={CHART_COLORS.stress}
          {...sharedProps}
        />
        <TrendChart
          title="Training load"
          subtitle="acute:chronic ratio — sweet spot 0.8–1.3"
          data={trends?.trainingLoadTrend ?? []}
          color={CHART_COLORS.training}
          decimals={2}
          {...sharedProps}
        />
      </div>
    </div>
  )
}
