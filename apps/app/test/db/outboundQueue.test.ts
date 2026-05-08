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

  it("recordOutboundFailure increments attempts + preserves payload", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const [row] = await claimOutboundBatch(db, 10)
    await recordOutboundFailure(db, row.id, "network timeout")
    const retry = (await claimOutboundBatch(db, 10))[0]
    expect(retry.attempts).toBe(1)
    expect(retry.lastError).toBe("network timeout")
  })

  it("listDeadLetters returns rows with attempts >= threshold", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "dead", payload: {} })
    const [row] = await claimOutboundBatch(db, 10)
    for (let i = 0; i < 10; i++) await recordOutboundFailure(db, row.id, "err")
    const dead = await listDeadLetters(db)
    expect(dead).toHaveLength(1)
    expect(dead[0].rowId).toBe("dead")
  })
})
