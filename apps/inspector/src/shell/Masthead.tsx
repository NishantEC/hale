import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Database,
  LogOut,
  RefreshCw,
} from "lucide-react"
import { Fragment, useMemo, useState } from "react"

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

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--sage)]",
  warn: "bg-[var(--warning)]",
  error: "bg-[var(--vermillion)]",
  neutral: "bg-foreground/30",
}

export type Tab = {
  id: string
  label: string
  shortcut: string
  badge?: number
  dot?: "ok" | "warn" | "error"
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const ROMAN_VOL: Record<string, string> = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
}

/**
 * Masthead — top of the workspace.
 *
 * Row 1 (masthead, 64px):
 *   left  — logo + serif wordmark + eyebrow with vol + host
 *   center — date scrubber (chevron / serif date / chevron / today)
 *   right — marginalia: pipeline status, live, theme, refresh, run
 *
 * Row 2 (tab strip, 44px):
 *   centered tab names separated by middle dots, vermillion underline on active
 */
export function Masthead({
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
  tabs,
  activeTab,
  onSelectTab,
  onSeed,
  onLogout,
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
  tabs: Tab[]
  activeTab: string
  onSelectTab: (id: string) => void
  onSeed: () => void
  onLogout: () => void
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
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [dateAsDate],
  )

  const yearMonth = new Date().getFullYear().toString().slice(-1)
  const volRoman = ROMAN_VOL[yearMonth] ?? yearMonth

  return (
    <header className="bg-paper sticky top-0 z-30 shrink-0 rule-hair-b">
      {/* Row 1 — Masthead */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 h-16">
        {/* Left — identity */}
        <div className="flex items-baseline gap-3 min-w-0">
          <Logo
            variant="glyph"
            className="size-5 self-center text-foreground -mb-0.5 shrink-0"
          />
          <h1 className="font-display text-[26px] leading-none tracking-tight font-medium">
            Inspector
          </h1>
          <span className="eyebrow text-muted-foreground truncate hidden md:inline">
            vol. {volRoman} <span className="opacity-50 px-1">/</span>{" "}
            <span className="font-mono normal-case tracking-normal text-foreground/70">
              {apiHost}
            </span>
          </span>
        </div>

        {/* Center — date scrubber */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDateChange(shiftDate(date, -1))}
                aria-label="Previous day"
                className="h-8 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
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
                className="font-display text-h2 leading-none tracking-tight text-foreground hover:text-[var(--vermillion)] inline-flex items-baseline gap-2 px-1 transition-colors"
              >
                <CalendarIcon className="size-3.5 text-muted-foreground self-center" />
                <span className="tabular-nums">{formattedDate}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-auto p-0">
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
                className="h-8 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
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

        {/* Right — marginalia actions */}
        <div className="flex items-center justify-end gap-3 text-[12px] min-w-0">
          {/* pipeline pill */}
          <button
            type="button"
            onClick={() => onSelectTab("pipeline")}
            className="flex items-center gap-1.5 eyebrow text-muted-foreground hover:text-foreground"
            title={`Pipeline: ${pipelineLabel}`}
          >
            <span className={cn("size-1.5 rounded-full", DOT[pipelineTone])} />
            <span className="hidden md:inline">{pipelineLabel}</span>
          </button>

          <Separator />

          {/* live toggle */}
          <button
            type="button"
            onClick={onToggleLive}
            className={cn(
              "eyebrow inline-flex items-center gap-1.5",
              live
                ? "text-[var(--vermillion)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Toggle live tail (L)"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "bg-[var(--vermillion)] animate-pulse" : "bg-foreground/30",
              )}
            />
            {live ? "live" : "off"}
          </button>

          <Separator />

          {lastRefreshedAt && (
            <>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden lg:inline">
                {relativeTime(lastRefreshedAt)}
              </span>
              <Separator className="hidden lg:inline-block" />
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRefresh}
                disabled={busy}
                aria-busy={busy}
                aria-label="Refresh"
                className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh (R)</TooltipContent>
          </Tooltip>

          <ThemeToggle />

          <RunPipelineMenu
            busy={busy}
            variant="ghost"
            size="sm"
            label="run"
            onRun={onRunPipeline}
            presets={[
              { kind: "day", day: date, label: `Run ${date} only` },
              { kind: "lastDays", days: 7, label: "Run last 7 days" },
              { kind: "lastDays", days: 30, label: "Run last 30 days" },
              { kind: "full", label: "Run full (45d)" },
            ]}
          />

          <Separator />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onSeed}
                aria-label="Seed demo data"
                className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Database className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Seed demo data</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Sign out"
                className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Row 2 — Tab strip */}
      <TabStrip tabs={tabs} active={activeTab} onSelect={onSelectTab} />
    </header>
  )
}

function Separator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-px h-3 bg-foreground/20", className)}
    />
  )
}

function TabStrip({
  tabs,
  active,
  onSelect,
}: {
  tabs: Tab[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      aria-label="Inspector sections"
      className="rule-hair flex items-center justify-center h-11 px-6 gap-0"
    >
      {tabs.map((t, i) => {
        const isActive = active === t.id
        return (
          <Fragment key={t.id}>
            {i > 0 && (
              <span
                aria-hidden
                className="px-3 text-foreground/30 text-[10px] select-none"
              >
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative eyebrow inline-flex items-center gap-1.5 py-1 transition-colors cursor-pointer",
                isActive
                  ? "text-[var(--vermillion)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.dot && (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    t.dot === "warn" && "bg-[var(--warning)]",
                    t.dot === "ok" && "bg-[var(--sage)]",
                    t.dot === "error" && "bg-[var(--vermillion)]",
                  )}
                />
              )}
              <span>{t.label}</span>
              {t.badge != null && t.badge > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-foreground/50 normal-case tracking-normal">
                  ({t.badge > 999 ? "999+" : t.badge})
                </span>
              )}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-px h-[1.5px] bg-[var(--vermillion)]"
                />
              )}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

