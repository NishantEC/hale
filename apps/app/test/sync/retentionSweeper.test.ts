import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { sweepRetention } from "../../app/services/sync/retentionSweeper"
import { makeTestDb } from "../db/helpers"

describe("retentionSweeper", () => {
  beforeEach(() => setActiveUserId("u"))

  it("deletes synced raw rows older than retention cutoff; preserves pending uplink rows", async () => {
    const db = makeTestDb() as any
    const now = Date.now()
    const old = now - 60 * 24 * 60 * 60 * 1000
    const fresh = now - 1 * 24 * 60 * 60 * 1000
    await db.insert(schema.rawSensorRecords).values([
      {
        id: "old-synced",
        timestamp: old,
        _syncedAt: old,
        _localCreatedAt: old,
        _origin: "local",
        userId: "u",
      },
      {
        id: "old-pending",
        timestamp: old,
        _syncedAt: null,
        _localCreatedAt: old,
        _origin: "local",
        userId: "u",
      },
      {
        id: "fresh-synced",
        timestamp: fresh,
        _syncedAt: fresh,
        _localCreatedAt: fresh,
        _origin: "local",
        userId: "u",
      },
    ])
    await sweepRetention(db, { rawDays: 30 })
    const rows = await db.select().from(schema.rawSensorRecords)
    const ids = rows.map((r: any) => r.id).sort()
    expect(ids).toEqual(["fresh-synced", "old-pending"])
  })
})
