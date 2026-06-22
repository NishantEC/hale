import { and, asc, eq, gt } from "drizzle-orm"

import type {
  FactorImpact,
  ImpactConfidence,
  InsightMetric,
  InsightsViewModel,
  MetricInsights,
} from "../api/viewModels"
import type { NoopDatabase } from "../db"
import { dailyMetrics, dailyScores, journalEntries, nightFeatures } from "../db/schema"
import { getActiveUserId } from "../db/session"

const LOCAL = "local" as const

// The mean-delta correlator needs at least 3 days WITH the factor and 3
// days WITHOUT it to surface a result — anything below that is noise.
const MIN_SAMPLE_SIZE = 3
// Minimum total tracked days before we even attempt insights.
const MIN_TOTAL_DAYS = 14

// On-device port of the backend `JournalService.buildInsights`. Reads the
// device's own journal entries plus its `_origin='local'` derived rows over a
// trailing window and runs the same mean-delta correlator the server did.
//
// One necessary substitution: the backend's `daily_scores.sleepScore` column
// does not exist locally, so the "sleep" metric is sourced from
// `daily_metrics.sleepArchitectureScore` — the device-computed 0–100
// sleep-quality score (higher is better), kept distinct from "recovery"
// (dailyBalance). Every other metric maps one-to-one with the server.

export async function computeLocalInsightsView(
  db: NoopDatabase,
  windowDays: number = 30,
): Promise<InsightsViewModel> {
  const userId = getActiveUserId()
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const [entries, scores, nights, metrics] = await Promise.all([
    db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), gt(journalEntries.timestamp, since)))
      .orderBy(asc(journalEntries.timestamp)),
    db
      .select()
      .from(dailyScores)
      .where(
        and(
          eq(dailyScores.userId, userId),
          eq(dailyScores._origin, LOCAL),
          gt(dailyScores.dayDate, since),
        ),
      )
      .orderBy(asc(dailyScores.dayDate)),
    db
      .select()
      .from(nightFeatures)
      .where(
        and(
          eq(nightFeatures.userId, userId),
          eq(nightFeatures._origin, LOCAL),
          gt(nightFeatures.nightDate, since),
        ),
      )
      .orderBy(asc(nightFeatures.nightDate)),
    db
      .select()
      .from(dailyMetrics)
      .where(
        and(
          eq(dailyMetrics.userId, userId),
          eq(dailyMetrics._origin, LOCAL),
          gt(dailyMetrics.dayDate, since),
        ),
      )
      .orderBy(asc(dailyMetrics.dayDate)),
  ])

  // Tag → set of dayKeys the factor was logged on (YYYY-MM-DD).
  const factorDays = new Map<string, Set<string>>()
  for (const e of entries) {
    const k = dayKey(e.timestamp)
    const set = factorDays.get(e.factorTag) ?? new Set<string>()
    set.add(k)
    factorDays.set(e.factorTag, set)
  }

  // Tracked-day universe is derived from daily_scores (one row per scored day).
  const dayKeys = new Set<string>()
  for (const s of scores) dayKeys.add(dayKey(s.dayDate))
  const totalDays = dayKeys.size

  if (totalDays < MIN_TOTAL_DAYS) {
    return {
      windowDays,
      totalDays,
      hasEnoughData: false,
      daysUntilReady: Math.max(0, MIN_TOTAL_DAYS - totalDays),
      insights: [],
    }
  }

  const sleepByDay = new Map<string, number>()
  const recoveryByDay = new Map<string, number>()
  const hrvByDay = new Map<string, number>()
  const strainByDay = new Map<string, number>()
  for (const s of scores) {
    recoveryByDay.set(dayKey(s.dayDate), s.dailyBalance)
  }
  for (const n of nights) {
    if (n.rmssd != null && n.rmssd > 0) hrvByDay.set(dayKey(n.nightDate), n.rmssd)
  }
  for (const m of metrics) {
    const k = dayKey(m.dayDate)
    if (m.strainScore != null) strainByDay.set(k, m.strainScore)
    if (m.sleepArchitectureScore != null) sleepByDay.set(k, m.sleepArchitectureScore)
  }

  const allDays = Array.from(dayKeys)

  const insights: MetricInsights[] = [
    metricInsights("sleep", "Sleep score", sleepByDay, factorDays, allDays, true),
    metricInsights("recovery", "Recovery", recoveryByDay, factorDays, allDays, true),
    metricInsights("hrv", "HRV (ms)", hrvByDay, factorDays, allDays, true),
    metricInsights("strain", "Strain", strainByDay, factorDays, allDays, false),
  ]

  return {
    windowDays,
    totalDays,
    hasEnoughData: true,
    daysUntilReady: 0,
    insights,
  }
}

// Mean-delta correlator for a single metric: for each factor logged at least
// MIN_SAMPLE_SIZE times in the window, compare mean(metric|factor) vs
// mean(metric|no factor). Sorted by confidence-weighted impact.
function metricInsights(
  metric: InsightMetric,
  metricLabel: string,
  metricByDay: Map<string, number>,
  factorDays: Map<string, Set<string>>,
  allDays: string[],
  higherIsBetter: boolean,
): MetricInsights {
  const factors: FactorImpact[] = []

  for (const [tag, daysWithSet] of factorDays.entries()) {
    const withVals: number[] = []
    const withoutVals: number[] = []

    for (const day of allDays) {
      const value = metricByDay.get(day)
      if (value == null) continue
      if (daysWithSet.has(day)) withVals.push(value)
      else withoutVals.push(value)
    }

    if (withVals.length < MIN_SAMPLE_SIZE) continue
    if (withoutVals.length < MIN_SAMPLE_SIZE) continue

    const meanWith = mean(withVals)
    const meanWithout = mean(withoutVals)
    const delta = meanWith - meanWithout
    // Higher = better (sleep, recovery, hrv): positive delta means the factor
    // helps. For strain, render as raw delta and let the UI frame it.
    const helps = higherIsBetter ? delta > 0 : delta < 0

    const minSamples = Math.min(withVals.length, withoutVals.length)
    const confidence: ImpactConfidence =
      minSamples >= 10 ? "high" : minSamples >= 5 ? "medium" : "low"

    factors.push({
      factorTag: tag,
      daysWith: withVals.length,
      daysWithout: withoutVals.length,
      meanWith: round1(meanWith),
      meanWithout: round1(meanWithout),
      delta: round1(delta),
      helps,
      confidence,
    })
  }

  // Sort by confidence-weighted impact: |delta| × weight (high=1.0,
  // medium=0.7, low=0.4).
  const weight: Record<ImpactConfidence, number> = { high: 1.0, medium: 0.7, low: 0.4 }
  factors.sort(
    (a, b) =>
      Math.abs(b.delta) * weight[b.confidence] - Math.abs(a.delta) * weight[a.confidence],
  )

  return {
    metric,
    metricLabel,
    sampleDays: allDays.length,
    factors,
  }
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
