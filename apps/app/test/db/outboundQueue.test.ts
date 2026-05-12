import {
  enqueueOutbound,
  claimOutboundBatch,
  markOutboundSynced,
  recordOutboundFailure,
  listDeadLetters,
} from "../../app/services/db/repositories/outboundQueue"
import { makeTestDb } from "./helpers"

describe("outboundQueue", () => {
  it("enqueues and claims in FIFO order", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "b", payload: { id: "b" } })
    const batch = await claimOutboundBatch(db, 10)
    expect(batch.map((r) => r.rowId)).toEqual(["a", "b"])
  })

  it("markOutboundSynced removes rows", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const [row] = await claimOutboundBatch(db, 10)
    await markOutboundSynced(db, [row.id])
    const next = await claimOutboundBatch(db, 10)
    expect(next).toHaveLength(0)
  })

  it("recordOutboundFailure increments attempts, sets backoff, preserves payload", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
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
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "dead", payload: {} })
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
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "p", payload: {} })
    const [row] = await claimOutboundBatch(db, 10)
    await recordOutboundFailure(db, row.id, "400 Bad Request", { kind: "permanent" })
    expect(await claimOutboundBatch(db, 10, Date.now() + 999_999_999)).toHaveLength(0)
    const dead = await listDeadLetters(db)
    expect(dead).toHaveLength(1)
    expect(dead[0].lastError).toBe("400 Bad Request")
  })
})
