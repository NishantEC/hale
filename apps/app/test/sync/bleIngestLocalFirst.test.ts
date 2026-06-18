import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { ingestBleRecord } from "../../app/services/sync/bleIngest"
import type { NoopDatabase } from "../../app/services/db"
import { makeTestDb } from "../db/helpers"

// Bridge the better-sqlite3 test driver to the op-sqlite production type.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

describe("bleIngest (write-local-first)", () => {
  beforeEach(() => setActiveUserId("u"))

  it("writes a raw row locally (serverless: no outbound enqueue)", async () => {
    const db = testDb()
    await ingestBleRecord(db, {
      id: "r1",
      timestamp: 1_700_000_000_000,
      heartRate: 60,
      rrAverageMs: null,
      spo2Red: null,
      spo2IR: null,
      skinTempRaw: null,
      gravityMagnitude: null,
      gravityX: null,
      gravityY: null,
      gravityZ: null,
      respRateRaw: null,
      skinContact: 1,
      ppgGreen: null,
      ppgRedIr: null,
      ambientLight: null,
      ledDrive1: null,
      ledDrive2: null,
      signalQuality: null,
    })
    const raws = await db.select().from(schema.rawSensorRecords)
    expect(raws).toHaveLength(1)
    expect(raws[0].id).toBe("r1")
    expect(raws[0].heartRate).toBe(60)
    // No server upload path — the outbound queue stays empty.
    expect(await db.select().from(schema.outboundQueue)).toHaveLength(0)
  })
})
