import * as schema from "../../app/services/db/schema"
import {
  insertRawSensorRecord,
  markRawSensorRecordsSynced,
} from "../../app/services/db/repositories/rawSensorRecord"
import { setActiveUserId } from "../../app/services/db/session"
import type { NoopDatabase } from "../../app/services/db"
import { makeTestDb } from "./helpers"

// Bridge the better-sqlite3 test driver to the op-sqlite production type;
// the query builders these tests touch are structurally identical.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

const baseFields = {
  rrAverageMs: null,
  spo2Red: null,
  spo2IR: null,
  skinTempRaw: null,
  gravityMagnitude: null,
  gravityX: null,
  gravityY: null,
  gravityZ: null,
  respRateRaw: null,
  ppgGreen: null,
  ppgRedIr: null,
  ambientLight: null,
  ledDrive1: null,
  ledDrive2: null,
  signalQuality: null,
}

// Serverless: outbound enqueue is unconditionally a no-op, so the queue is
// always empty regardless of the skip-enqueue branch. What survives — and is
// asserted here — is the local upsert and the `_syncedAt` reset that decides
// whether a re-delivered, already-synced row is treated as fresh again.
describe("rawSensorRecord re-delivery (local-first, serverless)", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("writes the raw row locally and leaves the outbound queue empty", async () => {
    const db = testDb()
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("ts-100")
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })

  it("upserts on re-delivery of an unsynced row — single local row, empty queue", async () => {
    const db = testDb()
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows).toHaveLength(1)
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })

  it("leaves _syncedAt set when a pure re-delivery doesn't improve the payload", async () => {
    const db = testDb()
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())

    // Strap re-delivers the same record — no HR recovery, no skinContact fill.
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })

    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows[0]?._syncedAt).not.toBeNull()
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })

  it("clears _syncedAt when HR recovers from 0 to a real value", async () => {
    const db = testDb()
    // Initial insert with HR=0 (placeholder — strap sent a record before HR was valid)
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 0, skinContact: 1, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())

    // Re-delivery with valid HR — the merged row is treated as fresh again.
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: 1, ...baseFields,
    })

    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows[0]?._syncedAt).toBeNull()
    expect(rows[0]?.heartRate).toBe(62)
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })

  it("clears _syncedAt when skinContact fills in from null", async () => {
    const db = testDb()
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: null, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())

    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: 1, ...baseFields,
    })

    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows[0]?._syncedAt).toBeNull()
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })
})
