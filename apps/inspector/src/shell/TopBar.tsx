import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import type { PipelineRunOptions, PipelineState } from "../api"
import { Logo } from "../components/Logo"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { ThemeToggle } from "../components/ThemeToggle"
import { relativeTime } from "../format"
import { TOP_BAR_HEIGHT } from "./tokens"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT_BG: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-muted-foreground",
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

  const [calOpen, setCalOpen] = useState(false)
  const dateAsDate = useMemo(() => new Date(`${date}T00:00:00`), [date])
  const formattedDate = useMemo(
    () =>
      dateAsDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [dateAsDate],
  )

  return (
    <header
      className="flex items-center gap-4 px-4 bg-background shrink-0"
      style={{ height: TOP_BAR_HEIGHT }}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <Logo variant="badge" className="size-6" />
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Inspector</h1>
          <span
            className="text-muted-foreground text-xs truncate max-w-[180px] tabular-nums"
            title={apiHost}
          >
            {apiHost}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mx-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDateChange(shiftDate(date, -1))}
              aria-label="Previous day"
              className="h-8 w-8"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous day ([)</TooltipContent>
        </Tooltip>

        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-sm font-medium gap-2 tabular-nums"
            >
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              {formattedDate}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateAsDate}
              onSelect={(d) => {
                if (!d) return
                const year = d.getFullYear()
                const month = String(d.getMonth() + 1).padStart(2, "0")
                const day = String(d.getDate()).padStart(2, "0")
                onDateChange(`${year}-${month}-${day}`)
                setCalOpen(false)
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDateChange(shiftDate(date, 1))}
              aria-label="Next day"
              className="h-8 w-8"
            >
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next day (])</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDateChange(todayIso())}
              className="h-8 text-xs"
            >
              Today
            </Button>
          </TooltipTrigger>
          <TooltipContent>Jump to today (T)</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="gap-2 px-3 py-1 font-medium" title={pipelineLabel}>
          <span className={cn("w-2 h-2 rounded-full", DOT_BG[pipelineTone])} />
          <span className="text-xs">{pipelineLabel}</span>
        </Badge>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={live ? "default" : "outline"}
              size="sm"
              onClick={onToggleLive}
              className={cn(
                "gap-1.5 rounded-full h-8",
                live && "bg-success/15 text-success hover:bg-success/25 border-success/20",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  live ? "bg-success animate-pulse" : "bg-muted-foreground",
                )}
              />
              {live ? "Live" : "Off"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle live tail (L)</TooltipContent>
        </Tooltip>

        <ThemeToggle />

        <span className="text-muted-foreground text-xs tabular-nums hidden lg:inline">
          {lastRefreshedAt ? `Refreshed ${relativeTime(lastRefreshedAt)}` : "—"}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={busy}
              aria-busy={busy}
              className="h-8"
            >
              {busy ? "..." : "Refresh"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh data (R)</TooltipContent>
        </Tooltip>

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
