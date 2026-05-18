import { useState } from "react"
import { ChevronRight, Info } from "lucide-react"
import type {
  BaselineProfileRow,
  HomeView,
  JournalCorrelation,
  Overview,
  PipelineRunOptions,
  PipelineState,
  SleepNight,
  SleepView,
  TrendsView,
} from "../api"
import { Hypnogram } from "../components/Hypnogram"
import { MetricChip } from "../components/MetricChip"
import { Num, Pill, Row, SectionHead } from "../components/primitives"
import { StatusBadge, type StatusTone } from "../components/StatusBadge"
import { SyncTrail, type TrailNode } from "../components/SyncTrail"
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { formatDate, formatTimestamp, relativeTime } from "../format"
import { pickTopCorrelationSentence } from "../utils/correlations"

type HomeProps = {
  overview: Overview | null
  homeView: HomeView | null
  sleepView: SleepView | null
  sleep: SleepNight | null
  pipelineState: PipelineState | null
  baseline: BaselineProfileRow | null
  trends: TrendsView | null
  journalCorrelations: JournalCorrelation[]
  date: string
  onRunPipeline: (opts: PipelineRunOptions) => void
}

type MetricInfoProps = {
  title: string
  description: string
  range: string
  direction: "Higher is better" | "Lower is better" | "Stable is better"
}

function MetricInfo({ title, description, range, direction }: MetricInfoProps) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-help"
        >
          <Info className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
          <span>
            <span className="text-foreground font-medium">Range:</span> {range}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {direction}
          </Badge>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

const TIME_HOUR = 60 * 60 * 1000
const TIME_DAY = 24 * TIME_HOUR

function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Date.now() - t
}

function avgOfLastN(values: number[] | undefined, n: number): number | null {
  if (!values || values.length === 0) return null
  const last = values.slice(-n).filter((v) => Number.isFinite(v))
  if (last.length === 0) return null
  return last.reduce((a, b) => a + b, 0) / last.length
}

