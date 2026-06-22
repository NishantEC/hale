import { and, eq } from "drizzle-orm"

import type {
  HealthAssessment,
  HealthContributor,
  HealthViewModel,
} from "../api/viewModels"
import type { NoopDatabase } from "../db"
import { baselineProfile, dailyMetrics, nightFeatures, sleepDetections } from "../db/schema"
import { getActiveUserId } from "../db/session"
import { getUserProfile } from "../identity/userProfile"
import {
  aggregateNoopAge,
  chronologicalAge,
  coachingFor,
  computeContributors,
  computeVo2MaxUth,
  type ContributorInput,
  paceOfAging,
} from "./healthspan"

// ──────────────────────────────────────────────────────────────────
// On-device replacement for the server's `/views/health`. Mirrors
// `HealthAssessmentService.computeWeekly` + `buildContributorInputs`:
// reads 30-day / 6-month windows of the device's own `_origin='local'`
// derived rows, pulls demographics from the local MMKV profile, and
// produces a `HealthViewModel` (current assessment + trailing 12-week
// history + profile + needsDateOfBirth). HR-zone and strength inputs
// are null — the server leaves them null too.
//
// History is computed on the fly (the app stores no per-week rows) by
// recomputing each of the trailing 12 consecutive weeks, so Pace of
// Aging (which compares against the prior week) and the trend graph
// work without any server-stored assessments.
// ──────────────────────────────────────────────────────────────────

const LOCAL = "local" as const
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const HISTORY_WEEKS = 12

type NightFeatureRow = typeof nightFeatures.$inferSelect
type SleepDetectionRow = typeof sleepDetections.$inferSelect
type DailyMetricRow = typeof dailyMetrics.$inferSelect
type BaselineRow = typeof baselineProfile.$inferSelect

/** UTC Monday at 00:00 of the week containing `d` (matches the server). */
function startOfWeek(d: Date): Date {
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function meanOf(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x))
  if (v.length === 0) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

/** Mean of `pick(row)` across rows whose epoch-ms `date` falls in [from, to]. */
function windowMean<T>(
  rows: T[],
  date: (row: T) => number,
  pick: (row: T) => number | null | undefined,
  fromMs: number,
  toMs: number,
): number | null {
  const picked: (number | null | undefined)[] = []
  for (const row of rows) {
    const t = date(row)
    if (t >= fromMs && t <= toMs) picked.push(pick(row))
  }
  return meanOf(picked)
}

function buildInputs(
  weekStartMs: number,
  nf: NightFeatureRow[],
  sd: SleepDetectionRow[],
  dm: DailyMetricRow[],
  baseline: BaselineRow | null,
): { inputs: Record<string, ContributorInput>; hasData: boolean } {
  const thirtyDayStartMs = weekStartMs - 30 * DAY_MS
  const sixMonthStartMs = weekStartMs - 183 * DAY_MS

  const consistency30 = windowMean(dm, (m) => m.dayDate, (m) => m.sleepConsistencyScore, thirtyDayStartMs, weekStartMs)
  const consistency6mo = windowMean(dm, (m) => m.dayDate, (m) => m.sleepConsistencyScore, sixMonthStartMs, weekStartMs)

  const hours30 = windowMean(sd, (d) => d.nightDate, (d) => d.durationHours, thirtyDayStartMs, weekStartMs)
  const hours6mo = windowMean(sd, (d) => d.nightDate, (d) => d.durationHours, sixMonthStartMs, weekStartMs)

  const rhr30 = windowMean(nf, (n) => n.nightDate, (n) => n.restingHeartRate, thirtyDayStartMs, weekStartMs)
  const rhr6mo = windowMean(nf, (n) => n.nightDate, (n) => n.restingHeartRate, sixMonthStartMs, weekStartMs)

  const maxHr = baseline?.maxHeartRate ?? null
  const vo2max30 = rhr30 != null ? computeVo2MaxUth(rhr30, maxHr) : null
  const vo2max6mo = rhr6mo != null ? computeVo2MaxUth(rhr6mo, maxHr) : null

  // A week "has data" when any underlying signal exists in its 6-month
  // window — otherwise it would be a flat chronological-only row and we
  // exclude it from history (the server only stores weeks it computed).
  const hasData = consistency6mo != null || hours6mo != null || rhr6mo != null

  return {
    inputs: {
      sleepConsistency: { thirtyDayValue: consistency30, sixMonthValue: consistency6mo },
      hoursOfSleep: { thirtyDayValue: hours30, sixMonthValue: hours6mo },
      hrZones1to3: { thirtyDayValue: null, sixMonthValue: null },
      hrZones4to5: { thirtyDayValue: null, sixMonthValue: null },
      stepsDaily: { thirtyDayValue: null, sixMonthValue: null },
      strengthActivity: { thirtyDayValue: null, sixMonthValue: null },
      vo2max: { thirtyDayValue: vo2max30, sixMonthValue: vo2max6mo },
      rhr: { thirtyDayValue: rhr30, sixMonthValue: rhr6mo },
    },
    hasData,
  }
}

