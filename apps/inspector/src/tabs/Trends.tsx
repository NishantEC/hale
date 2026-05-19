import { useMemo, useState } from "react"

import type { PipelineRunOptions, TrendsView } from "../api"
import { DeltaChip, SectionHead, type AccentKey } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { TrendChart } from "../components/TrendChart"
import { Card } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Switch } from "../components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { formatNumber } from "../format"

const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days", short: "7d" },
  { days: 14, label: "Last 14 days", short: "14d" },
  { days: 30, label: "Last 30 days", short: "30d" },
  { days: 60, label: "Last 60 days", short: "60d" },
  { days: 90, label: "Last 90 days", short: "90d" },
] as const

const CHART_COLORS = {
  hrv: "#FF2D6E",
  rhr: "#BBFF38",
  sleep: "#00DCFF",
  recovery: "#BBFF38",
  consistency: "#5C8AC7",
  strain: "#FFA42B",
  spo2: "#FFA42B",
  resp: "#FFA42B",
  stress: "#FF2D6E",
  training: "#6B6CC5",
} as const

type ChartDef = {
  id: string
  title: string
  subtitle?: string
  dataKey: keyof Pick<
    TrendsView,
    | "hrvTrend"
    | "restingHrTrend"
    | "sleepDurationTrend"
    | "recoveryTrend"
    | "consistencyTrend"
    | "strainTrend"
    | "respiratoryRateTrend"
    | "spo2Trend"
    | "stressTrend"
    | "trainingLoadTrend"
  >
  colorKey: keyof typeof CHART_COLORS
  unit?: string
  decimals?: number
}

const CHART_DEFS: ChartDef[] = [
  { id: "hrv", title: "HRV (RMSSD)", subtitle: "autonomic balance", dataKey: "hrvTrend", colorKey: "hrv", unit: " ms" },
  { id: "rhr", title: "Resting HR", subtitle: "lower is generally better", dataKey: "restingHrTrend", colorKey: "rhr", unit: " bpm", decimals: 0 },
  { id: "sleep", title: "Sleep duration", subtitle: "hours per night", dataKey: "sleepDurationTrend", colorKey: "sleep", unit: "h" },
  { id: "recovery", title: "Recovery", subtitle: "daily balance score", dataKey: "recoveryTrend", colorKey: "recovery", decimals: 0 },
  { id: "consistency", title: "Sleep consistency", dataKey: "consistencyTrend", colorKey: "consistency", decimals: 0 },
  { id: "strain", title: "Strain", dataKey: "strainTrend", colorKey: "strain" },
  { id: "resp", title: "Respiratory rate", subtitle: "breaths/min during sleep", dataKey: "respiratoryRateTrend", colorKey: "resp", decimals: 1 },
  { id: "spo2", title: "SpO2 average", dataKey: "spo2Trend", colorKey: "spo2", decimals: 1, unit: "%" },
  { id: "stress", title: "Stress", dataKey: "stressTrend", colorKey: "stress" },
  { id: "training", title: "Training load", subtitle: "acute:chronic ratio — sweet spot 0.8–1.3", dataKey: "trainingLoadTrend", colorKey: "training", decimals: 2 },
]

