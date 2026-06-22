import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { sweepRetention } from "../../app/services/sync/retentionSweeper"
import { makeTestDb } from "../db/helpers"

describe("retentionSweeper", () => {
  beforeEach(() => setActiveUserId("u"))

  it("preserves raw rows regardless of age (no backend uplink to gate on)", async () => {
    const db = makeTestDb() as any
    const now = Date.now()
    const old = now - 60 * 24 * 60 * 60 * 1000
    const fresh = now - 1 * 24 * 60 * 60 * 1000
    await db.insert(schema.rawSensorRecords).values([
      { id: "old", timestamp: old, _localCreatedAt: old, _origin: "local", userId: "u" },
      { id: "fresh", timestamp: fresh, _localCreatedAt: fresh, _origin: "local", userId: "u" },
    ])

    await sweepRetention(db)

    const rows = await db.select().from(schema.rawSensorRecords)
    const ids = rows.map((r: any) => r.id).sort()
    expect(ids).toEqual(["fresh", "old"])
  })

  it("trims view_cache rows older than viewCacheDays, keeps fresh ones", async () => {
    const db = makeTestDb() as any
    const now = Date.now()
    const old = now - 60 * 24 * 60 * 60 * 1000
    const fresh = now - 1 * 24 * 60 * 60 * 1000
    await db.insert(schema.viewCache).values([
      { viewName: "v", date: "2026-01-01", payload: "{}", updatedAt: old, userId: "u" },
      { viewName: "v", date: "2026-06-21", payload: "{}", updatedAt: fresh, userId: "u" },
    ])

    await sweepRetention(db, { viewCacheDays: 30 })

    const rows = await db.select().from(schema.viewCache)
    const dates = rows.map((r: any) => r.date).sort()
    expect(dates).toEqual(["2026-06-21"])
  })

  it("keeps all view_cache rows when viewCacheDays <= 0", async () => {
    const db = makeTestDb() as any
    const old = Date.now() - 60 * 24 * 60 * 60 * 1000
    await db.insert(schema.viewCache).values([
      { viewName: "v", date: "2026-01-01", payload: "{}", updatedAt: old, userId: "u" },
    ])

    await sweepRetention(db, { viewCacheDays: 0 })

    const rows = await db.select().from(schema.viewCache)
    expect(rows).toHaveLength(1)
  })
})
