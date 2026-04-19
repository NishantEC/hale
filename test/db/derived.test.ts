import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import {
  upsertDailyMetrics,
  listDailyMetricsByRange,
} from "../../app/services/db/repositories/derived"
import { makeTestDb } from "./helpers"

describe("derived repositories — daily_metrics", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("upsert with same id overwrites and marks _origin='backend'", async () => {
    const db = makeTestDb() as any
    await upsertDailyMetrics(db, [{ id: "m1", dayDate: 20260101, strainScore: 5, updatedAt: 1000 }])
    await upsertDailyMetrics(db, [{ id: "m1", dayDate: 20260101, strainScore: 7, updatedAt: 2000 }])
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows).toHaveLength(1)
    expect(rows[0].strainScore).toBe(7)
    expect(rows[0]._origin).toBe("backend")
  })

  it("backend row overwrites a local-origin row with the same id (conflict policy)", async () => {
    const db = makeTestDb() as any
    const raw = (db as any).$client ?? (db as any)._.session?.client
    // Seed a local-origin row directly via SQL to simulate the edge case.
    raw.prepare(
      `INSERT INTO daily_metrics (id, day_date, detected_sleep_nights, updated_at, _local_created_at, _origin, user_id, strain_score) VALUES (?, ?, 0, ?, ?, 'local', ?, ?)`,
    ).run("m1", 20260101, 500, 500, "u1", 1)
    await upsertDailyMetrics(db, [{ id: "m1", dayDate: 20260101, strainScore: 9, updatedAt: 3000 }])
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows[0]._origin).toBe("backend")
    expect(rows[0].strainScore).toBe(9)
  })

  it("listDailyMetricsByRange filters by userId and dayDate inclusive", async () => {
    const db = makeTestDb() as any
    await upsertDailyMetrics(db, [
      { id: "a", dayDate: 20260101, updatedAt: 1 },
      { id: "b", dayDate: 20260102, updatedAt: 2 },
      { id: "c", dayDate: 20260103, updatedAt: 3 },
    ])
    const mid = await listDailyMetricsByRange(db, 20260102, 20260103)
    expect(mid.map((r: any) => r.id).sort()).toEqual(["b", "c"])
  })
})
