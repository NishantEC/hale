import type { PipelineRunRow, PipelineRunOptions } from "../api"
import { Pill, Row, SectionHead } from "./primitives"
import { formatDuration, formatTimestamp } from "../format"

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

  const version = (run as any).pipelineVersion as string | undefined

  return (
    <div
      className="fixed inset-y-0 right-0 w-[420px] bg-surface-1 border-l border-border shadow-2xl flex flex-col z-50"
      role="dialog"
      aria-label="Pipeline run details"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-text-0 text-sm font-semibold">
            Run ·{" "}
            {new Date(run.startedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {run.skipped && (
            <Pill tone="neutral">skipped</Pill>
          )}
          {run.forced && (
            <Pill tone="yellow">forced</Pill>
          )}
          {version && (
            <span className="inline-block text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-text-1 border border-border">
              {version}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-2 hover:text-text-0 transition-colors text-lg leading-none cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
        <div>
          <SectionHead>Timing</SectionHead>
          <div className="mt-3 space-y-0">
            <Row k="Started" v={formatTimestamp(run.startedAt)} dense />
            <Row k="Duration" v={run.skipped ? "skipped" : formatDuration(run.durationMs)} dense />
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
              <div className="space-y-0">
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
                      <span className="text-text-1 truncate">{name}</span>
                    </div>
                    <span className="text-text-0 font-medium tabular-nums shrink-0">
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
          <div className="mt-3 space-y-0">
            <Row k="Detections" v={String(run.detections)} dense />
            <Row k="Sleep stages" v={String(run.sleepStages)} dense />
            <Row k="Night features" v={String(run.features)} dense />
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => {
            onRunPipeline({ day: runDate })
            onClose()
          }}
          className="w-full px-4 py-2.5 rounded-lg bg-accent-soft border border-accent/30 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors cursor-pointer"
        >
          Rerun this date ({runDate})
        </button>
      </div>
    </div>
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
