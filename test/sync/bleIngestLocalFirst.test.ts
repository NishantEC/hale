import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { ingestBleRecord } from "../../app/services/sync/bleIngest"
import { makeTestDb } from "../db/helpers"

describe("bleIngest (write-local-first)", () => {
  beforeEach(() => setActiveUserId("u"))

  it("writes a raw row + enqueues an uplink payload in one call", async () => {
    const db = makeTestDb() as any
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
    expect(await queueDepth(db)).toBe(1)
  })
})
