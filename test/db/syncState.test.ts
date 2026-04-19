import { getLastSyncAt, setLastSyncAt } from "../../app/services/db/repositories/syncState"
import { makeTestDb } from "./helpers"

describe("syncState", () => {
  it("returns 0 when no row yet", async () => {
    const db = makeTestDb() as any
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(0)
  })

  it("upserts and retrieves lastSyncAt per table", async () => {
    const db = makeTestDb() as any
    await setLastSyncAt(db, "daily_metrics", 1000)
    await setLastSyncAt(db, "sleep_stages", 2000)
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(1000)
    expect(await getLastSyncAt(db, "sleep_stages")).toBe(2000)
    await setLastSyncAt(db, "daily_metrics", 1500)
    expect(await getLastSyncAt(db, "daily_metrics")).toBe(1500)
  })
})
