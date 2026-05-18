import { Moon } from "lucide-react"

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatNumber, formatTimestamp } from "../format"
import { useScrubController } from "../hooks/useScrubController"

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
    <TooltipProvider>
      <div className="space-y-10 max-w-6xl">
        <div className="flex items-baseline justify-between">
          <SectionHead>Selected night · {sleep?.selectedNightDate ?? selectedDate}</SectionHead>
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

        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle>
              <SectionHead>Day timeline</SectionHead>
            </CardTitle>
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

        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle>
              <SectionHead>Hypnogram</SectionHead>
            </CardTitle>
            <CardDescription>{epochs.length} epoch windows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Hypnogram
              epochs={epochs}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
            />
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {(
                [
                  ["Awake", sleep?.stageTotals?.awakeMinutes, HYPNOGRAM_STAGES.awake.color],
                  ["REM", sleep?.stageTotals?.remMinutes, HYPNOGRAM_STAGES.rem.color],
                  ["Core", sleep?.stageTotals?.lightMinutes, HYPNOGRAM_STAGES.core.color],
                  ["Deep", sleep?.stageTotals?.deepMinutes, HYPNOGRAM_STAGES.deep.color],
                ] as const
              ).map(([label, minutes, color]) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-muted-foreground text-sm">{label}</span>
                  <span className="text-base font-semibold tabular-nums">{minutes ?? 0}m</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardContent className="pt-6">
            <StageHrScatter sleep={sleep} raw={raw} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-12">
          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle>
                <SectionHead>Sleep detection</SectionHead>
              </CardTitle>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {formatNumber(sleep?.selectedDetection?.continuity, 3)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Fraction of sleep time without major interruption. Higher is better (0–1).
                    </TooltipContent>
                  </Tooltip>
                }
                dense
              />
              <Row
                k="Coverage"
                v={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {formatNumber(sleep?.selectedDetection?.validCoverage, 3)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Fraction of expected sensor data actually present. Higher is better (0–1).
                    </TooltipContent>
                  </Tooltip>
                }
                dense
              />
              <Row
                k="Confidence"
                v={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {formatNumber(sleep?.selectedDetection?.confidence, 3)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Detector confidence in this sleep window. Higher is better (0–1).
                    </TooltipContent>
                  </Tooltip>
                }
                dense
              />
            </CardContent>
          </Card>

          <Card className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle>
                <SectionHead>Night features</SectionHead>
              </CardTitle>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {formatNumber(sleep?.selectedNightFeature?.regularity, 3)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Bedtime/wake-time consistency vs your baseline. Higher is better (0–1).
                    </TooltipContent>
                  </Tooltip>
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
    </TooltipProvider>
  )
}
