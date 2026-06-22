import type { NoopDatabase } from "../../app/services/db"
import {
  buildFullDayRows,
  buildLocalHistoryRows,
  type DeviceHistoryOutput,
  type FullDayOutput,
  persistDeviceHistory,
  persistFullDay,
} from "../../app/services/compute/persistDeviceHistory"
import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { makeTestDb } from "../db/helpers"

const NIGHT_ISO = "2026-05-28T18:30:00.000Z"
const NIGHT_MS = Date.parse(NIGHT_ISO)

const sampleOutput: DeviceHistoryOutput = {
  nightFeatures: [
    {
      nightDate: NIGHT_ISO,
      restingHeartRate: 52,
      rmssd: 40,
      sdnn: 55,
      respiratoryRate: 14.5,
      continuity: 0.9,
      regularity: 0.8,
      validCoverage: 1,
      confidenceRaw: 0.95,
      sleepEstimateHours: 7.5,
      sourceBlend: "Strap",
    },
  ],
  sleepDetections: [
    {
      nightDate: NIGHT_ISO,
      bedtime: "2026-05-28T20:15:00.000Z",
      wakeTime: "2026-05-29T03:45:00.000Z",
      durationHours: 7.5,
      interruptionCount: 2,
      continuity: 0.9,
      regularity: 0.8,
      validCoverage: 1,
      confidence: 0.92,
    },
  ],
}

// makeTestDb returns a better-sqlite3-backed drizzle instance (same SQL
// dialect as the production op-sqlite driver). The repositories type their
// param as the op-sqlite NoopDatabase, so bridge the test driver across that
// library boundary with a single documented cast.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

describe("persistDeviceHistory", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("buildLocalHistoryRows maps ISO→ms, keys id on the night, and drops pnn50", () => {
    const { nightFeatureRows, sleepDetectionRows } = buildLocalHistoryRows(sampleOutput, 1234)

    expect(nightFeatureRows[0]).toMatchObject({
      id: `local:${NIGHT_MS}`,
      nightDate: NIGHT_MS,
      restingHeartRate: 52,
      sourceBlend: "Strap",
      updatedAt: 1234,
    })
    // night_features has no pnn50 column locally — it must not leak through.
    expect("pnn50" in nightFeatureRows[0]).toBe(false)

    expect(sleepDetectionRows[0]).toMatchObject({
      id: `local:${NIGHT_MS}`,
      nightDate: NIGHT_MS,
      bedtime: Date.parse("2026-05-28T20:15:00.000Z"),
      wakeTime: Date.parse("2026-05-29T03:45:00.000Z"),
      durationHours: 7.5,
    })
  })

  it("persists night_features and sleep_detections stamped _origin='local'", async () => {
    const db = testDb()
    await persistDeviceHistory(db, sampleOutput)

    const nf = await db.select().from(schema.nightFeatures)
    expect(nf).toHaveLength(1)
    expect(nf[0]).toMatchObject({
      id: `local:${NIGHT_MS}`,
      nightDate: NIGHT_MS,
      rmssd: 40,
      _origin: "local",
      userId: "u1",
    })

    const sd = await db.select().from(schema.sleepDetections)
    expect(sd).toHaveLength(1)
    expect(sd[0]).toMatchObject({
      id: `local:${NIGHT_MS}`,
      bedtime: Date.parse("2026-05-28T20:15:00.000Z"),
      _origin: "local",
    })
  })

  it("re-running a night upserts in place rather than duplicating", async () => {
    const db = testDb()
    await persistDeviceHistory(db, sampleOutput)

    const updated: DeviceHistoryOutput = {
      nightFeatures: [{ ...sampleOutput.nightFeatures![0], rmssd: 99 }],
      sleepDetections: sampleOutput.sleepDetections,
    }
    await persistDeviceHistory(db, updated)

    const nf = await db.select().from(schema.nightFeatures)
    expect(nf).toHaveLength(1)
    expect(nf[0].rmssd).toBe(99)
  })

  it("does not write when there is no active user", async () => {
    setActiveUserId(null)
    const db = testDb()
    await persistDeviceHistory(db, sampleOutput)
    const nf = await db.select().from(schema.nightFeatures)
    expect(nf).toHaveLength(0)
  })
})

