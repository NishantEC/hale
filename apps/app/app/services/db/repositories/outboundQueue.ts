import { and, asc, eq, gte, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { outboundQueue } from "../schema"

// Dead-letter threshold: rows with attempts >= this value are skipped
// by the drainer and surfaced via listDeadLetters() for debug visibility.
export const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 10

// Backoff schedule for failed uploads. The drainer skips a row until
// wall-clock time reaches `next_attempt_at`. Exponential 1s → 1h with
// 30% jitter so a fleet of failing rows doesn't synchronously re-storm
// the backend the moment connectivity returns.
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 60 * 60 * 1_000
const BACKOFF_JITTER = 0.3

export function backoffDelayMs(attempts: number, rand: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
  const jitter = exp * BACKOFF_JITTER * rand()
  return Math.floor(exp + jitter)
}

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
      nextAttemptAt: 0,
    })
    .onConflictDoUpdate({
      target: [outboundQueue.tableName, outboundQueue.rowId],
      set: {
        payload: payloadStr,
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        nextAttemptAt: 0,
      },
    })
}

export async function purgeOutboundQueue(db: NoopDatabase): Promise<number> {
  const before = await queueDepth(db)
  await db.delete(outboundQueue)
  return before
}

export async function claimOutboundBatch(db: NoopDatabase, limit: number, now: number = Date.now()) {
  const rows = await db
    .select()
    .from(outboundQueue)
    .where(
      and(
        sql`${outboundQueue.attempts} < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`,
        sql`${outboundQueue.nextAttemptAt} <= ${now}`,
      ),
    )
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

export interface FailureKind {
  // 'transient' → backoff and retry (5xx, network, timeout)
  // 'permanent' → fast-path to dead-letter (4xx other than 408/429)
  kind: "transient" | "permanent"
}

export async function recordOutboundFailure(
  db: NoopDatabase,
  id: string,
  errorMessage: string,
  classification: FailureKind = { kind: "transient" },
): Promise<void> {
  const now = Date.now()
  if (classification.kind === "permanent") {
    // Jump straight to dead-letter. Backoff is irrelevant — the row will
    // never succeed without operator intervention (resetOutboundQueueRow).
    await db
      .update(outboundQueue)
      .set({
        attempts: MAX_ATTEMPTS_BEFORE_DEAD_LETTER,
        lastAttemptAt: now,
        lastError: errorMessage,
        nextAttemptAt: now,
      })
      .where(eq(outboundQueue.id, id))
    return
  }
  const [current] = await db
    .select({ attempts: outboundQueue.attempts })
    .from(outboundQueue)
    .where(eq(outboundQueue.id, id))
  const nextAttempts = (current?.attempts ?? 0) + 1
  await db
    .update(outboundQueue)
    .set({
      attempts: nextAttempts,
      lastAttemptAt: now,
      lastError: errorMessage,
      nextAttemptAt: now + backoffDelayMs(nextAttempts),
    })
    .where(eq(outboundQueue.id, id))
}

export async function listDeadLetters(db: NoopDatabase) {
  return db
    .select()
    .from(outboundQueue)
    .where(gte(outboundQueue.attempts, MAX_ATTEMPTS_BEFORE_DEAD_LETTER))
}

// Reset a dead-letter row so it ships on the next drain.
export async function retryOutboundRow(db: NoopDatabase, id: string): Promise<void> {
  await db
    .update(outboundQueue)
    .set({ attempts: 0, lastError: null, nextAttemptAt: 0 })
    .where(eq(outboundQueue.id, id))
}

// Permanently discard a queue entry without uploading.
export async function discardOutboundRow(db: NoopDatabase, id: string): Promise<void> {
  await db.delete(outboundQueue).where(eq(outboundQueue.id, id))
}

export async function queueDepth(db: NoopDatabase): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(outboundQueue)
    .where(sql`${outboundQueue.attempts} < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`)
  return rows[0]?.c ?? 0
}

// Earliest createdAt for a row that hasn't shipped yet. Powers the
// "oldest pending" debug indicator so the user can see when a sync has
// stalled silently.
export async function oldestPendingAt(db: NoopDatabase): Promise<number | null> {
  const rows = await db
    .select({ ts: sql<number | null>`min(${outboundQueue.createdAt})` })
    .from(outboundQueue)
    .where(sql`${outboundQueue.attempts} < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`)
  return rows[0]?.ts ?? null
}
