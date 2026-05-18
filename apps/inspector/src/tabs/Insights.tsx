import type {
  BaselineProfileRow,
  JournalCorrelation,
  SleepNight,
  TrendsView,
} from "../api"
import { SectionHead } from "../components/primitives"
import { AnimatedShinyText } from "../components/magicui/animated-shiny-text"
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table"
import { cn } from "@/lib/utils"
import { formatNumber } from "../format"
import { pickTopCorrelationSentence } from "../utils/correlations"

type DeltaTone = "good" | "bad" | "neutral"

type DeltaCard = {
  label: string
  unit: string
  current: number | null
  baseline: number | null
  tone: DeltaTone
  delta: number | null
  pctOfBaseline: number | null
  hint: string
}

function classify(
  delta: number | null,
  direction: "lowerIsBetter" | "higherIsBetter",
  threshold = 0,
): DeltaTone {
  if (delta == null) return "neutral"
  if (Math.abs(delta) <= threshold) return "neutral"
  const goodSign = direction === "higherIsBetter" ? 1 : -1
  return delta * goodSign > 0 ? "good" : "bad"
}

function buildDeltas(
  sleep: SleepNight | null,
  baseline: BaselineProfileRow | null,
): DeltaCard[] {
  const feat = sleep?.selectedNightFeature ?? null
  const det = sleep?.selectedDetection ?? null

  const pct = (cur: number | null, base: number | null) =>
    cur != null && base != null && base !== 0
      ? ((cur - base) / base) * 100
      : null
  const diff = (cur: number | null, base: number | null) =>
    cur != null && base != null ? cur - base : null

  const cards: DeltaCard[] = [
    {
      label: "HRV (RMSSD)",
      unit: " ms",
      current: feat?.rmssd ?? null,
      baseline: baseline?.rmssd ?? null,
      delta: diff(feat?.rmssd ?? null, baseline?.rmssd ?? null),
      pctOfBaseline: pct(feat?.rmssd ?? null, baseline?.rmssd ?? null),
      tone: classify(
        diff(feat?.rmssd ?? null, baseline?.rmssd ?? null),
        "higherIsBetter",
        1,
      ),
      hint: "Higher than baseline → autonomic balance trending well.",
    },
    {
      label: "Resting HR",
      unit: " bpm",
      current: feat?.restingHeartRate ?? null,
      baseline: baseline?.restingHeartRate ?? null,
      delta: diff(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
      pctOfBaseline: pct(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
      tone: classify(
        diff(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
        "lowerIsBetter",
        1,
      ),
      hint: "Lower is generally better. Elevated RHR can flag illness or training stress.",
    },
    {
      label: "SDNN",
      unit: " ms",
      current: feat?.sdnn ?? null,
      baseline: baseline?.sdnn ?? null,
      delta: diff(feat?.sdnn ?? null, baseline?.sdnn ?? null),
      pctOfBaseline: pct(feat?.sdnn ?? null, baseline?.sdnn ?? null),
      tone: classify(
        diff(feat?.sdnn ?? null, baseline?.sdnn ?? null),
        "higherIsBetter",
        1,
      ),
      hint: "SD of all NN intervals — overall HRV including circadian variability.",
    },
    {
      label: "Sleep duration",
      unit: "h",
      current: det?.durationHours ?? null,
      baseline: null,
      delta: null,
      pctOfBaseline: null,
      tone: "neutral",
      hint: "Compare to your sleep plan target — see the planner.",
    },
  ]

  return cards
}

export function InsightsTab({
  sleep,
  baseline,
  trends,
  journalCorrelations,
}: {
  sleep: SleepNight | null
  baseline: BaselineProfileRow | null
  trends: TrendsView | null
  journalCorrelations: JournalCorrelation[]
}) {
  const cards = buildDeltas(sleep, baseline)
  const ranked = [...cards].sort((a, b) => {
    const av = Math.abs(a.pctOfBaseline ?? 0)
    const bv = Math.abs(b.pctOfBaseline ?? 0)
    return bv - av
  })
  const headline = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  const correlationHeadline = pickTopCorrelationSentence(journalCorrelations)

  return (
    <div className="space-y-10 max-w-6xl">
      {correlationHeadline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Strongest journal correlation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedShinyText className="text-foreground text-[17px] leading-snug mx-0 max-w-none">
              {correlationHeadline}
            </AnimatedShinyText>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Why is today different?</SectionHead>
          {baseline ? (
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              baseline · {baseline.nightsUsed} nights
            </span>
          ) : (
            <Badge variant="secondary">baseline not yet warmed up</Badge>
          )}
        </div>
        {!sleep?.selectedNightFeature ? (
          <Alert>
            <AlertTitle>No night selected</AlertTitle>
            <AlertDescription>
              No night selected for this date — nothing to compare yet.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              {headline.map((c) => (
                <DeltaTile key={c.label} card={c} />
              ))}
            </div>
            {rest.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                {rest.map((c) => (
                  <DeltaTile key={c.label} card={c} compact />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Week-over-week direction</SectionHead>
          <span className="text-muted-foreground text-xs">
            from /views/trends summaries
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <DirectionCard
            label="HRV"
            current={trends?.summaries.hrv.current ?? null}
            weekAgo={trends?.summaries.hrv.weekAgo ?? null}
            trend={trends?.summaries.hrv.trend ?? null}
            direction="higherIsBetter"
            unit=" ms"
            decimals={1}
          />
          <DirectionCard
            label="Resting HR"
            current={trends?.summaries.restingHr.current ?? null}
            weekAgo={trends?.summaries.restingHr.weekAgo ?? null}
            trend={trends?.summaries.restingHr.trend ?? null}
            direction="lowerIsBetter"
            unit=" bpm"
            decimals={0}
          />
          <DirectionCard
            label="Avg sleep duration"
            current={trends?.summaries.sleepDuration.avgHours ?? null}
            weekAgo={null}
            trend={null}
            direction="neutral"
            unit="h"
            decimals={1}
          />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Journal factor correlations</SectionHead>
          <span className="text-muted-foreground text-xs">
            from /debug/pipeline-results
          </span>
        </div>
        {journalCorrelations.length === 0 ? (
          <Alert>
            <AlertTitle>No correlations yet</AlertTitle>
            <AlertDescription>
              No journal entries yet, or not enough samples per factor to draw a
              correlation. Log a few nights' factors in the app and this will
              populate.
            </AlertDescription>
          </Alert>
        ) : (
          <Card className="gap-0 py-0">
            <CardHeader className="px-0 pt-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Factor", "Samples", "Δ Deep min", "Δ REM min", "Δ Duration h"].map(
                      (h) => (
                        <TableHead
                          key={h}
                          className="text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          {h}
                        </TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalCorrelations.map((c) => (
                    <TableRow key={c.factorTag}>
                      <TableCell className="font-medium">{c.factorTag}</TableCell>
                      <TableCell className="text-muted-foreground">{c.sampleCount}</TableCell>
                      <DeltaCell value={c.avgDeepDelta} higherBetter />
                      <DeltaCell value={c.avgRemDelta} higherBetter />
                      <DeltaCell value={c.avgDurationDelta} higherBetter />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}

function DeltaTile({ card, compact }: { card: DeltaCard; compact?: boolean }) {
  const borderClass =
    card.tone === "good"
      ? "border-success/40"
      : card.tone === "bad"
      ? "border-warning/40"
      : "border-border"

  const deltaTextClass =
    card.tone === "good"
      ? "text-success"
      : card.tone === "bad"
      ? "text-warning"
      : "text-muted-foreground"

  return (
    <Card className={cn("gap-2", borderClass, compact ? "" : "min-h-32")}>
      <CardHeader className="pb-0">
        <div className="flex items-baseline justify-between">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">{card.label}</p>
          {card.tone === "good" && (
            <Badge className="bg-success/15 text-success border-transparent">good</Badge>
          )}
          {card.tone === "bad" && (
            <Badge className="bg-warning/15 text-warning border-transparent">below baseline</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">
            {formatNumber(card.current, 1)}
          </span>
          <span className="text-muted-foreground text-sm">{card.unit}</span>
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          baseline {formatNumber(card.baseline, 1)}
          {card.delta != null && (
            <>
              {" · "}
              <span className={deltaTextClass}>
                {card.delta > 0 ? "+" : ""}
                {card.delta.toFixed(1)}
                {card.pctOfBaseline != null && (
                  <> ({card.pctOfBaseline > 0 ? "+" : ""}{card.pctOfBaseline.toFixed(0)}%)</>
                )}
              </span>
            </>
          )}
        </p>
        {!compact && (
          <p className="text-muted-foreground text-xs mt-2 leading-snug">{card.hint}</p>
        )}
      </CardContent>
    </Card>
  )
}

function DirectionCard({
  label,
  current,
  weekAgo,
  trend,
  direction,
  unit,
  decimals,
}: {
  label: string
  current: number | null
  weekAgo: number | null
  trend: "improving" | "declining" | "stable" | null
  direction: "lowerIsBetter" | "higherIsBetter" | "neutral"
  unit: string
  decimals: number
}) {
  const delta = current != null && weekAgo != null ? current - weekAgo : null

  const trendBadge = () => {
    if (trend === "improving")
      return <Badge className="bg-success/15 text-success border-transparent">improving</Badge>
    if (trend === "declining")
      return <Badge className="bg-warning/15 text-warning border-transparent">declining</Badge>
    if (trend === "stable")
      return <Badge variant="secondary">stable</Badge>
    if (trend == null && direction !== "neutral")
      return <Badge variant="outline">not enough data</Badge>
    return null
  }

  return (
    <Card className="gap-2">
      <CardHeader className="pb-0">
        <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">
            {formatNumber(current, decimals)}
          </span>
          <span className="text-muted-foreground text-sm">{unit}</span>
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          {delta != null
            ? `${delta > 0 ? "+" : ""}${delta.toFixed(decimals)}${unit} vs week ago`
            : "—"}
        </p>
        <div className="mt-2">{trendBadge()}</div>
      </CardContent>
    </Card>
  )
}

function DeltaCell({
  value,
  higherBetter,
}: {
  value: number
  higherBetter: boolean
}) {
  if (!Number.isFinite(value))
    return <TableCell className="text-muted-foreground">—</TableCell>
  const tone = value > 0 === higherBetter ? "text-success" : "text-warning"
  return (
    <TableCell className={cn("font-medium", tone)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}
    </TableCell>
  )
}
