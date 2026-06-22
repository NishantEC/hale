import { type ContributorItem } from "@/components/health/ContributorList"
import { type NumBlockDirection } from "@/components/health/NumBlock"
import { type HealthVital } from "@/services/api/viewModels"

// Whether a rising value is an improvement. Skin-temp delta is special-cased
// (closer to zero is better) by the caller below.
const HIGHER_IS_BETTER: Record<string, boolean> = {
  hrv: true,
  rhr: false,
  rr: false,
  spo2: true,
  skinTemp: false,
}

export function fmtVital(key: string, n: number): string {
  if (key === "hrv" || key === "rhr") return `${Math.round(n)}`
  return n.toFixed(1)
}

/**
 * Turn the backend per-vital today/avg7d/avg30d numbers into ContributorList
 * rows for one baseline frame. Delta colour encodes good/bad (green = better),
 * not raw direction — so e.g. a resting-HR drop reads green.
 */
export function buildVitalContributors(
  vitals: HealthVital[],
  frame: "avg7d" | "avg30d",
): ContributorItem[] {
  const items: ContributorItem[] = []
  for (const v of vitals) {
    if (v.today == null) continue
    const baseline = frame === "avg7d" ? v.avg7d : v.avg30d
    let deltaText: string | null = null
    let direction: NumBlockDirection = "flat"
    if (baseline != null) {
      const delta = v.today - baseline
      if (Math.abs(delta) >= 0.05) {
        const improving =
          v.key === "skinTemp"
            ? Math.abs(v.today) < Math.abs(baseline)
            : HIGHER_IS_BETTER[v.key]
              ? delta > 0
              : delta < 0
        direction = improving ? "up" : "down"
      }
      deltaText = `${delta >= 0 ? "+" : ""}${fmtVital(v.key, delta)}`
    }
    items.push({
      key: v.key,
      label: v.label,
      value: fmtVital(v.key, v.today),
      unit: v.unit,
      baseline: baseline != null ? fmtVital(v.key, baseline) : "—",
      deltaText,
      direction,
    })
  }
  return items
}
