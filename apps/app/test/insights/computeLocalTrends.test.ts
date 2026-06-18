import type { NoopDatabase } from "../../app/services/db"
import { setActiveUserId } from "../../app/services/db/session"
import {
  upsertLocalDailyMetrics,
  upsertLocalNightFeatures,
  type LocalDailyMetricRow,
} from "../../app/services/db/repositories/derived"
import { computeLocalTrendsView } from "../../app/services/insights/computeLocalTrends"
import { makeTestDb } from "../db/helpers"

// makeTestDb returns a better-sqlite3-backed drizzle instance (same SQL
// dialect as the production op-sqlite driver). The repositories type their
// param as the op-sqlite NoopDatabase, so bridge across that library
// boundary with a single documented cast.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

const DAY = 24 * 60 * 60 * 1000
// Three recent days, well inside the 365-day window.
const D1 = Date.parse("2026-05-30T00:00:00.000Z")
const D2 = D1 + DAY
const D3 = D2 + DAY

function metricRow(id: string, dayDate: number, overrides: Partial<LocalDailyMetricRow>): LocalDailyMetricRow {
  return { id, dayDate, detectedSleepNights: 0, updatedAt: dayDate, ...overrides }
}

describe("computeLocalTrendsView", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("returns daily-metric series ordered ascending by date regardless of insert order", async () => {
    const db = testDb()
    // Insert out of chronological order to prove the query sorts.
    await upsertLocalDailyMetrics(db, [
      metricRow("local:3", D3, { strainScore: 12, stressAverage: 30 }),
      metricRow("local:1", D1, { strainScore: 8, stressAverage: 10 }),
      metricRow("local:2", D2, { strainScore: 10, stressAverage: 20 }),
    ])

    const view = await computeLocalTrendsView(db, 365)

    expect(view.strainTrend.map((p) => p.value)).toEqual([8, 10, 12])
    expect(view.strainTrend.map((p) => p.timestamp)).toEqual([
      new Date(D1).toISOString(),
      new Date(D2).toISOString(),
      new Date(D3).toISOString(),
    ])
    expect(view.stressTrend.map((p) => p.value)).toEqual([10, 20, 30])
  })

  it("drops rows whose value column is null (matches server toSeries)", async () => {
    const db = testDb()
    await upsertLocalDailyMetrics(db, [
      metricRow("local:1", D1, { spo2Average: 96 }),
      metricRow("local:2", D2, { spo2Average: null }),
      metricRow("local:3", D3, { spo2Average: 98 }),
    ])

    const view = await computeLocalTrendsView(db, 365)

    expect(view.spo2Trend.map((p) => p.value)).toEqual([96, 98])
    expect(view.spo2Trend.map((p) => p.timestamp)).toEqual([
      new Date(D1).toISOString(),
      new Date(D3).toISOString(),
    ])
  })

  it("derives dataPoints and hrv summary trend from night_features", async () => {
    const db = testDb()
    const baseNf = {
      sdnn: 50,
      continuity: 0.9,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 0.95,
      sleepEstimateHours: 7.5,
      sourceBlend: "Strap",
    }
    await upsertLocalNightFeatures(db, [
      { id: "nf:1", nightDate: D1, rmssd: 40, restingHeartRate: 55, respiratoryRate: 14, updatedAt: D1, ...baseNf },
      { id: "nf:2", nightDate: D2, rmssd: 42, restingHeartRate: 54, respiratoryRate: 14, updatedAt: D2, ...baseNf },
    ])

    const view = await computeLocalTrendsView(db, 365)

    expect(view.dataPoints).toBe(2)
    expect(view.hrvTrend.map((p) => p.value)).toEqual([40, 42])
    expect(view.summaries.hrv.current).toBe(42)
  })

  it("excludes rows outside the trailing window", async () => {
    const db = testDb()
    const old = Date.now() - 400 * DAY
    const recent = Date.now() - 2 * DAY
    await upsertLocalDailyMetrics(db, [
      metricRow("local:old", old, { strainScore: 1 }),
      metricRow("local:recent", recent, { strainScore: 9 }),
    ])

    const view = await computeLocalTrendsView(db, 30)

    expect(view.strainTrend.map((p) => p.value)).toEqual([9])
  })
})
