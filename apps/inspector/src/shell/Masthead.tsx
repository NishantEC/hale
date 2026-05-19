import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import type { PipelineRunOptions, PipelineState } from "../api"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { relativeTime } from "../format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  neutral: "bg-foreground/30",
}

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function Masthead({
  date,
  onDateChange,
  pipelineState,
  lastRefreshedAt,
  busy,
  onRefresh,
  onRunPipeline,
  live,
  onToggleLive,
  onSelectTab,
}: {
  date: string
  onDateChange: (next: string) => void
  pipelineState: PipelineState | null | undefined
  lastRefreshedAt: string | null
  busy: boolean
  onRefresh: () => void
  onRunPipeline: (opts: PipelineRunOptions) => void
  live: boolean
  onToggleLive: () => void
  onSelectTab: (id: string) => void
}) {
  const pipelineTone: Tone = useMemo(() => {
    if (!pipelineState) return "neutral"
    if (!pipelineState.state) return "error"
    if (pipelineState.isDirty) return "warn"
    return "ok"
  }, [pipelineState])

  const pipelineLabel = useMemo(() => {
    if (!pipelineState) return "—"
    if (!pipelineState.state) return "never run"
    if (pipelineState.isDirty) return "dirty"
    return `clean · ${relativeTime(pipelineState.state.lastRunAt ?? null)}`
  }, [pipelineState])

  const [calOpen, setCalOpen] = useState(false)
  const dateAsDate = useMemo(() => new Date(`${date}T00:00:00`), [date])
  const formattedDate = useMemo(
    () =>
      dateAsDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [dateAsDate],
  )

  return (
    <header className="bg-background/80 backdrop-blur-lg sticky top-0 z-30 shrink-0 border-b border-white/[0.06]">
      <div className="flex items-center justify-between gap-6 px-6 h-14">
        {/* Left — date scrubber */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDateChange(shiftDate(date, -1))}
                aria-label="Previous day"
                className="h-8 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-white/[0.04]"
              >
                <ChevronLeft className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Previous ([)</TooltipContent>
          </Tooltip>

          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-sm font-medium leading-none text-foreground hover:text-[var(--accent-cyan)] inline-flex items-baseline gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
              >
                <CalendarIcon className="size-3.5 text-muted-foreground self-center" />
                <span className="tabular-nums">{formattedDate}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={dateAsDate}
                onSelect={(d) => {
                  if (!d) return
                  const y = d.getFullYear()
                  const m = String(d.getMonth() + 1).padStart(2, "0")
                  const dd = String(d.getDate()).padStart(2, "0")
                  onDateChange(`${y}-${m}-${dd}`)
                  setCalOpen(false)
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDateChange(shiftDate(date, 1))}
                aria-label="Next day"
                className="h-8 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-white/[0.04]"
              >
                <ChevronRight className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Next (])</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={() => onDateChange(todayIso())}
            className="eyebrow text-muted-foreground hover:text-foreground ml-1"
          >
            today
          </button>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => onSelectTab("pipeline")}
            className="flex items-center gap-1.5 eyebrow text-muted-foreground hover:text-foreground"
            title={`Pipeline: ${pipelineLabel}`}
          >
            <span className={cn("size-1.5 rounded-full", DOT[pipelineTone])} />
            <span className="hidden lg:inline">{pipelineLabel}</span>
          </button>

          <Separator />

          <button
            type="button"
            onClick={onToggleLive}
            className={cn(
              "eyebrow inline-flex items-center gap-1.5",
              live
                ? "text-[var(--accent-cyan)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Toggle live tail (L)"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "bg-[var(--accent-cyan)] animate-pulse" : "bg-foreground/30",
              )}
            />
            {live ? "live" : "off"}
          </button>

          {lastRefreshedAt && (
            <>
              <Separator />
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden xl:inline">
                {relativeTime(lastRefreshedAt)}
              </span>
            </>
          )}

          <Separator />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRefresh}
                disabled={busy}
                aria-busy={busy}
                aria-label="Refresh"
                className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-md disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh (R)</TooltipContent>
          </Tooltip>

          <RunPipelineMenu
            busy={busy}
            variant="secondary"
            size="sm"
            label="Run"
            onRun={onRunPipeline}
            presets={[
              { kind: "day", day: date, label: `Run ${date} only` },
              { kind: "lastDays", days: 7, label: "Run last 7 days" },
              { kind: "lastDays", days: 30, label: "Run last 30 days" },
              { kind: "full", label: "Run full (45d)" },
            ]}
          />
        </div>
      </div>
    </header>
  )
}

function Separator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-px h-3 bg-white/10", className)}
    />
  )
}
