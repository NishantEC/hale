import { asc, eq, gte, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { outboundQueue } from "../schema"

// Dead-letter threshold: rows with attempts >= this value are skipped
// by the drainer and surfaced via listDeadLetters() for debug visibility.
export const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 10

export interface EnqueueInput {
  tableName: string
  rowId: string
  payload: unknown
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueOutbound(db: NoopDatabase, input: EnqueueInput): Promise<void> {
  // On conflict (tableName, rowId): reset attempts to 0 and refresh the payload.
  // This revives dead-letter rows (attempts ≥ MAX) and ensures the latest
  // merged data is what gets uploaded, not a stale snapshot from a prior attempt.
  const payloadStr = JSON.stringify(input.payload)
  await db
    .insert(outboundQueue)
    .values({
      id: newId(),
      tableName: input.tableName,
      rowId: input.rowId,
      payload: payloadStr,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [outboundQueue.tableName, outboundQueue.rowId],
      set: {
        payload: payloadStr,
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
      },
    })
}

export async function purgeOutboundQueue(db: NoopDatabase): Promise<number> {
  const before = await queueDepth(db)
  await db.delete(outboundQueue)
  return before
}

export async function claimOutboundBatch(db: NoopDatabase, limit: number) {
  const rows = await db
    .select()
    .from(outboundQueue)
    .where(sql`attempts < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`)
    .orderBy(asc(outboundQueue.createdAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }))
}

export async function markOutboundSynced(db: NoopDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  for (const id of ids) {
    await db.delete(outboundQueue).where(eq(outboundQueue.id, id))
  }
}

export async function recordOutboundFailure(
  db: NoopDatabase,
  id: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(outboundQueue)
    .set({
      attempts: sql`${outboundQueue.attempts} + 1`,
      lastAttemptAt: Date.now(),
      lastError: errorMessage,
    })
    .where(eq(outboundQueue.id, id))
}

export async function listDeadLetters(db: NoopDatabase) {
  return db
    .select()
    .from(outboundQueue)
    .where(gte(outboundQueue.attempts, MAX_ATTEMPTS_BEFORE_DEAD_LETTER))
}

export async function queueDepth(db: NoopDatabase): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(outboundQueue)
    .where(sql`${outboundQueue.attempts} < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`)
  return rows[0]?.c ?? 0
}
