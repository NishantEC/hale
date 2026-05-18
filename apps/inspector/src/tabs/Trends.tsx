import { useMemo, useState } from "react"

import type { PipelineRunOptions, TrendsView } from "../api"
import { Num, SectionHead } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { TrendChart } from "../components/TrendChart"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"
import { Switch } from "../components/ui/switch"
import { formatNumber } from "../format"
import { cn } from "@/lib/utils"

const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 60, label: "Last 60 days" },
  { days: 90, label: "Last 90 days" },
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

function trendBadge(trend: "improving" | "declining" | "stable" | null) {
  if (trend === "improving")
    return (
      <Badge className="bg-success/15 text-success border-transparent hover:bg-success/20">
        improving
      </Badge>
    )
  if (trend === "declining")
    return (
      <Badge className="bg-warning/15 text-warning border-transparent hover:bg-warning/20">
        declining
      </Badge>
    )
  if (trend === "stable")
    return <Badge variant="secondary">stable</Badge>
  return <Badge variant="secondary">—</Badge>
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
  const cardPadding = compact ? "py-3" : undefined

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

  const currentRangeLabel =
    RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label ?? `Last ${rangeDays} days`

  return (
    <div className="space-y-10">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {trends?.dataPoints ?? 0} nights in the last {rangeDays} days
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="compact-toggle"
              checked={compact}
              onCheckedChange={setCompact}
              size="sm"
            />
            <Label htmlFor="compact-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Compact
            </Label>
          </div>

          <Select
            value={String(rangeDays)}
            onValueChange={(v) => onRangeChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue>{currentRangeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.days} value={String(r.days)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

      {/* Summary cards */}
      <div>
        <SectionHead>Week-over-week</SectionHead>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Card className={cn("gap-3", cardPadding)}>
            <CardHeader className="px-5 pb-0 pt-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                HRV (RMSSD)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-0">
              <Num
                label="HRV (RMSSD)"
                value={formatNumber(summaries?.hrv.current, 1)}
                sub={
                  hrvDelta != null
                    ? `${hrvDelta > 0 ? "+" : ""}${hrvDelta.toFixed(1)} vs week ago`
                    : "—"
                }
              />
              <div className="mt-2">{trendBadge(summaries?.hrv.trend ?? null)}</div>
            </CardContent>
          </Card>

          <Card className={cn("gap-3", cardPadding)}>
            <CardHeader className="px-5 pb-0 pt-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Resting HR
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-0">
              <Num
                label="Resting HR"
                value={formatNumber(summaries?.restingHr.current, 0)}
                sub={
                  rhrDelta != null
                    ? `${rhrDelta > 0 ? "+" : ""}${rhrDelta.toFixed(0)} bpm vs week ago`
                    : "—"
                }
              />
              <div className="mt-2">{trendBadge(summaries?.restingHr.trend ?? null)}</div>
            </CardContent>
          </Card>

          <Card className={cn("gap-3", cardPadding)}>
            <CardHeader className="px-5 pb-0 pt-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Sleep avg
              </CardTitle>
              <CardDescription>
                {summaries?.sleepDuration.nights ?? 0} nights
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-0">
              <Num
                label="Sleep avg"
                value={
                  summaries?.sleepDuration.avgHours != null
                    ? `${formatNumber(summaries.sleepDuration.avgHours, 1)}h`
                    : "—"
                }
                sub={`${summaries?.sleepDuration.nights ?? 0} nights`}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Chart grid */}
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
