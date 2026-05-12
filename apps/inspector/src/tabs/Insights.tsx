import type {
  BaselineProfileRow,
  JournalCorrelation,
  SleepNight,
  TrendsView,
} from "../api"
import { Pill, SectionHead } from "../components/primitives"
import { formatNumber } from "../format"

// "Why is today different?" — compares the selected night's features
// against the user's baseline_profile, ranks deltas by magnitude, and
// surfaces journal correlations.
//
// Direction semantics:
// - RMSSD (HRV) higher = better. RHR lower = better. Duration: target is
//   the planned sleep window; below = bad. We classify each delta as
//   good / bad / neutral so the user knows what to feel about it.

type DeltaTone = "good" | "bad" | "neutral"

type DeltaCard = {
  label: string
  unit: string
  current: number | null
  baseline: number | null
  tone: DeltaTone
  delta: number | null
  pctOfBaseline: number | null
  hint: string
}

function classify(
  delta: number | null,
  direction: "lowerIsBetter" | "higherIsBetter",
  threshold = 0,
): DeltaTone {
  if (delta == null) return "neutral"
  if (Math.abs(delta) <= threshold) return "neutral"
  const goodSign = direction === "higherIsBetter" ? 1 : -1
  return delta * goodSign > 0 ? "good" : "bad"
}

