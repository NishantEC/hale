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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../components/ui/hover-card"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "../format"
import { pickTopCorrelationSentence } from "../utils/correlations"

// ── Metric definition map ────────────────────────────────────────────────────

type MetricDef = { name: string; definition: string; range: string; interpretation: string }

const METRIC_DEFS: Record<string, MetricDef> = {
  "HRV (RMSSD)": {
    name: "HRV — RMSSD",
    definition:
      "Root Mean Square of Successive Differences between adjacent RR intervals. Reflects parasympathetic (rest-and-digest) nervous system tone measured during the last sleep stage before waking.",
    range: "Typical adult range 20–80 ms; highly individual.",
    interpretation:
      "Higher than your personal baseline signals good autonomic recovery. A sustained drop often precedes illness or overtraining.",
  },
  "Resting HR": {
    name: "Resting Heart Rate",
    definition:
      "Average heart rate during the lowest-activity window of sleep, typically the deepest NREM stage. Captured from the wrist sensor.",
    range: "Healthy adults: 40–80 bpm.",
    interpretation:
      "Lower is generally better. An elevated RHR (+5–10 bpm above baseline) is an early signal of incomplete recovery, illness, or cardiovascular stress.",
  },
  SDNN: {
    name: "SDNN",
    definition:
      "Standard Deviation of all Normal-to-Normal RR intervals across the entire sleep recording. Reflects both short- and long-term HRV including circadian rhythm contributions.",
    range: "Typical range 40–150 ms; varies widely with age and fitness.",
    interpretation:
      "Complements RMSSD. SDNN captures slower oscillations (thermoregulation, respiration) that RMSSD misses. A higher value with stable RMSSD suggests good circadian entrainment.",
  },
  "Sleep duration": {
    name: "Sleep Duration",
    definition:
      "Total time from sleep onset to final wake, as detected by the algorithm. Includes all stages (NREM light, NREM deep, REM).",
    range: "Recommended: 7–9 h for adults.",
    interpretation:
      "Compare to your sleep plan target in the Planner tab. Chronic short sleep (<6 h) suppresses immune function and HRV. Oversleeping (>10 h) may indicate ongoing sleep debt payback.",
  },
}

const DIRECTION_DEFS: Record<string, MetricDef> = {
  HRV: {
    name: "HRV — Weekly Trend",
    definition:
      "7-day rolling average of nightly RMSSD compared to the prior 7-day window.",
    range: "No universal threshold — trend direction relative to your own baseline matters most.",
    interpretation:
      "Improving = autonomic recovery is trending positively. Declining = consider reducing training load or investigating sleep quality.",
  },
  "Resting HR": {
    name: "Resting Heart Rate — Weekly Trend",
    definition:
      "7-day rolling average of nightly resting HR versus the previous 7-day window.",
    range: "40–80 bpm is typical; trend direction is the key signal.",
    interpretation:
      "Declining (lower) trend is favorable. A rising trend sustained for 3+ days warrants attention.",
  },
  "Avg sleep duration": {
    name: "Average Sleep Duration",
    definition:
      "Mean nightly sleep duration over the current 7-day window.",
    range: "Adults: 7–9 h per night.",
    interpretation:
      "Reflects whether recent sleep quantity is adequate. No trend comparison is shown — use the Planner for target-based tracking.",
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

  return [
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
}

// ── Top-delta badge value for a correlation row ──────────────────────────────

function topDelta(c: JournalCorrelation): { label: string; value: number } {
  const candidates = [
    { label: "deep", value: c.avgDeepDelta },
    { label: "REM", value: c.avgRemDelta },
    { label: "dur", value: c.avgDurationDelta },
  ]
  return candidates.reduce((a, b) =>
    Math.abs(b.value) > Math.abs(a.value) ? b : a,
  )
}

// ── InfoButton (shared HoverCard trigger) ────────────────────────────────────

function InfoButton({ def }: { def: MetricDef }) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <h4 className="text-sm font-semibold mb-2">{def.name}</h4>
        <p className="text-xs text-muted-foreground">{def.definition}</p>
        <p className="text-xs text-muted-foreground mt-2">
          <span className="font-semibold text-foreground">Range:</span> {def.range}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{def.interpretation}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

// ── Main tab ─────────────────────────────────────────────────────────────────

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
    <div className="space-y-6 max-w-6xl">
      {correlationHeadline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
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

      {/* Delta tiles — "why is today different?" */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Why is today different?</SectionHead>
          {baseline ? (
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              baseline · {baseline.nightsUsed} nights
            </span>
          ) : (
            <Badge variant="secondary" title="baseline accumulates over the first 14 nights of sleep data">
              baseline not yet warmed up — needs 14 nights
            </Badge>
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

      {/* Week-over-week direction */}
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

      {/* Journal correlations accordion */}
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
              No journal entries yet, or fewer than 3 samples per factor — correlations require at least 3 matched nights per factor tag before they appear. Log a few nights' factors in the app and this will populate.
            </AlertDescription>
          </Alert>
        ) : (
          <Card className="py-0 gap-0">
            <Accordion type="single" collapsible>
              {journalCorrelations.map((c) => {
                const top = topDelta(c)
                const topTone =
                  top.value > 0 ? "bg-success/15 text-success border-transparent" : "bg-warning/15 text-warning border-transparent"
                return (
                  <AccordionItem key={c.factorTag} value={c.factorTag}>
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="font-medium text-sm truncate">{c.factorTag}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {c.sampleCount} nights
                        </Badge>
                        <Badge className={cn("shrink-0 text-xs", topTone)}>
                          {top.label} {top.value > 0 ? "+" : ""}{top.value.toFixed(1)}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4">
                      <div className="grid grid-cols-3 gap-x-6 gap-y-1 pt-1">
                        <CorrelationDeltaRow
                          label="Deep sleep"
                          value={c.avgDeepDelta}
                          unit=" min"
                        />
                        <CorrelationDeltaRow
                          label="REM sleep"
                          value={c.avgRemDelta}
                          unit=" min"
                        />
                        <CorrelationDeltaRow
                          label="Duration"
                          value={c.avgDurationDelta}
                          unit="h"
                          scale={1 / 60}
                          decimals={2}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Delta tile ────────────────────────────────────────────────────────────────

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

  const def = METRIC_DEFS[card.label]

  return (
    <Card className={cn("gap-3", borderClass, compact ? "" : "min-h-32")}>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wider truncate">
              {card.label}
            </p>
            {def && <InfoButton def={def} />}
          </div>
          {card.tone === "good" && (
            <Badge className="bg-success/15 text-success border-transparent shrink-0">good</Badge>
          )}
          {card.tone === "bad" && (
            <Badge className="bg-warning/15 text-warning border-transparent shrink-0">below baseline</Badge>
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

// ── Direction card ────────────────────────────────────────────────────────────

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
  const def = DIRECTION_DEFS[label]

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
        <div className="flex items-center gap-1.5">
          <p className="text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
          {def && <InfoButton def={def} />}
        </div>
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

// ── Accordion delta row ───────────────────────────────────────────────────────

function CorrelationDeltaRow({
  label,
  value,
  unit,
  scale = 1,
  decimals = 1,
}: {
  label: string
  value: number
  unit: string
  scale?: number
  decimals?: number
}) {
  if (!Number.isFinite(value)) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    )
  }
  const scaled = value * scale
  const tone = scaled > 0 ? "text-success" : "text-warning"
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", tone)}>
        {scaled > 0 ? "+" : ""}{scaled.toFixed(decimals)}{unit}
      </span>
    </div>
  )
}