describe("persistFullDay", () => {
  beforeEach(() => setActiveUserId("u1"))

  const REF_DATE = "2026-05-30"
  const REF_MS = Date.parse(`${REF_DATE}T00:00:00.000Z`)
  const BOUT_MS = Date.parse("2026-05-30T10:00:00.000Z")

  const fullOutput: FullDayOutput = {
    nightFeatures: [],
    sleepDetections: [],
    sleepStages: [
      {
        nightDate: NIGHT_ISO,
        remMinutes: 90,
        coreMinutes: 200,
        deepMinutes: 60,
        awakeMinutes: 20,
        unknownMinutes: 5,
        confidence: 0.8,
        source: "Strap",
        epochMinutes: 1,
      },
    ],
    dailyScores: [
      {
        dayDate: `${REF_DATE}T00:00:00.000Z`,
        dailyBalance: 70,
        loadPressure: 30,
        sleepReserveHours: 1.5,
        confidence: "High",
        recommendation: "Steady",
        detail: "ok",
      },
    ],
    activityBouts: [
      {
        startTime: "2026-05-30T10:00:00.000Z",
        endTime: "2026-05-30T10:45:00.000Z",
        durationMinutes: 45,
        activityType: "walk",
        intensity: "moderate",
        confidence: 0.9,
        heartRateAvg: 110,
        heartRateMax: 130,
        strainScore: 8,
        source: "detected",
        cadenceHz: null,
      },
    ],
    baseline: { restingHeartRate: 52, rmssd: 40, sdnn: 55, nightsUsed: 14, maxHeartRate: 185 },
    dailyMetrics: {
      strainScore: 12.5,
      sleepConsistencyScore: 80,
      detectedSleepNights: 5,
      skinTempAvgCelsius: 33.1,
      skinTempDeltaCelsius: 0.2,
      stressAverage: 40,
      spo2Average: 96,
      lfHfRatioAverage: null,
      recoveryIndex: 66,
      trainingLoadRatio: 1.1,
      trainingLoadRiskZone: "optimal",
      spo2DipCount: 3,
      odiPerHour: 0.7,
      lowestSpo2: 92,
      coreTemperatureEstimate: 36.7,
      circadianNadir: 4,
      sleepArchitectureScore: null,
      activityBouts: [],
    },
  }

  it("buildFullDayRows maps daily metrics with a day-keyed id + derived activity counts", () => {
    const rows = buildFullDayRows(fullOutput, REF_DATE, 1234)
    expect(rows.dailyMetricRows[0]).toMatchObject({
      id: `local:${REF_MS}`,
      dayDate: REF_MS,
      detectedSleepNights: 5,
      spo2DipCount: 3,
      recoveryIndex: 66,
      activityCount: 1,
      activeMinutes: 45,
      updatedAt: 1234,
    })
    expect(rows.baselineRow).toMatchObject({ id: "local:baseline", nightsUsed: 14 })
    expect(rows.activityRows[0].id).toBe(`local:${BOUT_MS}`)
  })

  it("persistFullDay writes every derived table as _origin='local'", async () => {
    const db = testDb()
    await persistFullDay(db, fullOutput, REF_DATE)

    const dm = await db.select().from(schema.dailyMetrics)
    expect(dm).toHaveLength(1)
    expect(dm[0]).toMatchObject({ dayDate: REF_MS, detectedSleepNights: 5, recoveryIndex: 66, _origin: "local" })

    const ds = await db.select().from(schema.dailyScores)
    expect(ds[0]).toMatchObject({ dailyBalance: 70, _origin: "local" })

    const ss = await db.select().from(schema.sleepStages)
    expect(ss[0]).toMatchObject({ remMinutes: 90, _origin: "local" })

    const act = await db.select().from(schema.activityDetections)
    expect(act[0]).toMatchObject({ durationMinutes: 45, _origin: "local" })

    const bl = await db.select().from(schema.baselineProfile)
    expect(bl[0]).toMatchObject({ restingHeartRate: 52, nightsUsed: 14, _origin: "local" })
  })
})
