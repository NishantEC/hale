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
import { formatTimestamp, relativeTime } from "../format"

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

  // ── Pipeline status pill ──
  const pipeline = computePipelineStatus(pipelineState, () => onRunPipeline({ day: date }))
  // ── Strap signal pill ──
  const strap = computeStrapStatus(overview)
  // ── Selected night pill ──
  const night = computeNightStatus(sleep, sleepView, date, () => onRunPipeline({ day: date }))

  // ── Metric chips ──
  const features = sleep?.selectedNightFeature
  const detection = sleep?.selectedDetection
  const hrvSeries = trends?.hrvTrend?.map((p) => p.value) ?? []
  const rhrSeries = trends?.restingHrTrend?.map((p) => p.value) ?? []
  const durationSeries = trends?.sleepDurationTrend?.map((p) => p.value) ?? []
  const respSeries = trends?.respiratoryRateTrend?.map((p) => p.value) ?? []

  const chips = [
    {
      label: "Duration",
      value: detection?.durationHours ?? null,
      unit: "h",
      avg14d: avgOfLastN(durationSeries, 14),
      baseline: null,
    },
    {
      label: "HRV (RMSSD)",
      value: features?.rmssd ?? null,
      unit: "ms",
      avg14d: avgOfLastN(hrvSeries, 14),
      baseline: baseline?.rmssd ?? null,
    },
    {
      label: "Resting HR",
      value: features?.restingHeartRate ?? null,
      unit: "bpm",
      avg14d: avgOfLastN(rhrSeries, 14),
      baseline: baseline?.restingHeartRate ?? null,
    },
    {
      label: "Respiratory",
      value: features?.respiratoryRate ?? null,
      unit: "rpm",
      avg14d: avgOfLastN(respSeries, 14),
      baseline: null,
    },
  ]

  // ── Sync trail ──
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

  // ── Journal correlation headline ──
  const topCorrelation = pickTopCorrelation(journalCorrelations)

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Hero status row */}
      <div className="grid grid-cols-3 gap-3">
        <StatusBadge tone={pipeline.tone} label={pipeline.label} detail={pipeline.detail} action={pipeline.action} size="lg" />
        <StatusBadge tone={strap.tone} label={strap.label} detail={strap.detail} size="lg" />
        <StatusBadge tone={night.tone} label={night.label} detail={night.detail} action={night.action} size="lg" />
      </div>

      {/* Last-night card */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <SectionHead>Last night · {sleep?.selectedNightDate ?? date}</SectionHead>
          {detection?.confidence != null && (
            <span className="text-text-2 text-xs">
              confidence {(detection.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {sleep?.epochTimeline && sleep.epochTimeline.length > 0 ? (
          <div className="bg-surface-1 rounded-xl p-4 border border-border">
            <Hypnogram epochs={sleep.epochTimeline} height={140} />
          </div>
        ) : (
          <div className="bg-surface-1 rounded-xl p-6 border border-border text-text-2 text-sm">
            No sleep detection for {date}. The strap may not have been worn, or the pipeline
            hasn't yet processed this night.
          </div>
        )}

        {topCorrelation && (
          <p className="text-text-1 text-[15px] mt-4 leading-relaxed">
            {topCorrelation}
          </p>
        )}

        <div className="grid grid-cols-4 gap-3 mt-4">
          {chips.map((c) => (
            <MetricChip key={c.label} {...c} />
          ))}
        </div>
      </section>

      {/* Sync trail */}
      <section>
        <SectionHead>Sync trail</SectionHead>
        <div className="mt-3">
          <SyncTrail nodes={trailNodes} />
        </div>
      </section>

      {/* Details disclosure */}
      <section>
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2 text-text-2 hover:text-text-0 transition-colors">
              <span className="text-xs uppercase tracking-widest font-semibold">Details</span>
              <span className="text-[10px] group-open:rotate-90 transition-transform">›</span>
            </div>
          </summary>

          <div className="mt-4 space-y-8">
            <div className="grid grid-cols-4 gap-8">
              <Num
                label="Sensor records (all time)"
                value={overview?.counts.rawRecordCount ?? 0}
                sub={`Day: ${overview?.counts.selectedDayRawRecordCount ?? 0}`}
                status={!overview?.counts.rawRecordCount ? "error" : undefined}
              />
              <Num
                label="Sleep detections"
                value={overview?.counts.sleepDetectionCount ?? 0}
                sub={`mode: ${overview?.selectionMode ?? "—"}`}
                status={!overview?.counts.sleepDetectionCount ? "warn" : undefined}
              />
              <Num
                label="Sleep stages"
                value={overview?.counts.sleepStageCount ?? 0}
                sub={`${overview?.selectedEntities.epochTimelineCount ?? 0} epoch windows`}
                status={!overview?.counts.sleepStageCount ? "warn" : undefined}
              />
              <Num
                label="Daily scores"
                value={overview?.counts.dailyScoreCount ?? 0}
                sub={`last run: ${overview?.lastPipelineRunStatus ?? "—"}`}
                status={!overview?.counts.dailyScoreCount ? "error" : undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-12">
              <div>
                <SectionHead>Sync state</SectionHead>
                <div className="mt-3">
                  <Row k="Night selection mode" v={overview?.selectionMode ?? "—"} dense />
                  <Row k="Selected night" v={overview?.selectedNightDate ?? "—"} dense />
                  <Row k="Earliest raw" v={formatTimestamp(overview?.earliestRawTimestamp)} dense />
                  <Row k="Latest raw" v={formatTimestamp(overview?.latestRawTimestamp)} dense />
                  <Row
                    k="Sleep plan last updated"
                    v={formatTimestamp(overview?.latestSyncMetadata.lastSleepPlanUpdateAt)}
                    dense
                  />
                  <Row k="Reason" v={overview?.selectionReason ?? "—"} dense />
                </div>
              </div>
              <div>
                <SectionHead>App views</SectionHead>
                <div className="mt-3">
                  <Row k="Home headline" v={homeView?.todayOverview.headline ?? "—"} dense />
                  <Row
                    k="Recommendation"
                    v={homeView?.cards.recommendation.title ?? "—"}
                    dense
                  />
                  <Row
                    k="Sleep view"
                    v={sleepView?.emptyState.isEmpty ? "empty" : "populated"}
                    dense
                  />
                  <Row
                    k="Bed → Wake"
                    v={
                      sleepView
                        ? `${sleepView.header.bedtime} → ${sleepView.header.wakeTime}`
                        : "—"
                    }
                    dense
                  />
                  <Row k="Duration" v={sleepView?.header.duration ?? "—"} dense />
                  <Row k="Insight" v={sleepView?.sleepInsight ?? "—"} dense />
                </div>
              </div>
            </div>

            <div className="text-xs text-text-2 flex items-center gap-2">
              <span>Pipeline:</span>
              <Pill tone={pipeline.tone === "ok" ? "green" : pipeline.tone === "warn" ? "yellow" : pipeline.tone === "error" ? "red" : "neutral"}>
                {pipeline.label}
              </Pill>
              <span className="text-text-2">
                {pipelineState?.state?.lastRunAt ? `· ran ${relativeTime(pipelineState.state.lastRunAt)}` : ""}
              </span>
            </div>
          </div>
        </details>
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

function pickTopCorrelation(corrs: JournalCorrelation[]): string | null {
  const ranked = [...corrs]
    .map((c) => ({
      c,
      effect: Math.max(Math.abs(c.avgDeepDelta), Math.abs(c.avgRemDelta), Math.abs(c.avgDurationDelta / 60)),
    }))
    .filter((x) => x.effect > 0.3 && x.c.sampleCount >= 3)
    .sort((a, b) => b.effect - a.effect)
  if (ranked.length === 0) return null
  const { c } = ranked[0]
  const candidates: { metric: string; delta: number; unit: string }[] = [
    { metric: "deep sleep", delta: c.avgDeepDelta, unit: "min" },
    { metric: "REM", delta: c.avgRemDelta, unit: "min" },
    { metric: "sleep duration", delta: c.avgDurationDelta, unit: "min" },
  ]
  const top = candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
  const direction = top.delta >= 0 ? "more" : "less"
  const magnitude = Math.abs(Math.round(top.delta))
  return `On nights tagged "${c.factorTag}", you get ${magnitude} ${top.unit} ${direction} ${top.metric} on average (n=${c.sampleCount}).`
}
