import type { ReactNode } from "react"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_BG: Record<StatusTone, string> = {
  ok: "bg-green-soft",
  warn: "bg-yellow-soft",
  error: "bg-red-soft",
  neutral: "bg-surface-2 border border-border",
}
const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-green",
  warn: "bg-yellow",
  error: "bg-red",
  neutral: "bg-text-2",
}
const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-green",
  warn: "text-yellow",
  error: "text-red",
  neutral: "text-text-1",
}

// Hero status pill used on Home (3 across) and at the top of tabs that
// repeat actionable state. `detail` is a small line of context; `action`
// is an inline button rendered on the right when something needs doing.
export function StatusBadge({
  tone,
  label,
  detail,
  action,
  size = "md",
}: {
  tone: StatusTone
  label: ReactNode
  detail?: ReactNode
  action?: { label: string; onClick: () => void }
  size?: "sm" | "md" | "lg"
}) {
  const pad = size === "lg" ? "px-4 py-3" : size === "sm" ? "px-2.5 py-1" : "px-3 py-2"
  const labelSize = size === "lg" ? "text-sm" : size === "sm" ? "text-[11px]" : "text-[13px]"
  return (
    <div
      className={`flex items-center gap-3 rounded-full ${pad} ${TONE_BG[tone]}`}
      role="status"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${labelSize} ${TONE_TEXT[tone]}`}>{label}</p>
        {detail && <p className="text-text-2 text-xs mt-0.5 truncate">{detail}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`shrink-0 ${labelSize} font-semibold ${TONE_TEXT[tone]} hover:underline cursor-pointer`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
