import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type Status = "ok" | "warn" | "error" | "stale"

const STATUS_DOT: Record<Status, string> = {
  ok: "bg-[var(--sage)]",
  warn: "bg-[var(--warning)]",
  error: "bg-[var(--vermillion)]",
  stale: "bg-muted-foreground",
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-[var(--sage)]",
  warn: "text-[var(--warning)]",
  error: "text-[var(--vermillion)]",
  stale: "text-muted-foreground",
}

/**
 * Chapter head — numbered, ruled, small-caps eyebrow.
 * Used at the top of every page section. The number gives the page
 * the rhythm of a printed report.
 */
export function SectionHead({
  n,
  kicker,
  children,
  meta,
  className,
}: {
  n?: string | number
  kicker?: ReactNode
  children: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("rule-strong pt-3", className)}>
      <div className="flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-3 min-w-0">
          {n != null && (
            <span className="eyebrow text-muted-foreground tabular-nums shrink-0">
              {typeof n === "number" ? String(n).padStart(2, "0") : n}
            </span>
          )}
          <h2 className="font-display text-h2 leading-tight tracking-tight truncate">
            {children}
          </h2>
        </div>
        {meta && <span className="eyebrow text-muted-foreground shrink-0">{meta}</span>}
      </div>
      {kicker && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">{kicker}</p>
      )}
    </header>
  )
}

/**
 * Eyebrow — small-caps mono label. Stands above a stat or sits next to a status dot.
 */
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
    <p className={cn("eyebrow text-muted-foreground flex items-center gap-1.5", className)}>
      {status && <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[status])} />}
      {children}
    </p>
  )
}

/**
 * Hero stat — serif display number. Used for HRV, recovery, sleep duration, etc.
 * The serif gives weight without needing chrome.
 */
export function Stat({
  label,
  value,
  sub,
  status,
  unit,
  size = "lg",
  className,
}: {
  label: string
  value: string | number
  sub?: ReactNode
  status?: Status
  unit?: string
  size?: "lg" | "md" | "sm"
  className?: string
}) {
  const valueClass =
    size === "lg"
      ? "font-display-tight text-[3rem] leading-[0.95]"
      : size === "md"
      ? "font-display-tight text-[2rem] leading-[0.95]"
      : "font-display-tight text-[1.5rem] leading-[0.95]"
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Eyebrow status={status}>{label}</Eyebrow>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(valueClass, "tabular-nums")}>{value}</span>
        {unit && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {unit}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  )
}

/**
 * Field line — single key-value entry separated from siblings by hairline.
 * Use inside a Sheet for spec-sheet-style data.
 */
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

/**
 * Sheet — replaces Card. Chrome-less, ruled.
 *
 * Variants:
 *  - "ruled"  (default): thick top rule, no fill. Pure typographic section.
 *  - "tinted": warm-tan tinted block for sidebar-style content.
 *  - "plate":  warm-white card (used for nested charts or modals only).
 */
export function Sheet({
  variant = "ruled",
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { variant?: "ruled" | "tinted" | "plate" }) {
  const variantClass =
    variant === "tinted"
      ? "bg-[var(--muted)] px-5 py-5"
      : variant === "plate"
      ? "bg-card px-5 py-5"
      : "pt-3"
  return (
    <section data-slot="sheet" className={cn(variantClass, className)} {...props}>
      {children}
    </section>
  )
}

/**
 * Marginalia — small footnote-style annotation, set in mono. Used in spaces between sections.
 */
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

/**
 * Status pill — tonal, small-caps. Tighter than a Badge.
 */
export function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "neutral"
  children: ReactNode
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--sage)] border-[var(--sage)]"
      : tone === "yellow"
      ? "text-[var(--warning)] border-[var(--warning)]"
      : tone === "red"
      ? "text-[var(--vermillion)] border-[var(--vermillion)]"
      : "text-muted-foreground border-[var(--border)]"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 eyebrow px-2 py-0.5 border",
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

/* ---- Backward-compatibility shims for legacy call sites ---- */

/** @deprecated use Stat */
export const Num = Stat

/** @deprecated use FieldLine */
export const Row = FieldLine
