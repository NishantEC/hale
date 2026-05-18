import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type Status = "ok" | "warn" | "error" | "stale"

const STATUS_BAR: Record<Status, string> = {
  ok: "border-l-success",
  warn: "border-l-warning",
  error: "border-l-destructive",
  stale: "border-l-muted-foreground",
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  stale: "text-muted-foreground",
}

export function Num({
  label,
  value,
  sub,
  status,
}: {
  label: string
  value: string | number
  sub: string
  status?: Status
}) {
  const bar = status ? `border-l-2 ${STATUS_BAR[status]} pl-3` : ""
  const valueColor = status ? STATUS_TEXT[status] : ""
  return (
    <div className={bar}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("text-3xl font-semibold tracking-tight mt-1 tabular-nums", valueColor)}>
        {value}
      </p>
      <p className="text-muted-foreground text-sm mt-0.5">{sub}</p>
    </div>
  )
}

export function SectionHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h3>
  )
}

export function Row({
  k,
  v,
  dense,
  highlight,
}: {
  k: string
  v: ReactNode
  dense?: boolean
  highlight?: Status
}) {
  const padding = dense ? "py-1.5" : "py-2.5"
  const size = dense ? "text-[13px]" : ""
  const valueColor = highlight ? STATUS_TEXT[highlight] : ""
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-border/60",
        padding,
        size,
      )}
    >
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className={cn("text-right max-w-[60%] truncate tabular-nums", valueColor)}>{v}</span>
    </div>
  )
}

// Tone pill used in older screens — Phase 2 prefers shadcn <Badge> directly.
// Kept for backwards compatibility; semantics same as before.
export function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "neutral"
  children: ReactNode
}) {
  const toneClass =
    tone === "green"
      ? "bg-success/15 text-success"
      : tone === "yellow"
      ? "bg-warning/15 text-warning"
      : tone === "red"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground border border-border"
  return (
    <span
      className={cn(
        "inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full",
        toneClass,
      )}
    >
      {children}
    </span>
  )
}
