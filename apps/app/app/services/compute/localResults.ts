import { and, asc, eq } from "drizzle-orm"

import type { PipelineResults } from "../api/viewModels"
import type { NoopDatabase } from "../db"
import {
  baselineProfile,
  dailyMetrics,
  dailyScores,
  nightFeatures,
  sleepDetections,
  sleepPlans,
  sleepStages,
} from "../db/schema"
import { getActiveUserId } from "../db/session"

const LOCAL = "local" as const

// ──────────────────────────────────────────────────────────────────
// Assemble the `PipelineResults` shape the screens' view builders expect,
// reading the device's own `_origin='local'` derived rows. This is the
// local-first replacement for the server's `/pipeline/results`. Row date
// fields stay epoch-ms; the builders convert them via `new Date(...)`, so no
// reshaping is needed. `typicalRanges`/`journalCorrelations` were server-only
// aggregates the home/sleep builders don't consume.
// ──────────────────────────────────────────────────────────────────

export async function loadLocalPipelineResults(db: NoopDatabase): Promise<PipelineResults> {
  const userId = getActiveUserId()
  const [nf, sd, ss, dsc, dm, bl, sp] = await Promise.all([
    db
      .select()
      .from(nightFeatures)
      .where(and(eq(nightFeatures.userId, userId), eq(nightFeatures._origin, LOCAL)))
      .orderBy(asc(nightFeatures.nightDate)),
    db
      .select()
      .from(sleepDetections)
      .where(and(eq(sleepDetections.userId, userId), eq(sleepDetections._origin, LOCAL)))
      .orderBy(asc(sleepDetections.nightDate)),
    db
      .select()
      .from(sleepStages)
      .where(and(eq(sleepStages.userId, userId), eq(sleepStages._origin, LOCAL)))
      .orderBy(asc(sleepStages.nightDate)),
    db
      .select()
      .from(dailyScores)
      .where(and(eq(dailyScores.userId, userId), eq(dailyScores._origin, LOCAL)))
      .orderBy(asc(dailyScores.dayDate)),
    db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics._origin, LOCAL)))
      .orderBy(asc(dailyMetrics.dayDate)),
    db.select().from(baselineProfile).where(eq(baselineProfile.userId, userId)),
    db.select().from(sleepPlans).where(eq(sleepPlans.userId, userId)),
  ])

  return {
    nightFeatures: nf,
    sleepDetections: sd,
    sleepStages: ss,
    dailyScores: dsc,
    dailyMetrics: dm,
    baselineProfile: bl[0] ?? null,
    sleepPlan: sp[0] ?? null,
    typicalRanges: null,
    journalCorrelations: [],
  }
}
