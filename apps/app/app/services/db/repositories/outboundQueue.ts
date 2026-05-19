import { and, asc, eq, gte, inArray, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { withWrite, type WriteTx } from "../transaction"
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

// Tx-scoped enqueue. Use this when you're already inside a withWrite()
// callback; it composes with other tx writes into one COMMIT.
export async function enqueueOutboundTx(tx: WriteTx, input: EnqueueInput): Promise<void> {
  const payloadStr = JSON.stringify(input.payload)
  await tx
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

// Standalone async wrapper. Convenience for callers that aren't already
// inside a withWrite() block.
export async function enqueueOutbound(db: NoopDatabase, input: EnqueueInput): Promise<void> {
  await withWrite(db, (tx) => enqueueOutboundTx(tx, input))
}

export async function purgeOutboundQueue(db: NoopDatabase): Promise<number> {
  const before = await queueDepth(db)
  await withWrite(db, async (tx) => {
    await tx.delete(outboundQueue)
  })
  return before
}

// Soft lease window. Long enough to cover any reasonable single drain
// (a normal drain finishes in under 30s, a Force Upload of a multi-day
// backlog can run for a few minutes); short enough that a JS context
// that died mid-drain doesn't strand rows for hours. The lease expires
// passively; explicit release happens via clearOutboundClaim().
export const CLAIM_TTL_MS = 5 * 60 * 1_000

// Atomic claim: in a single transaction, SELECT eligible rows then
// stamp them with `claimed_by` + `claim_expires_at` so concurrent
// drainers (foreground + background + Force Upload) can't pull the
// same rows. Eligibility: attempts < MAX, backoff window passed, AND
// no live lease.
//
// `holder` identifies the claiming context for debug + targeted
// release. `now` is injectable so tests can fast-forward.
export async function claimOutboundBatch(
  db: NoopDatabase,
  limit: number,
  now: number = Date.now(),
  holder: string = "drainer",
) {
  return withWrite(db, async (tx) => {
    const rows = await tx
      .select()
      .from(outboundQueue)
      .where(
        and(
          sql`${outboundQueue.attempts} < ${MAX_ATTEMPTS_BEFORE_DEAD_LETTER}`,
          sql`${outboundQueue.nextAttemptAt} <= ${now}`,
          sql`${outboundQueue.claimExpiresAt} <= ${now}`,
        ),
      )
      .orderBy(asc(outboundQueue.createdAt))
      .limit(limit)
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const expires = now + CLAIM_TTL_MS
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await tx
        .update(outboundQueue)
        .set({ claimedBy: holder, claimExpiresAt: expires })
        .where(inArray(outboundQueue.id, slice))
    }
    return rows.map((r) => ({
      ...r,
      claimedBy: holder,
      claimExpiresAt: expires,
      payload: JSON.parse(r.payload) as unknown,
    }))
  })
}

// Release a set of claimed rows without changing attempts. Use this
// when a drainer was interrupted before processing rows it claimed —
// e.g. the JS context is shutting down, or batching across tables and
// one POST errored so we want to free the rest of the same claim batch
// for the next drainer.
export async function clearOutboundClaim(db: NoopDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const CHUNK = 500
  await withWrite(db, async (tx) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await tx
        .update(outboundQueue)
        .set({ claimedBy: null, claimExpiresAt: 0 })
        .where(inArray(outboundQueue.id, slice))
    }
  })
}