export function HomeTab(props: HomeProps) {
  const { overview, homeView, sleepView, sleep, pipelineState, baseline, trends, journalCorrelations, date, onRunPipeline } = props

  const [detailsOpen, setDetailsOpen] = useState(false)

  const pipeline = computePipelineStatus(pipelineState, () => onRunPipeline({ day: date }))
  const strap = computeStrapStatus(overview)
  const night = computeNightStatus(sleep, sleepView, date, () => onRunPipeline({ day: date }))

  const features = sleep?.selectedNightFeature
  const detection = sleep?.selectedDetection
  const hrvSeries = trends?.hrvTrend?.map((p) => p.value) ?? []
  const rhrSeries = trends?.restingHrTrend?.map((p) => p.value) ?? []
  const durationSeries = trends?.sleepDurationTrend?.map((p) => p.value) ?? []
  const respSeries = trends?.respiratoryRateTrend?.map((p) => p.value) ?? []

  const chips: Array<{
    label: string
    value: number | null
    unit: string
    avg14d: number | null
    baseline: number | null
    info: MetricInfoProps
  }> = [
    {
      label: "Duration",
      value: detection?.durationHours ?? null,
      unit: "h",
      avg14d: avgOfLastN(durationSeries, 14),
      baseline: null,
      info: {
        title: "Duration",
        description: "Total sleep time for the selected night, in hours.",
        range: "Adults typically 7-9 h",
        direction: "Higher is better",
      },
    },
    {
      label: "HRV (RMSSD)",
      value: features?.rmssd ?? null,
      unit: "ms",
      avg14d: avgOfLastN(hrvSeries, 14),
      baseline: baseline?.rmssd ?? null,
      info: {
        title: "HRV (RMSSD)",
        description:
          "Heart rate variability, root mean square of successive differences. Higher = better autonomic balance.",
        range: "20-100 ms in adults",
        direction: "Higher is better",
      },
    },
    {
      label: "Resting HR",
      value: features?.restingHeartRate ?? null,
      unit: "bpm",
      avg14d: avgOfLastN(rhrSeries, 14),
      baseline: baseline?.restingHeartRate ?? null,
      info: {
        title: "Resting HR",
        description: "Heart rate measured during the longest period of low motion + sleep.",
        range: "40-80 bpm",
        direction: "Lower is better",
      },
    },
    {
      label: "Respiratory",
      value: features?.respiratoryRate ?? null,
      unit: "rpm",
      avg14d: avgOfLastN(respSeries, 14),
      baseline: null,
      info: {
        title: "Respiratory",
        description: "Breaths per minute during sleep.",
        range: "12-20 rpm",
        direction: "Stable is better",
      },
    },
  ]

  const trailNodes: TrailNode[] = [
    {
      name: "Strap",
      detail: strap.detail,
      timestamp: overview?.latestRawTimestamp ?? null,
      tone: strap.tone,
    },
    {
      name: "Backend",
      detail: `${overview?.counts.rawRecordCount ?? 0} records stored`,
      timestamp: overview?.latestSyncMetadata.lastRawRecordAt ?? null,
      tone: overview?.latestRawTimestamp ? "ok" : "neutral",
    },
    {
      name: "Pipeline",
      detail: pipelineState?.state ? (pipelineState.isDirty ? "dirty" : "clean") : "never run",
      timestamp: pipelineState?.state?.lastRunAt ?? null,
      tone: pipeline.tone,
    },
    {
      name: "App view",
      detail: homeView?.todayOverview.headline ?? "no view",
      timestamp: overview?.latestSyncMetadata.lastSleepPlanUpdateAt ?? null,
      tone: homeView ? "ok" : "neutral",
    },
  ]

  const topCorrelation = pickTopCorrelationSentence(journalCorrelations)

  return (
    <div className="space-y-10">
      {/* Hero status row — three Field Manual status notes side by side */}
      <section className="grid grid-cols-3 gap-8">
        <StatusBadge tone={pipeline.tone} label={pipeline.label} detail={pipeline.detail} action={pipeline.action} size="lg" />
        <StatusBadge tone={strap.tone} label={strap.label} detail={strap.detail} size="lg" />
        <StatusBadge tone={night.tone} label={night.label} detail={night.detail} action={night.action} size="lg" />
      </section>

      {/* Chapter 01 — Hypnogram */}
      <section>
        <SectionHead
          n={1}
          kicker={
            detection
              ? `${detection.durationHours.toFixed(1)}h sleep · ${detection.bedtime ? new Date(detection.bedtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"} bed → ${detection.wakeTime ? new Date(detection.wakeTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"} wake`
              : undefined
          }
          meta={
            detection?.confidence != null
              ? `confidence ${(detection.confidence * 100).toFixed(0)}%`
              : undefined
          }
        >
          The night of{" "}
          <span className="font-display italic">
            {formatDate(sleep?.selectedNightDate ?? date)}
          </span>
        </SectionHead>
        <div className="mt-6">
          {sleep?.epochTimeline && sleep.epochTimeline.length > 0 ? (
            <Hypnogram epochs={sleep.epochTimeline} height={160} />
          ) : (
            <p className="text-muted-foreground text-sm py-4 italic">
              No sleep detection for {date}. The strap may not have been worn, or the
              pipeline hasn't yet processed this night.
            </p>
          )}
        </div>
      </section>

      {/* Editorial pull-quote — journal correlation. */}
      {topCorrelation && (
        <section className="rule-strong pt-4">
          <p className="eyebrow text-[var(--vermillion)] mb-3">a note from the data</p>
          <blockquote className="font-display text-[1.5rem] leading-snug max-w-[640px] text-foreground">
            <AnimatedShinyText className="text-inherit leading-inherit max-w-none">
              {topCorrelation}
            </AnimatedShinyText>
          </blockquote>
        </section>
      )}

      {/* Chapter 02 — Night metrics */}
      <section>
        <SectionHead n={2} kicker="Vitals at the time the strap was worn.">
          Night metrics
        </SectionHead>
        <div className="mt-6 grid grid-cols-4 gap-x-8 gap-y-6">
          {chips.map((c) => (
            <div key={c.label} className="relative">
              <MetricChip label={c.label} value={c.value} unit={c.unit} avg14d={c.avg14d} baseline={c.baseline} />
              <div className="absolute top-0 right-0">
                <MetricInfo {...c.info} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Chapter 03 — Sync trail */}
      <section>
        <SectionHead n={3} kicker="Where the data sits across the pipeline.">
          Sync trail
        </SectionHead>
        <div className="mt-6">
          <SyncTrail nodes={trailNodes} />
        </div>
      </section>

      {/* Appendix */}
      <section className="rule-hair pt-4">
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 eyebrow text-muted-foreground hover:text-foreground transition-colors">
            <span>Appendix</span>
            <ChevronRight
              className={cn("h-3 w-3 transition-transform duration-200", detailsOpen && "rotate-90")}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-6 space-y-8">
            <div className="grid grid-cols-4 gap-x-8">
              <Num
                label="Sensor records (all)"
                value={overview?.counts.rawRecordCount ?? 0}
                sub={`Day · ${overview?.counts.selectedDayRawRecordCount ?? 0}`}
                size="md"
                status={!overview?.counts.rawRecordCount ? "error" : undefined}
              />
              <Num
                label="Sleep detections"
                value={overview?.counts.sleepDetectionCount ?? 0}
                sub={`mode · ${overview?.selectionMode ?? "—"}`}
                size="md"
                status={!overview?.counts.sleepDetectionCount ? "warn" : undefined}
              />
              <Num
                label="Sleep stages"
                value={overview?.counts.sleepStageCount ?? 0}
                sub={`${overview?.selectedEntities.epochTimelineCount ?? 0} epoch windows`}
                size="md"
                status={!overview?.counts.sleepStageCount ? "warn" : undefined}
              />
              <Num
                label="Daily scores"
                value={overview?.counts.dailyScoreCount ?? 0}
                sub={`last run · ${overview?.lastPipelineRunStatus ?? "—"}`}
                size="md"
                status={!overview?.counts.dailyScoreCount ? "error" : undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-12">
              <div>
                <p className="eyebrow text-muted-foreground mb-3 rule-strong pt-3">Sync state</p>
                <Row k="Selection mode" v={overview?.selectionMode ?? "—"} dense />
                <Row k="Selected night" v={overview?.selectedNightDate ?? "—"} dense />
                <Row k="Earliest raw" v={formatTimestamp(overview?.earliestRawTimestamp)} dense />
                <Row k="Latest raw" v={formatTimestamp(overview?.latestRawTimestamp)} dense />
                <Row k="Sleep plan updated" v={formatTimestamp(overview?.latestSyncMetadata.lastSleepPlanUpdateAt)} dense />
                <Row k="Reason" v={overview?.selectionReason ?? "—"} dense />
              </div>
              <div>
                <p className="eyebrow text-muted-foreground mb-3 rule-strong pt-3">App views</p>
                <Row k="Home headline" v={homeView?.todayOverview.headline ?? "—"} dense />
                <Row k="Recommendation" v={homeView?.cards.recommendation.title ?? "—"} dense />
                <Row k="Sleep view" v={sleepView?.emptyState.isEmpty ? "empty" : "populated"} dense />
                <Row
                  k="Bed → Wake"
                  v={sleepView ? `${sleepView.header.bedtime} → ${sleepView.header.wakeTime}` : "—"}
                  dense
                />
                <Row k="Duration" v={sleepView?.header.duration ?? "—"} dense />
                <Row k="Insight" v={sleepView?.sleepInsight ?? "—"} dense />
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-2 italic">
              <span>Pipeline</span>
              <Pill tone={pipeline.tone === "ok" ? "green" : pipeline.tone === "warn" ? "yellow" : pipeline.tone === "error" ? "red" : "neutral"}>
                {pipeline.label}
              </Pill>
              <span>
                {pipelineState?.state?.lastRunAt ? `· ran ${relativeTime(pipelineState.state.lastRunAt)}` : ""}
              </span>
            </p>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </div>
  )
}

// ── Status computation ─────────────────────────────────────────

function computePipelineStatus(
  state: PipelineState | null,
  onRun: () => void,
): { tone: StatusTone; label: string; detail: string; action?: { label: string; onClick: () => void } } {
  if (!state) return { tone: "neutral", label: "Pipeline: —", detail: "Loading state…" }
  if (!state.state) {
    return {
      tone: "error",
      label: "Pipeline: never run",
      detail: "Scores and stages will be empty until you run it.",
      action: { label: "Run", onClick: onRun },
    }
  }
  if (state.isDirty) {
    return {
      tone: "warn",
      label: "Pipeline: dirty",
      detail: "Inputs changed since the last run.",
      action: { label: "Run", onClick: onRun },
    }
  }
  const lastRun = state.state.lastRunAt
  return {
    tone: "ok",
    label: "Pipeline: clean",
    detail: lastRun ? `Ran ${relativeTime(lastRun)}` : "All inputs consumed",
  }
}

function computeStrapStatus(overview: Overview | null): {
  tone: StatusTone
  label: string
  detail: string
} {
  const age = ageMs(overview?.latestRawTimestamp)
  if (age == null) return { tone: "neutral", label: "Strap: no data", detail: "No sensor records yet" }
  if (age < TIME_HOUR) {
    return { tone: "ok", label: "Strap: active", detail: `latest ${relativeTime(overview!.latestRawTimestamp!)}` }
  }
  // Fresh uploads + stale record timestamps = drainer is grinding through a
  // strap-flash backlog FIFO, filling earlier-strap-time gaps. The strap is
  // not silent; the dashboard would just say so before this branch existed.
  const uploadAge = ageMs(overview?.latestRawUpdatedAt)
  if (uploadAge != null && uploadAge < 10 * 60 * 1000) {
    return {
      tone: "warn",
      label: "Strap: catching up",
      detail: `upload ${relativeTime(overview!.latestRawUpdatedAt!)} · records ${Math.round(
        age / TIME_HOUR,
      )}h behind`,
    }
  }
  if (age < 6 * TIME_HOUR) {
    return {
      tone: "warn",
      label: "Strap: idle",
      detail: `latest ${relativeTime(overview!.latestRawTimestamp!)}`,
    }
  }
  if (age < TIME_DAY) {
    return {
      tone: "warn",
      label: "Strap: stale",
      detail: `${Math.round(age / TIME_HOUR)}h since last record`,
    }
  }
  return {
    tone: "error",
    label: "Strap: silent",
    detail: `${Math.round(age / TIME_DAY)}d since last record`,
  }
}

function computeNightStatus(
  sleep: SleepNight | null,
  sleepView: SleepView | null,
  date: string,
  onRerun: () => void,
): {
  tone: StatusTone
  label: string
  detail: string
  action?: { label: string; onClick: () => void }
} {
  if (!sleep) return { tone: "neutral", label: "Night: —", detail: "Loading…" }
  if (!sleep.selectedDetection) {
    return {
      tone: "warn",
      label: `Night: no detection`,
      detail: `Nothing classified for ${date}.`,
      action: { label: "Rerun", onClick: onRerun },
    }
  }
  const detection = sleep.selectedDetection
  const dur = detection.durationHours.toFixed(1)
  const bed = detection.bedtime ? new Date(detection.bedtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"
  const wake = detection.wakeTime ? new Date(detection.wakeTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"
  return {
    tone: "ok",
    label: `Night: ${dur}h`,
    detail: `${bed} → ${wake}${sleepView?.emptyState.isEmpty ? " · app view empty" : ""}`,
  }
}
