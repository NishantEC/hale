import { useMemo } from "react"

import type { PipelineRunOptions, PipelineState } from "../api"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { ThemeToggle } from "../components/ThemeToggle"
import { relativeTime } from "../format"
import { TOP_BAR_HEIGHT } from "./tokens"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT_BG: Record<Tone, string> = {
  ok: "bg-green",
  warn: "bg-yellow",
  error: "bg-red",
  neutral: "bg-text-2",
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function TopBar({
  apiHost,
  date,
  onDateChange,
  pipelineState,
  lastRefreshedAt,
  busy,
  onRefresh,
  onRunPipeline,
  live,
  onToggleLive,
}: {
  apiHost: string
  date: string
  onDateChange: (next: string) => void
  pipelineState: PipelineState | null | undefined
  lastRefreshedAt: string | null
  busy: boolean
  onRefresh: () => void
  onRunPipeline: (opts: PipelineRunOptions) => void
  live: boolean
  onToggleLive: () => void
}) {
  const pipelineTone: Tone = useMemo(() => {
    if (!pipelineState) return "neutral"
    if (!pipelineState.state) return "error"
    if (pipelineState.isDirty) return "warn"
    return "ok"
  }, [pipelineState])

  const pipelineLabel = useMemo(() => {
    if (!pipelineState) return "Pipeline: —"
    if (!pipelineState.state) return "Pipeline: never run"
    if (pipelineState.isDirty) return "Pipeline: dirty"
    return `Pipeline: clean · ${relativeTime(pipelineState.state.lastRunAt ?? null)}`
  }, [pipelineState])

  return (
    <header
      className="flex items-center gap-4 px-4 border-b border-border bg-surface shrink-0"
      style={{ height: TOP_BAR_HEIGHT }}
    >
      <div className="flex items-baseline gap-2 shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">Noop Inspector</h1>
        <span className="text-text-2 text-xs truncate max-w-[180px]" title={apiHost}>
          {apiHost}
        </span>
      </div>

      <div className="flex items-center gap-1 mx-auto">
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="px-2 py-1 rounded-md text-text-1 hover:bg-surface-2 hover:text-text-0 cursor-pointer transition-colors"
          aria-label="Previous day"
          title="Previous day ( [ )"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-surface-1 border border-border rounded-md px-2 py-1 text-sm outline-none focus:border-border-strong tabular-nums"
        />
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="px-2 py-1 rounded-md text-text-1 hover:bg-surface-2 hover:text-text-0 cursor-pointer transition-colors"
          aria-label="Next day"
          title="Next day ( ] )"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onDateChange(todayIso())}
          className="ml-1 px-2 py-1 rounded-md text-text-2 hover:text-text-0 hover:bg-surface-2 text-xs font-medium cursor-pointer transition-colors"
          title="Today ( T )"
        >
          Today
        </button>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border"
          title={pipelineLabel}
        >
          <span className={`w-2 h-2 rounded-full ${DOT_BG[pipelineTone]}`} />
          <span className="text-[12px] text-text-1 font-medium">{pipelineLabel}</span>
        </div>

        <button
          type="button"
          onClick={onToggleLive}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${
            live
              ? "bg-green-soft text-green"
              : "bg-surface-1 border border-border text-text-2 hover:text-text-0"
          }`}
          title="Toggle live tail ( L )"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${live ? "bg-green animate-pulse" : "bg-text-2"}`}
          />
          {live ? "Live" : "Off"}
        </button>

        <ThemeToggle />

        <span className="text-text-2 text-xs tabular-nums">
          {lastRefreshedAt ? `Refreshed ${relativeTime(lastRefreshedAt)}` : "—"}
        </span>

        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          aria-busy={busy}
          className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm font-medium cursor-pointer hover:bg-surface-3 transition-colors disabled:opacity-40"
          title="Refresh ( R )"
        >
          {busy ? "..." : "Refresh"}
        </button>

        <RunPipelineMenu
          busy={busy}
          onRun={onRunPipeline}
          label="Run"
          presets={[
            { kind: "day", day: date, label: `Run ${date} only` },
            { kind: "lastDays", days: 7, label: "Run last 7 days" },
            { kind: "lastDays", days: 30, label: "Run last 30 days" },
            { kind: "full", label: "Run full (last 45 days)" },
          ]}
        />
      </div>
    </header>
  )
}
