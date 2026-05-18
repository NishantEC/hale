import { NumberTicker } from "@/components/magicui/number-ticker"
import { Card } from "@/components/ui/card"

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
    <Card className="rounded-xl p-4 gap-0">
      <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
        {label}
      </p>
      <div className="flex items-baseline gap-1 mt-2">
        {value == null ? (
          <p className="text-2xl font-semibold tabular-nums">—</p>
        ) : (
          <p className="text-2xl font-semibold tabular-nums">
            <NumberTicker value={value} decimalPlaces={decimalPlaces} />
          </p>
        )}
        {unit && <p className="text-muted-foreground text-xs">{unit}</p>}
      </div>
      <div className="mt-3 space-y-1">
        <SubRow label="14d avg" value={fmt(avg14d)} unit={unit} />
        <SubRow label="baseline" value={fmt(baseline)} unit={unit} />
      </div>
    </Card>
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
    <div className="flex items-baseline justify-between text-muted-foreground">
      <span className="text-[11px]">{label}</span>
      <span className="text-[11px] tabular-nums">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  )
}
