import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  neutral: "bg-white/30",
}

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
      ? "text-base font-semibold"
      : size === "sm"
      ? "text-xs font-semibold"
      : "text-sm font-semibold"
  return (
    <Card role="status">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
        <div className={cn("flex-1 min-w-0 leading-tight tracking-tight", titleClass)}>
          {label}
        </div>
        {action && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={action.onClick}
            className="shrink-0 h-auto px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10"
          >
            {action.label}
          </Button>
        )}
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{detail}</p>
      )}
    </Card>
  )
}
