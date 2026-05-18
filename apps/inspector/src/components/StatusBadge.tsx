import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_BG: Record<StatusTone, string> = {
  ok: "bg-success/15",
  warn: "bg-warning/15",
  error: "bg-destructive/10",
  neutral: "bg-muted border",
}
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
      className={cn("flex items-center gap-3 rounded-full", pad, TONE_BG[tone])}
      role="status"
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", TONE_DOT[tone])} />
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold", labelSize, TONE_TEXT[tone])}>{label}</p>
        {detail && <p className="text-muted-foreground text-xs mt-0.5 truncate">{detail}</p>}
      </div>
      {action && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={action.onClick}
          className={cn("shrink-0 font-semibold hover:bg-transparent hover:underline", TONE_TEXT[tone])}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
