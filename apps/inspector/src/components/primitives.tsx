import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type AccentKey = "cyan" | "magenta" | "lime" | "amber"
export type Status = "ok" | "warn" | "error" | "stale"

const ACCENT_TEXT: Record<AccentKey, string> = {
  cyan: "text-[var(--accent-cyan)]",
  magenta: "text-[var(--accent-magenta)]",
  lime: "text-[var(--accent-lime)]",
  amber: "text-[var(--accent-amber)]",
}

const STATUS_DOT: Record<Status, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  stale: "bg-muted-foreground",
}

const STATUS_TEXT: Record<Status, string> = {
  ok: "text-[var(--accent-lime)]",
  warn: "text-[var(--accent-amber)]",
  error: "text-[var(--accent-magenta)]",
  stale: "text-muted-foreground",
}

export function SectionHead({
  children,
  meta,
  className,
}: {
  children: ReactNode
  meta?: ReactNode
  className?: string
  /** @deprecated removed in Pulse rebuild; stripped in Task 5. */
  n?: string | number
  /** @deprecated removed in Pulse rebuild; stripped in Task 5. */
  kicker?: ReactNode
}) {
  return (
    <header className={cn("flex items-baseline justify-between gap-4 mb-3", className)}>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {children}
      </h2>
      {meta && (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {meta}
        </span>
      )}
    </header>
  )
}

export function Eyebrow({
  children,
  status,
  className,
}: {
  children: ReactNode
  status?: Status
  className?: string
}) {
  return (
    <p className={cn("eyebrow flex items-center gap-1.5", className)}>
      {status && <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />}
      {children}
    </p>
  )
}

export type Delta = { kind: "up" | "down" | "same"; text: ReactNode }

export function DeltaChip({ kind, children }: { kind: Delta["kind"]; children: ReactNode }) {
  const cls = {
    up: "bg-[rgba(187,255,56,0.12)] text-[var(--accent-lime)]",
    down: "bg-[rgba(255,45,110,0.12)] text-[var(--accent-magenta)]",
    same: "bg-white/[0.04] text-muted-foreground",
  }[kind]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold tabular-nums",
        cls,
      )}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  sub,
  unit,
  accent,
  delta,
  status,
  size = "md",
  className,
}: {
  label: string
  value: string | number
  sub?: ReactNode
  unit?: string
  accent?: AccentKey
  delta?: Delta | null
  status?: Status
  size?: "lg" | "md" | "sm"
  className?: string
}) {
  const valueColor = accent ? ACCENT_TEXT[accent] : "text-foreground"
  const valueClass =
    size === "lg"
      ? "text-[2rem] leading-none"
      : size === "md"
      ? "text-[1.625rem] leading-none"
      : "text-[1.25rem] leading-none"
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Eyebrow status={status}>{label}</Eyebrow>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(valueClass, valueColor, "font-bold tabular-nums tracking-tight")}>
          {value}
        </span>
        {unit && (
          <span className="font-mono text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      {delta && <DeltaChip kind={delta.kind}>{delta.text}</DeltaChip>}
      {sub && !delta && (
        <p className="text-xs text-muted-foreground font-mono tabular-nums">{sub}</p>
      )}
    </div>
  )
}

export function FieldLine({
  k,
  v,
  dense,
  highlight,
  className,
}: {
  k: string
  v: ReactNode
  dense?: boolean
  highlight?: Status
  className?: string
}) {
  const padding = dense ? "py-2" : "py-2.5"
  const valueColor = highlight ? STATUS_TEXT[highlight] : ""
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 rule-hair-b last:border-b-0",
        padding,
        className,
      )}
    >
      <span className="text-sm text-muted-foreground shrink-0">{k}</span>
      <span className={cn("text-sm text-right max-w-[60%] truncate tabular-nums", valueColor)}>
        {v}
      </span>
    </div>
  )
}

export function Marginalia({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <aside className={cn("text-xs font-mono text-muted-foreground leading-relaxed", className)}>
      {children}
    </aside>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "neutral"
  children: ReactNode
}) {
  const cls =
    tone === "green"
      ? "bg-[rgba(187,255,56,0.12)] text-[var(--accent-lime)]"
      : tone === "yellow"
      ? "bg-[rgba(255,164,43,0.14)] text-[var(--accent-amber)]"
      : tone === "red"
      ? "bg-[rgba(255,45,110,0.12)] text-[var(--accent-magenta)]"
      : "bg-white/[0.04] text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 eyebrow px-2 py-0.5 rounded-full",
        cls,
      )}
    >
      {children}
    </span>
  )
}

/* Legacy aliases — keep prior call sites working. */
export const Num = Stat
export const Row = FieldLine
