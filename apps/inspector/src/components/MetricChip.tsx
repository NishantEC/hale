// One of the four chips below the Home hero hypnogram. Shows today's
// value, a 14-day average, and a baseline as three stacked dots so the
// eye picks up "is today above or below my normal" in one glance.

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
  return (
    <div className="bg-surface-raised rounded-xl p-4">
      <p className="text-text-2 text-xs uppercase tracking-wider font-semibold">{label}</p>
      <div className="flex items-baseline gap-1 mt-2">
        <p className="text-2xl font-semibold tabular-nums">{fmt(value)}</p>
        {unit && <p className="text-text-2 text-xs">{unit}</p>}
      </div>
      <div className="mt-3 space-y-1">
        <Row label="14d avg" value={fmt(avg14d)} unit={unit} dim />
        <Row label="baseline" value={fmt(baseline)} unit={unit} dim />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  unit,
  dim,
}: {
  label: string
  value: string
  unit?: string
  dim?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between ${dim ? "text-text-2" : ""}`}>
      <span className="text-[11px]">{label}</span>
      <span className="text-[11px] tabular-nums">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  )
}
