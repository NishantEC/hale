import type { JournalCorrelation } from "../api"

// Picks the highest-magnitude journal correlation that meets the
// minimum sample-count threshold and returns a plain-English sentence
// describing it. Returns null when no correlation is strong enough.
export function pickTopCorrelationSentence(
  corrs: JournalCorrelation[],
  opts: { minEffect?: number; minSamples?: number } = {},
): string | null {
  const { minEffect = 0.3, minSamples = 3 } = opts

  const ranked = [...corrs]
    .map((c) => ({
      c,
      effect: Math.max(
        Math.abs(c.avgDeepDelta),
        Math.abs(c.avgRemDelta),
        Math.abs(c.avgDurationDelta / 60),
      ),
    }))
    .filter((x) => x.effect > minEffect && x.c.sampleCount >= minSamples)
    .sort((a, b) => b.effect - a.effect)

  if (ranked.length === 0) return null

  const { c } = ranked[0]
  const candidates: { metric: string; delta: number; unit: string }[] = [
    { metric: "deep sleep", delta: c.avgDeepDelta, unit: "min" },
    { metric: "REM", delta: c.avgRemDelta, unit: "min" },
    { metric: "sleep duration", delta: c.avgDurationDelta, unit: "min" },
  ]
  const top = candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
  const direction = top.delta >= 0 ? "more" : "less"
  const magnitude = Math.abs(Math.round(top.delta))
  return `On nights tagged "${c.factorTag}", you get ${magnitude} ${top.unit} ${direction} ${top.metric} on average (n=${c.sampleCount}).`
}
