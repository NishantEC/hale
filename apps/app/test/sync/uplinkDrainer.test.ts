import { eq } from "drizzle-orm"
import { enqueueOutbound, queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { drainOnce } from "../../app/services/sync/uplinkDrainer"
import {
  consoleLogs,
  deviceEvents,
  journalEntries,
  rawSensorRecords,
  realtimeSamples,
} from "../../app/services/db/schema"
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

  it("sets _syncedAt on the mirror row for every uplink table after a successful drain", async () => {
    const db = makeTestDb() as any
    const userId = "u1"
    const base = { _localCreatedAt: 1, _origin: "local" as const, userId }
    await db.insert(rawSensorRecords).values({ id: "r1", timestamp: 1, ...base }).run()
    await db.insert(realtimeSamples).values({ id: "s1", deviceId: "d1", sessionId: "x", dataType: "hr", capturedAt: 1, ...base }).run()
    await db.insert(deviceEvents).values({ id: "e1", deviceId: "d1", eventNumber: 1, eventName: "n", capturedAt: 1, ...base }).run()
    await db.insert(consoleLogs).values({ id: "l1", deviceId: "d1", message: "m", capturedAt: 1, ...base }).run()
    await db.insert(journalEntries).values({ id: "j1", timestamp: 1, factorTag: "f", intensity: 1, createdAt: 1, ...base }).run()

    for (const [table, id] of [
      ["raw_sensor_records", "r1"], ["realtime_samples", "s1"],
      ["device_events", "e1"], ["console_logs", "l1"], ["journal_entries", "j1"],
    ] as const) {
      await enqueueOutbound(db, { tableName: table, rowId: id, payload: { id } })
    }
    await drainOnce(db, { post: jest.fn().mockResolvedValue({ ok: true }), batchSize: 100 })

    expect(await queueDepth(db)).toBe(0)
    for (const [table, id] of [
      [rawSensorRecords, "r1"], [realtimeSamples, "s1"],
      [deviceEvents, "e1"], [consoleLogs, "l1"], [journalEntries, "j1"],
    ] as const) {
      const [row] = await db.select().from(table).where(eq(table.id, id))
      expect(row._syncedAt).not.toBeNull()
    }
  })
})
