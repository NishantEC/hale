import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import {
  insertJournalEntry,
  listJournalEntriesByDate,
  deleteJournalEntry,
} from "../../app/services/db/repositories/journalEntry"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { makeTestDb } from "./helpers"

describe("journalEntry repository", () => {
  beforeEach(() => setActiveUserId("u"))

  it("insert writes local row + enqueues uplink", async () => {
    const db = makeTestDb() as any
    await insertJournalEntry(db, {
      id: "j1",
      timestamp: 1000,
      factorTag: "caffeine",
      intensity: 3,
      note: "",
      createdAt: 1000,
    })
    expect(await queueDepth(db)).toBe(1)
  })

  it("list returns entries for a given date scoped to active user", async () => {
    const db = makeTestDb() as any
    const d = new Date("2026-04-18T10:00:00Z").getTime()
    await insertJournalEntry(db, {
      id: "a",
      timestamp: d,
      factorTag: "caffeine",
      intensity: 3,
      note: "",
      createdAt: d,
    })
    const rows = await listJournalEntriesByDate(db, "2026-04-18")
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("a")
  })

  it("deleteJournalEntry removes + enqueues delete intent", async () => {
    const db = makeTestDb() as any
    await insertJournalEntry(db, {
      id: "a",
      timestamp: 1000,
      factorTag: "caffeine",
      intensity: 3,
      note: "",
      createdAt: 1000,
    })
    await deleteJournalEntry(db, "a")
    const rows = await db.select().from(schema.journalEntries)
    expect(rows).toHaveLength(0)
    expect(await queueDepth(db)).toBeGreaterThan(0)
  })
})
