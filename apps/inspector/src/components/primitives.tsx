import type { ReactNode } from "react"

export type Status = "ok" | "warn" | "error" | "stale"

const STATUS_BAR: Record<Status, string> = {
  ok: "border-l-green",
  warn: "border-l-yellow",
  error: "border-l-red",
  stale: "border-l-text-2",
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-green",
  warn: "text-yellow",
  error: "text-red",
  stale: "text-text-2",
}

// Big-number tile used at the top of most tabs.
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
      <p className="text-text-2 text-sm">{label}</p>
      <p className={`text-3xl font-semibold tracking-tight mt-1 tabular-nums ${valueColor}`}>
        {value}
      </p>
      <p className="text-text-2 text-sm mt-0.5">{sub}</p>
    </div>
  )
}

// Small uppercase section header.
export function SectionHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-text-2 uppercase tracking-widest">
      {children}
    </h3>
  )
}

// Two-column key/value row with subtle bottom border.
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
      className={`flex items-baseline justify-between ${padding} border-b border-border/60 gap-4 ${size}`}
    >
      <span className="text-text-2 shrink-0">{k}</span>
      <span className={`text-right max-w-[60%] truncate tabular-nums ${valueColor}`}>{v}</span>
    </div>
  )
}

// Status pill — used for "dirty / clean" pipeline state, etc.
export function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "neutral"
  children: ReactNode
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-soft text-green"
      : tone === "yellow"
      ? "bg-yellow-soft text-yellow"
      : tone === "red"
      ? "bg-red-soft text-red"
      : "bg-surface-2 text-text-1 border border-border"
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${toneClass}`}
    >
      {children}
    </span>
  )
}
