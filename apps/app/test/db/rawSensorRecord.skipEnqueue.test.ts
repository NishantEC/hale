import * as schema from "../../app/services/db/schema"
import {
  insertRawSensorRecord,
  markRawSensorRecordsSynced,
} from "../../app/services/db/repositories/rawSensorRecord"
import { setActiveUserId } from "../../app/services/db/session"
import { makeTestDb } from "./helpers"

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

describe("rawSensorRecord skip-enqueue on re-delivery", () => {
  beforeEach(() => setActiveUserId("u1"))

  it("enqueues once on first insert", async () => {
    const db = makeTestDb() as any
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    const queue = await db.select().from(schema.outboundQueue)
    expect(queue).toHaveLength(1)
    expect(queue[0].rowId).toBe("ts-100")
  })

  it("re-enqueues if the row exists but is not yet synced", async () => {
    const db = makeTestDb() as any
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    const queue = await db.select().from(schema.outboundQueue)
    // Both enqueues happened — the second one upserts in outbound_queue too
    // (dedupe on rowId), so we expect 1 row but with attempts/timestamps
    // updated. The key guarantee is "no _additional_ uploads will be issued
    // for an already-synced row," not "no duplicate queue entries when
    // unsynced."
    expect(queue).toHaveLength(1)
  })

  it("skips enqueue if the row is already synced and payload didn't improve", async () => {
    const db = makeTestDb() as any
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())
    // Empty queue baseline — uploader would have deleted it, simulate that:
    await db.delete(schema.outboundQueue)

    // Strap re-delivers the same record.
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 60, skinContact: 1, ...baseFields,
    })

    const queue = await db.select().from(schema.outboundQueue)
    expect(queue).toHaveLength(0)
  })

  it("re-enqueues a synced row when HR recovers from 0 to a real value", async () => {
    const db = makeTestDb() as any
    // Initial insert with HR=0 (placeholder — strap sent a record before HR was valid)
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 0, skinContact: 1, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())
    await db.delete(schema.outboundQueue)

    // Re-delivery with valid HR — we want this to ship.
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: 1, ...baseFields,
    })

    const queue = await db.select().from(schema.outboundQueue)
    expect(queue).toHaveLength(1)
    const row = await db.select().from(schema.rawSensorRecords)
    expect(row[0]?._syncedAt).toBeNull() // cleared so drainer treats it as fresh
  })

  it("re-enqueues a synced row when skinContact fills in from null", async () => {
    const db = makeTestDb() as any
    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: null, ...baseFields,
    })
    await markRawSensorRecordsSynced(db, ["ts-100"], Date.now())
    await db.delete(schema.outboundQueue)

    await insertRawSensorRecord(db, {
      id: "ts-100", timestamp: 100, heartRate: 62, skinContact: 1, ...baseFields,
    })

    const queue = await db.select().from(schema.outboundQueue)
    expect(queue).toHaveLength(1)
  })
})
