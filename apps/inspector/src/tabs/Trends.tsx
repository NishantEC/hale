import { useMemo, useState } from "react"

import type { PipelineRunOptions, TrendsView } from "../api"
import { Num, SectionHead } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { TrendChart } from "../components/TrendChart"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Sortable, SortableContent, SortableItem } from "../components/ui/sortable"
import { Switch } from "../components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { formatNumber } from "../format"
import { cn } from "@/lib/utils"

const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days", short: "7d" },
  { days: 14, label: "Last 14 days", short: "14d" },
  { days: 30, label: "Last 30 days", short: "30d" },
  { days: 60, label: "Last 60 days", short: "60d" },
  { days: 90, label: "Last 90 days", short: "90d" },
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

const ORDER_KEY = "noop.trendsChartOrder"

function loadChartOrder(): ChartDef[] {
  if (typeof window === "undefined") return CHART_DEFS
  try {
    const stored = localStorage.getItem(ORDER_KEY)
    if (!stored) return CHART_DEFS
    const ids = JSON.parse(stored) as string[]
    if (!Array.isArray(ids)) return CHART_DEFS
    const byId = new Map(CHART_DEFS.map((c) => [c.id, c]))
    const ordered = ids.map((id) => byId.get(id)).filter((c): c is ChartDef => c != null)
    // Append any newly-added charts not yet in the stored order
    for (const c of CHART_DEFS) if (!ids.includes(c.id)) ordered.push(c)
    return ordered.length === CHART_DEFS.length ? ordered : CHART_DEFS
  } catch {
    return CHART_DEFS
  }
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
  const [chartOrder, setChartOrder] = useState<ChartDef[]>(() => loadChartOrder())

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

  return (
    <div className="space-y-6 max-w-6xl">
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

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(rangeDays)}
            onValueChange={(v) => v && onRangeChange(Number(v))}
          >
            {RANGE_OPTIONS.map((r) => (
              <ToggleGroupItem key={r.days} value={String(r.days)} aria-label={r.label}>
                {r.short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

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

      {/* Chart grid — drag-reorderable via DiceUI Sortable */}
      <Sortable
        value={chartOrder}
        onValueChange={(next) => {
          const ids = next.map((c) => c.id)
          setChartOrder(next)
          localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
        }}
        orientation="mixed"
        getItemValue={(item) => item.id}
      >
        <SortableContent className="grid grid-cols-2 gap-6">
          {chartOrder.map((c) => (
            <SortableItem key={c.id} value={c.id} asChild>
              <div className="cursor-grab active:cursor-grabbing">
                <TrendChart
                  title={c.title}
                  subtitle={c.subtitle}
                  data={trends?.[c.dataKey] ?? []}
                  color={CHART_COLORS[c.colorKey]}
                  unit={c.unit}
                  decimals={c.decimals}
                  {...sharedProps}
                />
              </div>
            </SortableItem>
          ))}
        </SortableContent>
      </Sortable>
    </div>
  )
}
