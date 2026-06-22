import { and, asc, eq, gte, lt } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { withWrite } from "../transaction"
import { journalEntries } from "../schema"
import { getActiveUserId } from "../session"
import { notifyTable } from "../observable"

export interface JournalEntryInput {
  id: string
  timestamp: number
  factorTag: string
  intensity: number
  note: string
  createdAt: number
}

export async function insertJournalEntry(
  db: NoopDatabase,
  input: JournalEntryInput,
): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(journalEntries).values({
      ...input,
      _localCreatedAt: Date.now(),
      _origin: "local",
      userId,
    })
  })
  notifyTable("journal_entries")
}

export async function listJournalEntriesByDate(db: NoopDatabase, yyyyMmDd: string) {
  const userId = getActiveUserId()
  const start = new Date(`${yyyyMmDd}T00:00:00Z`).getTime()
  const end = start + 24 * 60 * 60 * 1000
  return db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        gte(journalEntries.timestamp, start),
        lt(journalEntries.timestamp, end),
      ),
    )
    .orderBy(asc(journalEntries.timestamp))
}

export async function deleteJournalEntry(db: NoopDatabase, id: string): Promise<void> {
  await withWrite(db, async (tx) => {
    await tx.delete(journalEntries).where(eq(journalEntries.id, id))
  })
  notifyTable("journal_entries")
}
