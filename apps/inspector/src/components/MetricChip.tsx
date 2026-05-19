import { Card } from "@/components/ui/card"
import type { AccentKey, Delta } from "@/components/primitives"
import { DeltaChip } from "@/components/primitives"
import { cn } from "@/lib/utils"

const ACCENT_TEXT: Record<AccentKey, string> = {
  cyan: "text-[var(--accent-cyan)]",
  magenta: "text-[var(--accent-magenta)]",
  lime: "text-[var(--accent-lime)]",
  amber: "text-[var(--accent-amber)]",
}

export function MetricChip({
  label,
  value,
  unit,
  avg14d,
  baseline,
  accent,
}: {
  label: string
  value: number | null
  unit?: string
  avg14d?: number | null
  baseline?: number | null
  accent?: AccentKey
}) {
  const decimalPlaces = value != null && !Number.isInteger(value) ? 1 : 0
  const color = accent ? ACCENT_TEXT[accent] : "text-foreground"

  const delta: Delta | null = ((): Delta | null => {
    if (value == null) return null
    const ref = baseline ?? avg14d
    if (ref == null) return null
    const diff = value - ref
    if (Math.abs(diff) < 0.05) return { kind: "same", text: "— at base" }
    const sign = diff > 0 ? "+" : ""
    const magnitude = Math.abs(diff) >= 10 ? diff.toFixed(0) : diff.toFixed(1)
    return diff > 0
      ? { kind: "up", text: `${sign}${magnitude} vs base` }
      : { kind: "down", text: `${magnitude} vs base` }
  })()

  return (
    <Card accent={accent}>
      <p className="eyebrow">{label}</p>
      <div className="flex items-baseline gap-1.5">
        {value == null ? (
          <p className="font-mono text-[1.5rem] leading-none text-muted-foreground/60 tabular-nums">
            —
          </p>
        ) : (
          <>
            <p
              className={cn(
                "text-[1.875rem] leading-none font-bold tabular-nums tracking-tight",
                color,
              )}
            >
              {decimalPlaces > 0 ? value.toFixed(decimalPlaces) : Math.round(value)}
            </p>
            {unit && (
              <span className="font-mono text-xs text-muted-foreground">{unit}</span>
            )}
          </>
        )}
      </div>
      {delta && <DeltaChip kind={delta.kind}>{delta.text}</DeltaChip>}
    </Card>
  )
}