function buildDeltas(
  sleep: SleepNight | null,
  baseline: BaselineProfileRow | null,
): DeltaCard[] {
  const feat = sleep?.selectedNightFeature ?? null
  const det = sleep?.selectedDetection ?? null

  const pct = (cur: number | null, base: number | null) =>
    cur != null && base != null && base !== 0
      ? ((cur - base) / base) * 100
      : null
  const diff = (cur: number | null, base: number | null) =>
    cur != null && base != null ? cur - base : null

  const cards: DeltaCard[] = [
    {
      label: "HRV (RMSSD)",
      unit: " ms",
      current: feat?.rmssd ?? null,
      baseline: baseline?.rmssd ?? null,
      delta: diff(feat?.rmssd ?? null, baseline?.rmssd ?? null),
      pctOfBaseline: pct(feat?.rmssd ?? null, baseline?.rmssd ?? null),
      tone: classify(
        diff(feat?.rmssd ?? null, baseline?.rmssd ?? null),
        "higherIsBetter",
        1,
      ),
      hint: "Higher than baseline → autonomic balance trending well.",
    },
    {
      label: "Resting HR",
      unit: " bpm",
      current: feat?.restingHeartRate ?? null,
      baseline: baseline?.restingHeartRate ?? null,
      delta: diff(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
      pctOfBaseline: pct(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
      tone: classify(
        diff(feat?.restingHeartRate ?? null, baseline?.restingHeartRate ?? null),
        "lowerIsBetter",
        1,
      ),
      hint: "Lower is generally better. Elevated RHR can flag illness or training stress.",
    },
    {
      label: "SDNN",
      unit: " ms",
      current: feat?.sdnn ?? null,
      baseline: baseline?.sdnn ?? null,
      delta: diff(feat?.sdnn ?? null, baseline?.sdnn ?? null),
      pctOfBaseline: pct(feat?.sdnn ?? null, baseline?.sdnn ?? null),
      tone: classify(
        diff(feat?.sdnn ?? null, baseline?.sdnn ?? null),
        "higherIsBetter",
        1,
      ),
      hint: "SD of all NN intervals — overall HRV including circadian variability.",
    },
    {
      label: "Sleep duration",
      unit: "h",
      current: det?.durationHours ?? null,
      baseline: null,
      delta: null,
      pctOfBaseline: null,
      tone: "neutral",
      hint: "Compare to your sleep plan target — see the planner.",
    },
  ]

  return cards
}

export function InsightsTab({
  sleep,
  baseline,
  trends,
  journalCorrelations,
}: {
  sleep: SleepNight | null
  baseline: BaselineProfileRow | null
  trends: TrendsView | null
  journalCorrelations: JournalCorrelation[]
}) {
  const cards = buildDeltas(sleep, baseline)
  // Rank by |delta| so the top of the page is what actually moved most.
  const ranked = [...cards].sort((a, b) => {
    const av = Math.abs(a.pctOfBaseline ?? 0)
    const bv = Math.abs(b.pctOfBaseline ?? 0)
    return bv - av
  })
  const headline = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Why is today different?</SectionHead>
          {baseline ? (
            <span className="text-text-2 text-xs">
              baseline · {baseline.nightsUsed} nights
            </span>
          ) : (
            <Pill tone="yellow">baseline not yet warmed up</Pill>
          )}
        </div>
        {!sleep?.selectedNightFeature ? (
          <p className="text-text-2 text-sm">
            No night selected for this date — nothing to compare yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              {headline.map((c) => (
                <DeltaTile key={c.label} card={c} />
              ))}
            </div>
            {rest.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                {rest.map((c) => (
                  <DeltaTile key={c.label} card={c} compact />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Week-over-week direction</SectionHead>
          <span className="text-text-2 text-xs">
            from /views/trends summaries
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <DirectionCard
            label="HRV"
            current={trends?.summaries.hrv.current ?? null}
            weekAgo={trends?.summaries.hrv.weekAgo ?? null}
            trend={trends?.summaries.hrv.trend ?? null}
            direction="higherIsBetter"
            unit=" ms"
            decimals={1}
          />
          <DirectionCard
            label="Resting HR"
            current={trends?.summaries.restingHr.current ?? null}
            weekAgo={trends?.summaries.restingHr.weekAgo ?? null}
            trend={trends?.summaries.restingHr.trend ?? null}
            direction="lowerIsBetter"
            unit=" bpm"
            decimals={0}
          />
          <DirectionCard
            label="Avg sleep duration"
            current={trends?.summaries.sleepDuration.avgHours ?? null}
            weekAgo={null}
            trend={null}
            direction="neutral"
            unit="h"
            decimals={1}
          />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Journal factor correlations</SectionHead>
          <span className="text-text-2 text-xs">
            from /debug/pipeline-results
          </span>
        </div>
        {journalCorrelations.length === 0 ? (
          <p className="text-text-2 text-sm">
            No journal entries yet, or not enough samples per factor to
            draw a correlation. Log a few nights' factors in the app and
            this will populate.
          </p>
        ) : (
          <div className="overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>
                  {["Factor", "Samples", "Δ Deep min", "Δ REM min", "Δ Duration h"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {journalCorrelations.map((c) => (
                  <tr
                    key={c.factorTag}
                    className="border-b border-border/50 hover:bg-surface-1"
                  >
                    <td className="px-4 py-2.5 font-medium">{c.factorTag}</td>
                    <td className="px-4 py-2.5 text-text-1">{c.sampleCount}</td>
                    <DeltaCell value={c.avgDeepDelta} higherBetter />
                    <DeltaCell value={c.avgRemDelta} higherBetter />
                    <DeltaCell value={c.avgDurationDelta} higherBetter />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaTile({ card, compact }: { card: DeltaCard; compact?: boolean }) {
  const toneClass =
    card.tone === "good"
      ? "border-green/40"
      : card.tone === "bad"
      ? "border-red/40"
      : "border-border"
  return (
    <div
      className={`bg-surface-1 border ${toneClass} rounded-2xl p-4 ${
        compact ? "" : "min-h-32"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-text-2 text-xs uppercase tracking-wider">{card.label}</p>
        {card.tone === "good" && <Pill tone="green">good</Pill>}
        {card.tone === "bad" && <Pill tone="yellow">below baseline</Pill>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          {formatNumber(card.current, 1)}
        </span>
        <span className="text-text-2 text-sm">{card.unit}</span>
      </div>
      <p className="text-text-2 text-xs mt-1">
        baseline {formatNumber(card.baseline, 1)}
        {card.delta != null && (
          <>
            {" · "}
            <span
              className={
                card.tone === "good"
                  ? "text-green"
                  : card.tone === "bad"
                  ? "text-yellow"
                  : "text-text-1"
              }
            >
              {card.delta > 0 ? "+" : ""}
              {card.delta.toFixed(1)}
              {card.pctOfBaseline != null && (
                <> ({card.pctOfBaseline > 0 ? "+" : ""}{card.pctOfBaseline.toFixed(0)}%)</>
              )}
            </span>
          </>
        )}
      </p>
      {!compact && (
        <p className="text-text-2 text-xs mt-2 leading-snug">{card.hint}</p>
      )}
    </div>
  )
}

function DirectionCard({
  label,
  current,
  weekAgo,
  trend,
  direction,
  unit,
  decimals,
}: {
  label: string
  current: number | null
  weekAgo: number | null
  trend: "improving" | "declining" | "stable" | null
  direction: "lowerIsBetter" | "higherIsBetter" | "neutral"
  unit: string
  decimals: number
}) {
  const delta = current != null && weekAgo != null ? current - weekAgo : null
  return (
    <div className="bg-surface-1 border border-border rounded-2xl p-4">
      <p className="text-text-2 text-xs uppercase tracking-wider">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          {formatNumber(current, decimals)}
        </span>
        <span className="text-text-2 text-sm">{unit}</span>
      </div>
      <p className="text-text-2 text-xs mt-1">
        {delta != null
          ? `${delta > 0 ? "+" : ""}${delta.toFixed(decimals)}${unit} vs week ago`
          : "—"}
      </p>
      <div className="mt-2">
        {trend === "improving" && <Pill tone="green">improving</Pill>}
        {trend === "declining" && <Pill tone="yellow">declining</Pill>}
        {trend === "stable" && <Pill tone="neutral">stable</Pill>}
        {trend == null && direction !== "neutral" && (
          <Pill tone="neutral">not enough data</Pill>
        )}
      </div>
    </div>
  )
}

function DeltaCell({
  value,
  higherBetter,
}: {
  value: number
  higherBetter: boolean
}) {
  if (!Number.isFinite(value))
    return <td className="px-4 py-2.5 text-text-2">—</td>
  const tone = value > 0 === higherBetter ? "text-green" : "text-yellow"
  return (
    <td className={`px-4 py-2.5 font-medium ${tone}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}
    </td>
  )
}