export async function computeLocalHealthView(
  db: NoopDatabase,
  weekStartIso?: string,
): Promise<HealthViewModel> {
  const userId = getActiveUserId()
  const profile = getUserProfile()
  const referenceDate = weekStartIso
    ? new Date(`${weekStartIso}T00:00:00.000Z`)
    : new Date()
  const generatedAt = new Date().toISOString()
  const needsDateOfBirth = !profile.dateOfBirth

  // No DOB (or a future DOB) ⇒ no chronological age ⇒ no assessment,
  // exactly like the server returning `current: null`.
  if (chronologicalAge(profile.dateOfBirth, referenceDate) == null) {
    return { current: null, history: [], profile, needsDateOfBirth }
  }

  const [nf, sd, dm, bl] = await Promise.all([
    db
      .select()
      .from(nightFeatures)
      .where(and(eq(nightFeatures.userId, userId), eq(nightFeatures._origin, LOCAL))),
    db
      .select()
      .from(sleepDetections)
      .where(and(eq(sleepDetections.userId, userId), eq(sleepDetections._origin, LOCAL))),
    db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics._origin, LOCAL))),
    db.select().from(baselineProfile).where(eq(baselineProfile.userId, userId)),
  ])
  const baseline = bl[0] ?? null

  const currentWeekStart = startOfWeek(referenceDate)

  // Recompute the trailing N weeks oldest → newest so Pace of Aging can
  // chain off the immediately-prior week's noopAge.
  const computed: { assessment: HealthAssessment; hasData: boolean }[] = []
  let prior: { noopAge: number; weekStart: Date } | null = null

  for (let k = HISTORY_WEEKS - 1; k >= 0; k--) {
    const weekStart = new Date(currentWeekStart.getTime() - k * WEEK_MS)
    const age = chronologicalAge(profile.dateOfBirth, weekStart)
    if (age == null) {
      prior = null
      continue
    }

    const { inputs, hasData } = buildInputs(weekStart.getTime(), nf, sd, dm, baseline)
    const contributors = computeContributors(inputs)
    const noopAge = aggregateNoopAge(age, contributors)
    const pace = paceOfAging(noopAge, weekStart, prior)
    const coaching = coachingFor(pace, age - noopAge)

    const contributorRows: HealthContributor[] = contributors.map((c) => ({
      key: c.key,
      label: c.label,
      section: c.section,
      thirtyDayValue: c.thirtyDayValue,
      sixMonthValue: c.sixMonthValue,
      unitsLabel: c.unitsLabel,
      axisLo: c.axisLo,
      axisHi: c.axisHi,
      direction: c.direction,
      impactYears: c.impactYears,
    }))

    const weekIso = toDateOnly(weekStart)
    computed.push({
      assessment: {
        id: `local-${weekIso}`,
        weekStart: weekIso,
        chronologicalAge: age,
        noopAge,
        paceOfAging: pace,
        contributors: contributorRows,
        coachingTitle: coaching.title,
        coachingBody: coaching.body,
        generatedAt,
      },
      hasData,
    })
    prior = { noopAge, weekStart }
  }

  const current = computed.length > 0 ? computed[computed.length - 1].assessment : null
  // Newest-first, matching the server's `ORDER BY weekStart DESC`, limited
  // to weeks that actually had data behind them.
  const history = computed
    .filter((c) => c.hasData)
    .map((c) => c.assessment)
    .reverse()

  return { current, history, profile, needsDateOfBirth }
}
