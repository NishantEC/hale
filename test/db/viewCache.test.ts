import { setActiveUserId } from "../../app/services/db/session"
import { getViewCache, setViewCache } from "../../app/services/db/repositories/viewCache"
import { makeTestDb } from "./helpers"

describe("viewCache", () => {
  beforeEach(() => setActiveUserId("u"))

  it("upserts and reads a view payload", async () => {
    const db = makeTestDb() as any
    await setViewCache(db, "home", "2026-04-18", { rings: { sleep: { value: "7h" } } })
    const payload = await getViewCache<any>(db, "home", "2026-04-18")
    expect(payload.rings.sleep.value).toBe("7h")
  })

  it("returns null when no cache row", async () => {
    const db = makeTestDb() as any
    expect(await getViewCache(db, "home", "2026-04-18")).toBeNull()
  })
})
