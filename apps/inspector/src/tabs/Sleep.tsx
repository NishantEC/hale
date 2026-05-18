import { Info, Moon } from "lucide-react"

import type { PipelineRunOptions, RawRecords, SleepNight } from "../api"
import { DayTimeline } from "../components/DayTimeline"
import { HYPNOGRAM_STAGES, Hypnogram } from "../components/Hypnogram"
import { Num, Row, SectionHead } from "../components/primitives"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { StageHrScatter } from "../components/StageHrScatter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    <div className="space-y-6 max-w-6xl">
        <div className="flex items-baseline justify-between">
          <SectionHead>
            Selected night ·{" "}
            <span className="font-mono font-medium tabular-nums">
              {formatDate(sleep?.selectedNightDate ?? selectedDate)}
            </span>
          </SectionHead>
          <RunPipelineMenu
            busy={busy}
            variant="secondary"
            label="Rerun this night"
            onRun={onRunPipeline}
            presets={[
              { kind: "day", day: nightDay, label: `Rerun ${nightDay} only` },
              { kind: "lastDays", days: 7, label: "Rerun last 7 days" },
              { kind: "full", label: "Rerun full (last 45 days)" },
            ]}
          />
        </div>

        {empty && (
          <Alert>
            <Moon className="size-4" />
            <AlertTitle>No sleep detection</AlertTitle>
            <AlertDescription>
              No sleep detection for {selectedDate}. Try a different date, or rerun the pipeline
              for this night.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-4 gap-6">
          <Card className="p-4 gap-0">
            <Num
              label="Duration"
              value={`${formatNumber(sleep?.selectedDetection?.durationHours, 1)}h`}
              sub="total sleep"
              status={empty ? "stale" : undefined}
            />
          </Card>
          <Card className="p-4 gap-0">
            <Num
              label="Resting HR"
              value={formatNumber(sleep?.selectedNightFeature?.restingHeartRate)}
              sub="bpm"
              status={empty ? "stale" : undefined}
            />
          </Card>
          <Card className="p-4 gap-0">
            <Num
              label="HRV (RMSSD)"
              value={formatNumber(sleep?.selectedNightFeature?.rmssd, 1)}
              sub="ms"
              status={empty ? "stale" : undefined}
            />
          </Card>
          <Card className="p-4 gap-0">
            <Num
              label="Respiratory"
              value={formatNumber(sleep?.selectedNightFeature?.respiratoryRate, 1)}
              sub="breaths/min"
              status={empty ? "stale" : undefined}
            />
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Day timeline</CardTitle>
            <CardDescription className="font-mono tabular-nums">
              {raw ? `${raw.count} raw · ${(raw.rows ?? []).length} sampled` : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayTimeline
              raw={raw}
              sleep={sleep}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hypnogram</CardTitle>
            <CardDescription className="font-mono tabular-nums">
              {epochs.length} epoch windows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Hypnogram
              epochs={epochs}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-2">
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
                  <span className="text-muted-foreground text-[13px]">{label}</span>
                  <span className="text-[13px] font-mono font-semibold tabular-nums">
                    {minutes ?? 0}m
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage × HR</CardTitle>
            <CardDescription>
              Joins each epoch's stage with the raw HR sample at that timestamp. Expect HR to drop from Awake to Deep.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StageHrScatter sleep={sleep} raw={raw} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sleep detection</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Night features</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>
      </div>
  )
}
