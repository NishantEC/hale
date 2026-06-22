import * as schema from "../../app/services/db/schema"

describe("drizzle schema", () => {
  const expectedTables = [
    "rawSensorRecords",
    "realtimeSamples",
    "deviceEvents",
    "consoleLogs",
    "journalEntries",
    "dailyMetrics",
    "dailyScores",
    "sleepDetections",
    "sleepStages",
    "nightFeatures",
    "signalSamples",
    "activityDetections",
    "baselineProfile",
    "sleepPlans",
    "viewCache",
    "syncState",
    "settings",
  ]

  it("exports every required table", () => {
    for (const name of expectedTables) {
      expect((schema as any)[name]).toBeDefined()
    }
  })

  it("mirrored tables include _localCreatedAt, _origin, userId", () => {
    const mirrored = [
      "rawSensorRecords",
      "realtimeSamples",
      "deviceEvents",
      "consoleLogs",
      "journalEntries",
      "dailyMetrics",
      "dailyScores",
      "sleepDetections",
      "sleepStages",
      "nightFeatures",
      "signalSamples",
      "activityDetections",
      "baselineProfile",
      "sleepPlans",
    ]
    for (const name of mirrored) {
      const table: any = (schema as any)[name]
      expect(table._syncedAt).toBeUndefined()
      expect(table._localCreatedAt).toBeDefined()
      expect(table._origin).toBeDefined()
      expect(table.userId).toBeDefined()
    }
  })

  it("syncState stores per-table lastSyncAt", () => {
    const t: any = (schema as any).syncState
    expect(t.tableName).toBeDefined()
    expect(t.lastSyncAt).toBeDefined()
    expect(t.lastSyncedRowTimestamp).toBeDefined()
  })

  it("viewCache keys by viewName + date + userId", () => {
    const t: any = (schema as any).viewCache
    expect(t.viewName).toBeDefined()
    expect(t.date).toBeDefined()
    expect(t.payload).toBeDefined()
    expect(t.updatedAt).toBeDefined()
    expect(t.userId).toBeDefined()
  })
})