function trendBadge(trend: "improving" | "declining" | "stable" | null) {
  if (trend === "improving")
    return (
      <span className="eyebrow text-[var(--accent-lime)] bg-[rgba(187,255,56,0.12)] px-1.5 py-0.5 rounded-full">
        improving
      </span>
    )
  if (trend === "declining")
    return (
      <span className="eyebrow text-[var(--accent-magenta)] bg-[rgba(255,45,110,0.12)] px-1.5 py-0.5 rounded-full">
        declining
      </span>
    )
  if (trend === "stable")
    return (
      <span className="eyebrow text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded-full">
        stable
      </span>
    )
  return (
    <span className="eyebrow text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded-full">
      —
    </span>
  )
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
  const chartOrder = CHART_DEFS

  const chartHeight = compact ? 90 : 180

  const hrvDelta = useMemo(() => {
    if (!summaries?.hrv.current || !summaries?.hrv.weekAgo) return null
    return summaries.hrv.current - summaries.hrv.weekAgo
  }, [summaries])
  const rhrDelta = useMemo(() => {
    if (!summaries?.restingHr.current || !summaries?.restingHr.weekAgo) return null
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
    <div className="space-y-20">
      {/* Cover — masthead with range controls */}
      <SectionHead
        n="00"
        kicker={`${trends?.dataPoints ?? 0} nights in the last ${rangeDays} days. Hover any chart for exact values; drag a chart to reorder.`}
        meta={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Switch
                id="compact-toggle"
                checked={compact}
                onCheckedChange={setCompact}
                size="sm"
              />
              <Label
                htmlFor="compact-toggle"
                className="eyebrow text-muted-foreground cursor-pointer"
              >
                compact
              </Label>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(rangeDays)}
              onValueChange={(v) => v && onRangeChange(Number(v))}
            >
              {RANGE_OPTIONS.map((r) => (
                <ToggleGroupItem
                  key={r.days}
                  value={String(r.days)}
                  aria-label={r.label}
                >
                  {r.short}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <RunPipelineMenu
              busy={busy}
              variant="ghost"
              label="rerun"
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
        }
      >
        Trends
      </SectionHead>

      {/* Chapter 01 — Week over week summary */}
      <section>
        <SectionHead n={1} kicker="The three signals at a glance.">
          Week over week
        </SectionHead>
        <div className="mt-6 grid grid-cols-3 gap-x-8 gap-y-6">
          <SummaryStat
            label="HRV (RMSSD)"
            value={formatNumber(summaries?.hrv.current, 1)}
            accent="magenta"
            sub={
              hrvDelta != null
                ? `${hrvDelta > 0 ? "+" : ""}${hrvDelta.toFixed(1)} vs week ago`
                : "—"
            }
            trend={summaries?.hrv.trend ?? null}
          />
          <SummaryStat
            label="Resting HR"
            value={formatNumber(summaries?.restingHr.current, 0)}
            accent="lime"
            sub={
              rhrDelta != null
                ? `${rhrDelta > 0 ? "+" : ""}${rhrDelta.toFixed(0)} bpm vs week ago`
                : "—"
            }
            trend={summaries?.restingHr.trend ?? null}
          />
          <SummaryStat
            label="Sleep avg"
            value={
              summaries?.sleepDuration.avgHours != null
                ? `${formatNumber(summaries.sleepDuration.avgHours, 1)}h`
                : "—"
            }
            accent="cyan"
            sub={`${summaries?.sleepDuration.nights ?? 0} nights`}
          />
        </div>
      </section>

      {/* Chapter 02 — Small multiples */}
      <section>
        <SectionHead
          n={2}
        >
          Small multiples
        </SectionHead>
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8">
          {chartOrder.map((c) => (
            <TrendChart
              key={c.id}
              title={c.title}
              subtitle={c.subtitle}
              data={trends?.[c.dataKey] ?? []}
              color={CHART_COLORS[c.colorKey]}
              unit={c.unit}
              decimals={c.decimals}
              {...sharedProps}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: "improving" | "declining" | "stable" | null
  accent?: AccentKey
}) {
  const accentText: Record<AccentKey, string> = {
    cyan: "text-[var(--accent-cyan)]",
    magenta: "text-[var(--accent-magenta)]",
    lime: "text-[var(--accent-lime)]",
    amber: "text-[var(--accent-amber)]",
  }
  const valueColor = accent ? accentText[accent] : "text-foreground"
  // Prefer the sub text as a directional chip when it contains a clear sign.
  const chipFromSub = (() => {
    if (!sub) return null
    if (sub.startsWith("+")) return { kind: "up" as const, text: sub }
    if (sub.startsWith("-") || sub.startsWith("−")) return { kind: "down" as const, text: sub }
    if (sub === "—") return null
    return null
  })()
  const showTrendBadge = trend != null
  return (
    <Card accent={accent}>
      <p className="eyebrow">{label}</p>
      <span
        className={`text-[1.875rem] leading-none tabular-nums tracking-tight font-bold ${valueColor}`}
      >
        {value}
      </span>
      {chipFromSub ? (
        <DeltaChip kind={chipFromSub.kind}>{chipFromSub.text}</DeltaChip>
      ) : sub ? (
        <p className="text-xs text-muted-foreground tabular-nums font-mono">{sub}</p>
      ) : null}
      {showTrendBadge && <div className="mt-1">{trendBadge(trend ?? null)}</div>}
    </Card>
  )
}
