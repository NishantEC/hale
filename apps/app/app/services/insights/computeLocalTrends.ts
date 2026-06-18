import { and, asc, eq, gte } from "drizzle-orm"

import type { SeriesPoint, TrendsViewModel } from "../api/noopClient"
import type { NoopDatabase } from "../db"
import { dailyMetrics, dailyScores, nightFeatures, sleepDetections } from "../db/schema"
import { getActiveUserId } from "../db/session"

const LOCAL = "local" as const

// On-device port of the backend `ViewsService.getTrendsView`. Reads the
// device's own `_origin='local'` derived rows over a trailing `days` window
// and assembles the same `TrendsViewModel` the screens expect. Local date
// columns are epoch-ms integers; the backend stored Dates and emitted
// `.toISOString()`, so we convert through `new Date(ms).toISOString()` to keep
// the series timestamps byte-identical to the server's.
// Mirrors the server's `toSeries`: keep rows whose value is non-null, map to
// {timestamp, value}. Rows arrive pre-sorted ascending by their date column.
function toSeries<T>(
  rows: T[],
  dateMs: (row: T) => number,
  value: (row: T) => number | null,
): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (const row of rows) {
    const v = value(row)
    if (v == null) continue
    out.push({ timestamp: new Date(dateMs(row)).toISOString(), value: v })
  }
  return out
}

export async function computeLocalTrendsView(
  db: NoopDatabase,
  days: number = 30,
): Promise<TrendsViewModel> {
  const userId = getActiveUserId()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  const [nf, dm, dsc, sd] = await Promise.all([
    db
      .select()
      .from(nightFeatures)
      .where(
        and(
          eq(nightFeatures.userId, userId),
          eq(nightFeatures._origin, LOCAL),
          gte(nightFeatures.nightDate, cutoff),
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
          gte(dailyMetrics.dayDate, cutoff),
        ),
      )
      .orderBy(asc(dailyMetrics.dayDate)),
    db
      .select()
      .from(dailyScores)
      .where(
        and(
          eq(dailyScores.userId, userId),
          eq(dailyScores._origin, LOCAL),
          gte(dailyScores.dayDate, cutoff),
        ),
      )
      .orderBy(asc(dailyScores.dayDate)),
    db
      .select()
      .from(sleepDetections)
      .where(
        and(
          eq(sleepDetections.userId, userId),
          eq(sleepDetections._origin, LOCAL),
          gte(sleepDetections.nightDate, cutoff),
        ),
      )
      .orderBy(asc(sleepDetections.nightDate)),
  ])

  // Nightly autonomic / vitals series (night_features).
  const hrvTrend = toSeries(nf, (r) => r.nightDate, (r) => r.rmssd)
  const restingHrTrend = toSeries(nf, (r) => r.nightDate, (r) => r.restingHeartRate)
  const respiratoryRateTrend = toSeries(nf, (r) => r.nightDate, (r) => r.respiratoryRate)

  // Daily metrics series.
  const spo2Trend = toSeries(dm, (r) => r.dayDate, (r) => r.spo2Average)
  const trainingLoadTrend = toSeries(dm, (r) => r.dayDate, (r) => r.trainingLoadRatio)
  const consistencyTrend = toSeries(dm, (r) => r.dayDate, (r) => r.sleepConsistencyScore)
  const strainTrend = toSeries(dm, (r) => r.dayDate, (r) => r.strainScore)
  const stressTrend = toSeries(dm, (r) => r.dayDate, (r) => r.stressAverage)

  // Sleep duration (rounded to 0.1h) and recovery (daily balance) series.
  const sleepDurationTrend: SeriesPoint[] = sd.map((d) => ({
    timestamp: new Date(d.nightDate).toISOString(),
    value: Math.round(d.durationHours * 10) / 10,
  }))
  const recoveryTrend: SeriesPoint[] = dsc.map((s) => ({
    timestamp: new Date(s.dayDate).toISOString(),
    value: s.dailyBalance,
  }))

  // Summaries — current vs 7-nights-ago comparison for the key vitals.
  const latest = nf.length > 0 ? nf[nf.length - 1] : null
  const weekAgoIdx = Math.max(0, nf.length - 8)
  const weekAgo = nf.length > 7 ? nf[weekAgoIdx] : null

  const summaries = {
    hrv: {
      current: latest?.rmssd ?? null,
      weekAgo: weekAgo?.rmssd ?? null,
      trend:
        latest && weekAgo
          ? latest.rmssd > weekAgo.rmssd
            ? "improving"
            : latest.rmssd < weekAgo.rmssd
              ? "declining"
              : "stable"
          : null,
    },
    restingHr: {
      current: latest?.restingHeartRate ?? null,
      weekAgo: weekAgo?.restingHeartRate ?? null,
      trend:
        latest && weekAgo
          ? latest.restingHeartRate < weekAgo.restingHeartRate
            ? "improving"
            : latest.restingHeartRate > weekAgo.restingHeartRate
              ? "declining"
              : "stable"
          : null,
    },
    sleepDuration: {
      avgHours:
        sd.length > 0
          ? Math.round((sd.reduce((sum, d) => sum + d.durationHours, 0) / sd.length) * 10) / 10
          : null,
      nights: sd.length,
    },
  }

  return {
    days,
    dataPoints: nf.length,
    hrvTrend,
    restingHrTrend,
    sleepDurationTrend,
    recoveryTrend,
    trainingLoadTrend,
    consistencyTrend,
    strainTrend,
    stressTrend,
    respiratoryRateTrend,
    spo2Trend,
    summaries,
  }
}
