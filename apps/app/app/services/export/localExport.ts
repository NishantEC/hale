import { and, eq, gte } from "drizzle-orm"

import type { NoopDatabase } from "../db"
import {
  journalEntries,
  dailyMetrics,
  nightFeatures,
  sleepDetections,
  sleepStages,
  dailyScores,
  activityDetections,
  baselineProfile,
} from "../db/schema"
import { getActiveUserId } from "../db/session"

// Builds a single export object from the LOCAL SQLite DB for the given
// trailing window. Each derived/raw table is filtered by the active user
// and its date column; baselineProfile has no date column, so all of the
// user's rows are returned.
export async function buildLocalExport(
  db: NoopDatabase,
  windowDays: number,
): Promise<Record<string, unknown>> {
  const cutoffMs = Date.now() - windowDays * 86_400_000
  const userId = getActiveUserId()

  const [
    journalEntriesRows,
    dailyMetricsRows,
    nightFeaturesRows,
    sleepDetectionsRows,
    sleepStagesRows,
    dailyScoresRows,
    activityDetectionsRows,
    baselineProfileRows,
  ] = await Promise.all([
    db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), gte(journalEntries.timestamp, cutoffMs))),
    db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.dayDate, cutoffMs))),
    db
      .select()
      .from(nightFeatures)
      .where(and(eq(nightFeatures.userId, userId), gte(nightFeatures.nightDate, cutoffMs))),
    db
      .select()
      .from(sleepDetections)
      .where(and(eq(sleepDetections.userId, userId), gte(sleepDetections.nightDate, cutoffMs))),
    db
      .select()
      .from(sleepStages)
      .where(and(eq(sleepStages.userId, userId), gte(sleepStages.nightDate, cutoffMs))),
    db
      .select()
      .from(dailyScores)
      .where(and(eq(dailyScores.userId, userId), gte(dailyScores.dayDate, cutoffMs))),
    db
      .select()
      .from(activityDetections)
      .where(and(eq(activityDetections.userId, userId), gte(activityDetections.startTime, cutoffMs))),
    db.select().from(baselineProfile).where(eq(baselineProfile.userId, userId)),
  ])

  return {
    exportedAt: new Date().toISOString(),
    windowDays,
    journalEntries: journalEntriesRows,
    dailyMetrics: dailyMetricsRows,
    nightFeatures: nightFeaturesRows,
    sleepDetections: sleepDetectionsRows,
    sleepStages: sleepStagesRows,
    dailyScores: dailyScoresRows,
    activityDetections: activityDetectionsRows,
    baselineProfile: baselineProfileRows,
  }
}
