import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-muted-foreground",
}
const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  neutral: "text-foreground",
}

// Hero status tile. Bg-card surface (no border), label + state + detail
// stacked, optional inline action button. Used 3-across on Home.
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
  const pad =
    size === "lg" ? "px-5 py-4" : size === "sm" ? "px-3 py-2" : "px-4 py-3"
  return (
    <div className={cn("flex items-start gap-3 rounded-lg bg-card", pad)} role="status">
      <span className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", TONE_DOT[tone])} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-[14px] font-semibold leading-tight", TONE_TEXT[tone])}>
          {label}
        </p>
        {detail && (
          <p className="text-[12px] text-muted-foreground mt-1 truncate">{detail}</p>
        )}
      </div>
      {action && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={action.onClick}
          className={cn(
            "shrink-0 -my-1 h-7 px-2 text-[12px] font-semibold hover:bg-transparent hover:underline",
            TONE_TEXT[tone],
          )}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
