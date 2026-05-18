import { NumberTicker } from "@/components/magicui/number-ticker"

/**
 * Metric chip — Field Manual style. No box, no fill. Just a small-caps eyebrow,
 * a big serif number, and two thin baseline rows underneath.
 */
export function MetricChip({
  label,
  value,
  unit,
  avg14d,
  baseline,
}: {
  label: string
  value: number | null
  unit?: string
  avg14d?: number | null
  baseline?: number | null
}) {
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1)
  const decimalPlaces = value != null && !Number.isInteger(value) ? 1 : 0

  return (
    <div className="rule-strong pt-3 flex flex-col gap-2">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5">
        {value == null ? (
          <p className="font-mono text-[1.75rem] leading-none text-muted-foreground/60 tabular-nums">
            —
          </p>
        ) : (
          <>
            <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
              <NumberTicker value={value} decimalPlaces={decimalPlaces} />
            </p>
            {unit && (
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {unit}
              </p>
            )}
          </>
        )}
      </div>
      <div className="mt-1 space-y-1">
        <SubRow label="14-day avg" value={fmt(avg14d)} unit={unit} />
        <SubRow label="baseline" value={fmt(baseline)} unit={unit} />
      </div>
    </div>
  )
}

function SubRow({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex items-baseline justify-between text-muted-foreground rule-hair-b pb-1 last:border-b-0 last:pb-0">
      <span className="text-[11px]">{label}</span>
      <span className="font-mono text-[11px] tabular-nums">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  )
}
