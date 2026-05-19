import { Info, Moon } from "lucide-react"

import type { PipelineRunOptions, RawRecords, SleepNight } from "../api"
import { DayTimeline } from "../components/DayTimeline"
import { HYPNOGRAM_STAGES, Hypnogram } from "../components/Hypnogram"
import { Num, Row, SectionHead } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { StageHrScatter } from "../components/StageHrScatter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { formatDate, formatNumber, formatTimestamp } from "../format"
import { useScrubController } from "../hooks/useScrubController"

type Direction = "Higher is better" | "Lower is better" | "Stable is better"

function SleepHoverValue({
  value,
  title,
  description,
  range,
  direction,
}: {
  value: string
  title: string
  description: string
  range: string
  direction: Direction
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{value}</span>
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
    </span>
  )
}

export function SleepTab({
  sleep,
  epochs,
  raw,
  selectedDate,
  onRunPipeline,
  busy,
}: {
  sleep: SleepNight | null
  epochs: Array<{ timestamp: string; stage: string }>
  raw: RawRecords | null
  selectedDate: string
  onRunPipeline: (opts: PipelineRunOptions) => void | Promise<void>
  busy: boolean
}) {
  const { cursorMs, setCursorMs } = useScrubController()

  const nightDay = sleep?.selectedNightDate ? sleep.selectedNightDate.slice(0, 10) : selectedDate

  const empty = !sleep?.selectedDetection

  return (
    <div className="space-y-20">
      <SectionHead
        n="00"
        meta={
          <RunPipelineMenu
            busy={busy}
            variant="ghost"
            label="rerun night"
            onRun={onRunPipeline}
            presets={[
              { kind: "day", day: nightDay, label: `Rerun ${nightDay} only` },
              { kind: "lastDays", days: 7, label: "Rerun last 7 days" },
              { kind: "full", label: "Rerun full (last 45 days)" },
            ]}
          />
        }
        kicker={
          empty
            ? "No sleep detection on this date. Try another or rerun the pipeline."
            : "All measurements taken during the longest detected sleep window."
        }
      >
        Night of{" "}
        <span className="font-medium">
          {formatDate(sleep?.selectedNightDate ?? selectedDate)}
        </span>
      </SectionHead>

      {empty && (
        <Alert>
          <Moon className="size-4" />
          <AlertTitle>No sleep detection</AlertTitle>
          <AlertDescription>
            No sleep detection for {selectedDate}. Try a different date, or rerun the
            pipeline for this night.
          </AlertDescription>
        </Alert>
      )}

      {/* Vitals masthead */}
      <section className="grid grid-cols-4 gap-x-4 gap-y-4">
        <Card accent="cyan">
          <Num
            label="Duration"
            value={`${formatNumber(sleep?.selectedDetection?.durationHours, 1)}h`}
            sub="total sleep"
            accent="cyan"
            size="md"
            status={empty ? "stale" : undefined}
          />
        </Card>
        <Card accent="lime">
          <Num
            label="Resting HR"
            value={formatNumber(sleep?.selectedNightFeature?.restingHeartRate)}
            sub="bpm"
            accent="lime"
            size="md"
            status={empty ? "stale" : undefined}
          />
        </Card>
        <Card accent="magenta">
          <Num
            label="HRV (RMSSD)"
            value={formatNumber(sleep?.selectedNightFeature?.rmssd, 1)}
            sub="ms"
            accent="magenta"
            size="md"
            status={empty ? "stale" : undefined}
          />
        </Card>
        <Card accent="amber">
          <Num
            label="Respiratory"
            value={formatNumber(sleep?.selectedNightFeature?.respiratoryRate, 1)}
            sub="breaths / min"
            accent="amber"
            size="md"
            status={empty ? "stale" : undefined}
          />
        </Card>
      </section>

      {/* Chapter 01 — Day timeline */}
      <section>
        <SectionHead
          n={1}
          kicker="Heart rate and motion across the calendar day."
          meta={raw ? `${raw.count} raw · ${(raw.rows ?? []).length} sampled` : "—"}
        >
          Day timeline
        </SectionHead>
        <div className="mt-6">
          <DayTimeline
            raw={raw}
            sleep={sleep}
            cursorMs={cursorMs}
            onCursorChange={setCursorMs}
          />
        </div>
      </section>

      {/* Chapter 02 — Hypnogram */}
      <section>
        <SectionHead
          n={2}
          kicker="Sleep stages over the night, second-by-second."
          meta={`${epochs.length} epoch windows`}
        >
          Hypnogram
        </SectionHead>
        <div className="mt-6 space-y-5">
          <Hypnogram epochs={epochs} cursorMs={cursorMs} onCursorChange={setCursorMs} />
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {(
              [
                ["Awake", sleep?.stageTotals?.awakeMinutes, HYPNOGRAM_STAGES.awake.color],
                ["REM", sleep?.stageTotals?.remMinutes, HYPNOGRAM_STAGES.rem.color],
                ["Core", sleep?.stageTotals?.lightMinutes, HYPNOGRAM_STAGES.core.color],
                ["Deep", sleep?.stageTotals?.deepMinutes, HYPNOGRAM_STAGES.deep.color],
              ] as const
            ).map(([label, minutes, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="eyebrow text-muted-foreground">{label}</span>
                <span className="font-mono text-sm tabular-nums">
                  {minutes ?? 0}m
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chapter 03 — Stage × HR */}
      <section>
        <SectionHead
          n={3}
          kicker="HR for each epoch, joined by stage. Expect HR to drop from Awake to Deep."
        >
          Stage × Heart rate
        </SectionHead>
        <div className="mt-6">
          <StageHrScatter sleep={sleep} raw={raw} />
        </div>
      </section>

      {/* Appendix — features & detection */}
      <section className="grid grid-cols-2 gap-x-12 gap-y-6">
        <div>
          <SectionHead n="A">Sleep detection</SectionHead>
          <div className="mt-4">
            <Row k="Night date" v={sleep?.selectedDetection?.nightDate ?? "—"} dense />
            <Row k="Bedtime" v={formatTimestamp(sleep?.selectedDetection?.bedtime)} dense />
            <Row k="Wake time" v={formatTimestamp(sleep?.selectedDetection?.wakeTime)} dense />
            <Row
              k="Interruptions"
              v={String(sleep?.selectedDetection?.interruptionCount ?? "—")}
              dense
            />
            <Row
              k="Continuity"
              v={
                <SleepHoverValue
                  value={formatNumber(sleep?.selectedDetection?.continuity, 3)}
                  title="Continuity"
                  description="Fraction of sleep time without major interruption. Higher = more consolidated sleep."
                  range="0-1"
                  direction="Higher is better"
                />
              }
              dense
            />
            <Row
              k="Coverage"
              v={
                <SleepHoverValue
                  value={formatNumber(sleep?.selectedDetection?.validCoverage, 3)}
                  title="Coverage"
                  description="Fraction of expected sensor data actually present. Detects sensor dropout."
                  range="0-1"
                  direction="Higher is better"
                />
              }
              dense
            />
            <Row
              k="Confidence"
              v={
                <SleepHoverValue
                  value={formatNumber(sleep?.selectedDetection?.confidence, 3)}
                  title="Confidence"
                  description="Detector's confidence in this sleep window."
                  range="0-1"
                  direction="Higher is better"
                />
              }
              dense
            />
          </div>
        </div>
        <div>
          <SectionHead n="B">Night features</SectionHead>
          <div className="mt-4">
            <Row
              k="SDNN"
              v={formatNumber(sleep?.selectedNightFeature?.sdnn, 1)}
              dense
            />
            <Row
              k="Sleep estimate"
              v={`${formatNumber(sleep?.selectedNightFeature?.sleepEstimateHours, 2)}h`}
              dense
            />
            <Row
              k="Regularity"
              v={
                <SleepHoverValue
                  value={formatNumber(sleep?.selectedNightFeature?.regularity, 3)}
                  title="Regularity"
                  description="Bedtime/wake-time consistency vs your baseline schedule."
                  range="0-1"
                  direction="Higher is better"
                />
              }
              dense
            />
            <Row k="Source blend" v={sleep?.selectedNightFeature?.sourceBlend ?? "—"} dense />
            <Row k="Selection reason" v={sleep?.selectionReason ?? "—"} dense />
            <Row k="Epoch windows" v={String(sleep?.epochTimelineCount ?? 0)} dense />
          </div>
        </div>
      </section>
    </div>
  )
}
