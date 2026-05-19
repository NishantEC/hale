import { and, asc, eq, gte, lt } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { withWrite } from "../transaction"
import { journalEntries } from "../schema"
import { getActiveUserId } from "../session"
import { enqueueOutboundTx } from "./outboundQueue"
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
  // Insert + outbound-enqueue in one transaction — a crash between the
  // two would otherwise leave a journal entry visible locally with no
  // upload entry, and the next sync wouldn't ship it.
  await withWrite(db, async (tx) => {
    await tx.insert(journalEntries).values({
      ...input,
      _syncedAt: null,
      _localCreatedAt: Date.now(),
      _origin: "local",
      userId,
    })
    await enqueueOutboundTx(tx, {
      tableName: "journal_entries",
      rowId: input.id,
      payload: input,
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
  // Same atomicity as insert: a crash between delete and enqueue would
  // either re-show the entry on next launch (delete lost) or never
  // propagate the deletion to the backend (enqueue lost).
  await withWrite(db, async (tx) => {
    await tx.delete(journalEntries).where(eq(journalEntries.id, id))
    await enqueueOutboundTx(tx, {
      tableName: "journal_entries",
      rowId: id,
      payload: { id, __deleted: true },
    })
  })
  notifyTable("journal_entries")
}
