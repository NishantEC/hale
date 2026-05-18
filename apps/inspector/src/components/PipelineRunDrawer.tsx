import type { PipelineRunOptions, PipelineRunRow } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDuration, formatTimestamp } from "@/format"
import { Row, SectionHead } from "./primitives"

const STAGE_COLORS: Record<string, string> = {
  fetch: "#3FB1E7",
  "sleep-detect": "#1B81FE",
  "activity-detect": "#403EA7",
  "sleep-stages": "#a78bfa",
  compute: "#22c55e",
  write: "#eab308",
}

function colorFor(stage: string): string {
  return STAGE_COLORS[stage] ?? "#6b7280"
}

type Props = {
  run: PipelineRunRow
  onClose: () => void
  onRunPipeline: (opts: PipelineRunOptions) => void
}

export function PipelineRunDrawer({ run, onClose, onRunPipeline }: Props) {
  const stageEntries = run.stages
    ? Object.entries(run.stages).sort((a, b) => b[1] - a[1])
    : []
  const totalStageDuration = stageEntries.reduce((acc, [, v]) => acc + v, 0)

  const runDate = run.windowFrom
    ? run.windowFrom.slice(0, 10)
    : run.startedAt.slice(0, 10)

  const version = (run as { pipelineVersion?: string }).pipelineVersion

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <span>
              Run ·{" "}
              {new Date(run.startedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {run.skipped && <Badge variant="secondary">skipped</Badge>}
            {run.forced && (
              <Badge className="bg-warning/15 text-warning hover:bg-warning/20">forced</Badge>
            )}
            {version && (
              <Badge variant="outline" className="font-mono">
                {version}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Pipeline run details and rerun action
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-7">
          <div>
            <SectionHead>Timing</SectionHead>
            <div className="mt-3">
              <Row k="Started" v={formatTimestamp(run.startedAt)} dense />
              <Row
                k="Duration"
                v={run.skipped ? "skipped" : formatDuration(run.durationMs)}
                dense
              />
              <Row k="Window" v={buildWindowLabel(run)} dense />
            </div>
          </div>

          {stageEntries.length > 0 && (
            <div>
              <SectionHead>Stage timings</SectionHead>
              <div className="mt-3">
                <div className="flex h-4 rounded overflow-hidden mb-3">
                  {totalStageDuration > 0 &&
                    stageEntries.map(([name, ms]) => (
                      <div
                        key={name}
                        style={{
                          width: `${(ms / totalStageDuration) * 100}%`,
                          backgroundColor: colorFor(name),
                        }}
                        title={`${name}: ${formatDuration(ms)}`}
                      />
                    ))}
                </div>
                <div>
                  {stageEntries.map(([name, ms]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between py-1.5 border-b border-border/60 gap-4 text-[13px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: colorFor(name) }}
                        />
                        <span className="text-muted-foreground truncate">{name}</span>
                      </div>
                      <span className="text-foreground font-medium tabular-nums shrink-0">
                        {formatDuration(ms)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <SectionHead>Output counts</SectionHead>
            <div className="mt-3">
              <Row k="Detections" v={String(run.detections)} dense />
              <Row k="Sleep stages" v={String(run.sleepStages)} dense />
              <Row k="Night features" v={String(run.features)} dense />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            onClick={() => {
              onRunPipeline({ day: runDate })
              onClose()
            }}
          >
            Rerun this date ({runDate})
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function buildWindowLabel(run: PipelineRunRow): string {
  if (!run.windowFrom && !run.windowTo) return "full window (45d)"
  const from = run.windowFrom ? new Date(run.windowFrom) : null
  const to = run.windowTo ? new Date(run.windowTo) : null
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  if (from && to) {
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    return `${fmt(from)} → ${fmt(to)} (${days}d)`
  }
  if (from) return `from ${fmt(from)}`
  if (to) return `to ${fmt(to)}`
  return "custom window"
}