export async function markOutboundSynced(db: NoopDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  // SQLite's default parameter cap is 999. Chunk at 500 for safety.
  const CHUNK = 500
  await withWrite(db, async (tx) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await tx.delete(outboundQueue).where(inArray(outboundQueue.id, slice))
    }
  })
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
  await withWrite(db, async (tx) => {
    if (classification.kind === "permanent") {
      // Jump straight to dead-letter. Backoff is irrelevant — the row
      // will never succeed without operator intervention. Clear the
      // lease so a debug retry can re-claim it.
      await tx
        .update(outboundQueue)
        .set({
          attempts: MAX_ATTEMPTS_BEFORE_DEAD_LETTER,
          lastAttemptAt: now,
          lastError: errorMessage,
          nextAttemptAt: now,
          claimedBy: null,
          claimExpiresAt: 0,
        })
        .where(eq(outboundQueue.id, id))
      return
    }
    const [current] = await tx
      .select({ attempts: outboundQueue.attempts })
      .from(outboundQueue)
      .where(eq(outboundQueue.id, id))
    const nextAttempts = (current?.attempts ?? 0) + 1
    await tx
      .update(outboundQueue)
      .set({
        attempts: nextAttempts,
        lastAttemptAt: now,
        lastError: errorMessage,
        nextAttemptAt: now + backoffDelayMs(nextAttempts),
        // Release the lease so the row can be re-claimed once its
        // backoff window opens, without waiting for CLAIM_TTL_MS to
        // elapse.
        claimedBy: null,
        claimExpiresAt: 0,
      })
      .where(eq(outboundQueue.id, id))
  })
}

/**
 * Mark multiple outbound rows as failed in ONE transaction. All rows in
 * `ids` share the same errorMessage and classification.
 */
export async function recordOutboundFailureBatch(
  db: NoopDatabase,
  ids: string[],
  errorMessage: string,
  classification: FailureKind = { kind: "transient" },
): Promise<void> {
  if (ids.length === 0) return
  const now = Date.now()
  const CHUNK = 500
  await withWrite(db, async (tx) => {
    if (classification.kind === "permanent") {
      // Single bulk UPDATE — all matching rows jump to dead-letter.
      // Release the lease so a debug retry can re-claim.
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        await tx
          .update(outboundQueue)
          .set({
            attempts: MAX_ATTEMPTS_BEFORE_DEAD_LETTER,
            lastAttemptAt: now,
            lastError: errorMessage,
            nextAttemptAt: now,
            claimedBy: null,
            claimExpiresAt: 0,
          })
          .where(inArray(outboundQueue.id, slice))
      }
      return
    }
    // Transient: bump attempts in-place via SQL expression so we don't
    // need a read-modify-write loop. Backoff schedule lives in SQL too
    // (jitter omitted in batch path — close enough; per-row callsite
    // still has jittered backoff). Release the lease so the row can
    // be re-claimed when its backoff window opens.
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await tx
        .update(outboundQueue)
        .set({
          attempts: sql`${outboundQueue.attempts} + 1`,
          lastAttemptAt: now,
          lastError: errorMessage,
          nextAttemptAt: sql`${now} + MIN(
            ${BACKOFF_MAX_MS},
            ${BACKOFF_BASE_MS} * (1 << MIN(20, ${outboundQueue.attempts}))
          )`,
          claimedBy: null,
          claimExpiresAt: 0,
        })
        .where(inArray(outboundQueue.id, slice))
    }
  })
}

export async function listDeadLetters(db: NoopDatabase) {
  return db
    .select()
    .from(outboundQueue)
    .where(gte(outboundQueue.attempts, MAX_ATTEMPTS_BEFORE_DEAD_LETTER))
}

// Reset a dead-letter row so it ships on the next drain. Also clear
// any stale lease so the next drainer can claim it immediately.
export async function retryOutboundRow(db: NoopDatabase, id: string): Promise<void> {
  await withWrite(db, async (tx) => {
    await tx
      .update(outboundQueue)
      .set({
        attempts: 0,
        lastError: null,
        nextAttemptAt: 0,
        claimedBy: null,
        claimExpiresAt: 0,
      })
      .where(eq(outboundQueue.id, id))
  })
}

// Permanently discard a queue entry without uploading.
export async function discardOutboundRow(db: NoopDatabase, id: string): Promise<void> {
  await withWrite(db, async (tx) => {
    await tx.delete(outboundQueue).where(eq(outboundQueue.id, id))
  })
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
