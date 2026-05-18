import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-[var(--sage)]",
  warn: "bg-[var(--warning)]",
  error: "bg-[var(--vermillion)]",
  neutral: "bg-foreground/40",
}
const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-foreground",
  warn: "text-foreground",
  error: "text-[var(--vermillion)]",
  neutral: "text-foreground",
}

/**
 * Status tile — Field Manual style. Thick top rule, no fill, no rounding.
 * Title in serif display, detail in small body, optional inline action as text link.
 */
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
  const titleClass =
    size === "lg"
      ? "font-display text-[1.5rem] leading-tight tracking-tight"
      : size === "sm"
      ? "text-sm font-semibold leading-tight"
      : "font-display text-[1.125rem] leading-tight tracking-tight"
  return (
    <div className="flex flex-col gap-1.5 rule-strong pt-3" role="status">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
        <div className={cn("flex-1 min-w-0", titleClass, TONE_TEXT[tone])}>
          {label}
        </div>
        {action && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={action.onClick}
            className="shrink-0 px-0 h-auto py-0 eyebrow text-[var(--vermillion)] hover:underline"
          >
            {action.label}
          </Button>
        )}
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
      )}
    </div>
  )
}
