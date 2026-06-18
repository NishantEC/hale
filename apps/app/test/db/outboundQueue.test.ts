import {
  enqueueOutbound,
  claimOutboundBatch,
  markOutboundSynced,
  recordOutboundFailure,
  recordOutboundFailureBatch,
  listDeadLetters,
  queueDepth,
} from "../../app/services/db/repositories/outboundQueue"
import { outboundQueue } from "../../app/services/db/schema"
import type { NoopDatabase } from "../../app/services/db"
import { makeTestDb } from "./helpers"

// makeTestDb returns a better-sqlite3-backed drizzle instance (same SQL
// dialect as the op-sqlite production driver); the cast bridges the two
// driver types, which are structurally identical for the query builders
// these tests touch.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

// Serverless: enqueueOutbound/enqueueOutboundTx are no-ops, so production
// never fills the queue. The claim/backoff/dead-letter mechanics below
// still exist and are exercised by seeding rows directly — the same shape
// the queue would have held — so those fns stay validated in isolation.
let seq = 0
async function seedOutbound(
  db: NoopDatabase,
  rowId: string,
  payload: unknown = { id: rowId },
): Promise<void> {
  const createdAt = ++seq
  await db.insert(outboundQueue).values({
    id: `seed-${rowId}-${createdAt}`,
    tableName: "raw_sensor_records",
    rowId,
    payload: JSON.stringify(payload),
    createdAt,
  })
}

describe("outboundQueue", () => {
  it("enqueueOutbound is a no-op — the queue stays empty (serverless)", async () => {
    const db = testDb()
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "b", payload: { id: "b" } })
    expect(await queueDepth(db)).toBe(0)
    expect(await claimOutboundBatch(db, 10)).toHaveLength(0)
  })

  it("claims seeded rows in FIFO order by createdAt", async () => {
    const db = testDb()
    await seedOutbound(db, "a")
    await seedOutbound(db, "b")
    const batch = await claimOutboundBatch(db, 10)
    expect(batch.map((r) => r.rowId)).toEqual(["a", "b"])
  })

  it("markOutboundSynced removes rows", async () => {
    const db = testDb()
    await seedOutbound(db, "a")
    const [row] = await claimOutboundBatch(db, 10)
    await markOutboundSynced(db, [row.id])
    const next = await claimOutboundBatch(db, 10)
    expect(next).toHaveLength(0)
  })

  it("recordOutboundFailure increments attempts, sets backoff, preserves payload", async () => {
    const db = testDb()
    await seedOutbound(db, "a")
    const [row] = await claimOutboundBatch(db, 10)
    await recordOutboundFailure(db, row.id, "network timeout")

    // The row is now in backoff (next_attempt_at > now), so a normal claim
    // should not return it.
    expect(await claimOutboundBatch(db, 10)).toHaveLength(0)

    // After advancing wall-clock past the worst-case max backoff (1 hour),
    // it's eligible again — and carries the incremented attempt + error.
    const future = Date.now() + 60 * 60 * 1_000 + 60_000
    const retry = (await claimOutboundBatch(db, 10, future))[0]
    expect(retry.attempts).toBe(1)
    expect(retry.lastError).toBe("network timeout")
  })

  it("listDeadLetters returns rows with attempts >= threshold", async () => {
    const db = testDb()
    await seedOutbound(db, "dead", {})
    const [row] = await claimOutboundBatch(db, 10)
    // Drive attempts to MAX in one shot. recordOutboundFailure normally
    // increments by 1; "permanent" classification jumps straight to the
    // dead-letter threshold so we don't need to defeat 10 backoff delays.
    await recordOutboundFailure(db, row.id, "schema rejected", { kind: "permanent" })
    const dead = await listDeadLetters(db)
    expect(dead).toHaveLength(1)
    expect(dead[0].rowId).toBe("dead")
  })

  it("a permanent failure routes the row straight to dead-letter", async () => {
    const db = testDb()
    await seedOutbound(db, "p", {})
    const [row] = await claimOutboundBatch(db, 10)
    await recordOutboundFailure(db, row.id, "400 Bad Request", { kind: "permanent" })
    expect(await claimOutboundBatch(db, 10, Date.now() + 999_999_999)).toHaveLength(0)
    const dead = await listDeadLetters(db)
    expect(dead).toHaveLength(1)
    expect(dead[0].lastError).toBe("400 Bad Request")
  })

  it("recordOutboundFailureBatch matches per-row backoff schedule", async () => {
    const db = testDb()
    await seedOutbound(db, "x", {})
    await seedOutbound(db, "y", {})
    const claimed = await claimOutboundBatch(db, 10)
    await recordOutboundFailureBatch(db, claimed.map((r) => r.id), "500 server error")

    // Both rows: attempts bumped, lease released, nextAttemptAt in the future.
    const future = Date.now() + 60 * 60 * 1_000 + 60_000
    const retry = await claimOutboundBatch(db, 10, future)
    expect(retry).toHaveLength(2)
    for (const r of retry) {
      expect(r.attempts).toBe(1)
      expect(r.lastError).toBe("500 server error")
    }
  })

  it("recordOutboundFailureBatch caps attempts at MAX_TRANSIENT_ATTEMPTS (9)", async () => {
    const db = testDb()
    await seedOutbound(db, "z", {})
    const [row] = await claimOutboundBatch(db, 10)
    // 20 consecutive transient failures
    for (let i = 0; i < 20; i++) {
      await recordOutboundFailureBatch(db, [row.id], "transient")
    }
    const future = Date.now() + 60 * 60 * 1_000 + 60_000
    const [retried] = await claimOutboundBatch(db, 10, future)
    expect(retried.attempts).toBe(9)
    // Not dead-lettered — transient cap is below MAX_ATTEMPTS_BEFORE_DEAD_LETTER (10).
    expect(await listDeadLetters(db)).toHaveLength(0)
  })
})
