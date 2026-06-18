import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import {
  insertJournalEntry,
  listJournalEntriesByDate,
  deleteJournalEntry,
} from "../../app/services/db/repositories/journalEntry"
import type { NoopDatabase } from "../../app/services/db"
import { makeTestDb } from "./helpers"

// Bridge the better-sqlite3 test driver to the op-sqlite production type.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

describe("journalEntry repository", () => {
  beforeEach(() => setActiveUserId("u"))

  it("insert writes a local row (serverless: no outbound enqueue)", async () => {
    const db = testDb()
    await insertJournalEntry(db, {
      id: "j1",
      timestamp: 1000,
      factorTag: "caffeine",
      intensity: 3,
      note: "",
      createdAt: 1000,
    })
    const rows = await db.select().from(schema.journalEntries)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("j1")
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })

  it("list returns entries for a given date scoped to active user", async () => {
    const db = testDb()
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

  it("deleteJournalEntry removes the local row", async () => {
    const db = testDb()
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
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })
})
