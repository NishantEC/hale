import { enqueueOutbound, queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { drainOnce } from "../../app/services/sync/uplinkDrainer"
import { makeTestDb } from "../db/helpers"

describe("uplinkDrainer", () => {
  it("drains the queue when POST succeeds", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    const post = jest.fn().mockResolvedValue({ ok: true })
    await drainOnce(db, { post, batchSize: 100 })
    expect(post).toHaveBeenCalledWith("raw_sensor_records", expect.arrayContaining([{ id: "a" }]))
    expect(await queueDepth(db)).toBe(0)
  })

  it("leaves row enqueued on failure and increments attempts", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: {} })
    const post = jest.fn().mockRejectedValue(new Error("network"))
    await drainOnce(db, { post, batchSize: 100 })
    expect(await queueDepth(db)).toBe(1)
  })

  it("groups payloads by tableName and batches per group", async () => {
    const db = makeTestDb() as any
    await enqueueOutbound(db, { tableName: "raw_sensor_records", rowId: "a", payload: { id: "a" } })
    await enqueueOutbound(db, { tableName: "journal_entries", rowId: "j", payload: { id: "j" } })
    const post = jest.fn().mockResolvedValue({ ok: true })
    await drainOnce(db, { post, batchSize: 100 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenCalledWith("raw_sensor_records", [{ id: "a" }])
    expect(post).toHaveBeenCalledWith("journal_entries", [{ id: "j" }])
  })
})
