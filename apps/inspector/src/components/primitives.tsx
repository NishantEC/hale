import type { ReactNode } from "react"

// Big-number tile used at the top of most tabs.
export function Num({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub: string
}) {
  return (
    <div>
      <p className="text-text-2 text-sm">{label}</p>
      <p className="text-3xl font-semibold tracking-tight mt-1">{value}</p>
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
export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-border/60 gap-4">
      <span className="text-text-2 shrink-0">{k}</span>
      <span className="text-right max-w-[60%] truncate">{v}</span>
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
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${toneClass}`}
    >
      {children}
    </span>
  )
}
