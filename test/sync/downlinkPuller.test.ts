import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { pullDownlink } from "../../app/services/sync/downlinkPuller"
import { makeTestDb } from "../db/helpers"

describe("downlinkPuller", () => {
  beforeEach(() => setActiveUserId("u"))

  it("fetches derived rows and upserts them; advances sync cursor", async () => {
    const db = makeTestDb() as any
    const apiGet = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "m1", dayDate: 20260101, updatedAt: 1500 }],
        hasMore: false,
      })
      .mockResolvedValue({ rows: [], hasMore: false })
    await pullDownlink(db, { apiGet, tables: ["daily_metrics"] })
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows).toHaveLength(1)
    expect(rows[0]._origin).toBe("backend")
  })

  it("conflict policy: backend version wins over local version with same id", async () => {
    const db = makeTestDb() as any
    const raw = (db as any).$client ?? (db as any)._.session?.client
    raw
      .prepare(
        `INSERT INTO daily_metrics (id, day_date, detected_sleep_nights, updated_at, _local_created_at, _origin, user_id, strain_score) VALUES (?, ?, 0, ?, ?, 'local', ?, ?)`,
      )
      .run("m1", 20260101, 500, 500, "u", 1)
    const apiGet = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "m1", dayDate: 20260101, updatedAt: 2000, strainScore: 9 }],
        hasMore: false,
      })
      .mockResolvedValue({ rows: [], hasMore: false })
    await pullDownlink(db, { apiGet, tables: ["daily_metrics"] })
    const rows = await db.select().from(schema.dailyMetrics)
    expect(rows[0]._origin).toBe("backend")
    expect(rows[0].strainScore).toBe(9)
  })
})
