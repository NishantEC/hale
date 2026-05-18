import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type Status = "ok" | "warn" | "error" | "stale"

const STATUS_DOT: Record<Status, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  stale: "bg-muted-foreground",
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  stale: "text-muted-foreground",
}

// Hero stat tile. Big mono number, small label, optional sub line.
// Status renders as a colored dot beside the label — no bordered bars,
// no big colored values. The number is the hero; the dot is the signal.
export function Num({
  label,
  value,
  sub,
  status,
}: {
  label: string
  value: string | number
  sub?: string
  status?: Status
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {status && (
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[status])} />
        )}
        <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="font-mono text-[2.25rem] leading-none font-light tracking-tight tabular-nums">
        {value}
      </p>
      {sub && <p className="text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// Section label. Confident size, sentence-case, light weight. No more
// uppercase tracking-widest microtext.
export function SectionHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[15px] font-semibold tracking-tight">
      {children}
    </h3>
  )
}

// Key-value row. No bottom border — sections separate via whitespace.
// Values right-aligned, mono if numeric (caller passes <span className="font-mono">).
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
  const padding = dense ? "py-1.5" : "py-2"
  const size = dense ? "text-[13px]" : "text-[14px]"
  const valueColor = highlight ? STATUS_TEXT[highlight] : ""
  return (
    <div className={cn("flex items-baseline justify-between gap-4", padding, size)}>
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className={cn("text-right max-w-[60%] truncate tabular-nums", valueColor)}>{v}</span>
    </div>
  )
}

// Tonal pill. Used in legacy call sites — prefer shadcn Badge for new code.
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
      : "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full",
        toneClass,
      )}
    >
      {children}
    </span>
  )
}
