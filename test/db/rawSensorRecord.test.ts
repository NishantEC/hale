import * as schema from "../../app/services/db/schema"
import {
  insertRawSensorRecord,
  listRawSensorRecordsByDateRange,
} from "../../app/services/db/repositories/rawSensorRecord"
import { setActiveUserId } from "../../app/services/db/session"
import { makeTestDb } from "./helpers"

describe("rawSensorRecord repository", () => {
  beforeEach(() => setActiveUserId("user-abc"))

  it("inserts a local-origin row with mirror columns populated", async () => {
    const db = makeTestDb() as any
    await insertRawSensorRecord(db, {
      id: "r1",
      timestamp: 1_700_000_000_000,
      heartRate: 62,
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
    const rows = await db.select().from(schema.rawSensorRecords)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe("user-abc")
    expect(rows[0]._origin).toBe("local")
    expect(rows[0]._syncedAt).toBeNull()
    expect(rows[0]._localCreatedAt).toBeGreaterThan(0)
  })

  it("queries by timestamp range scoped to active user", async () => {
    const db = makeTestDb() as any
    const base = {
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
    }
    await insertRawSensorRecord(db, { id: "a", timestamp: 100, ...base })
    await insertRawSensorRecord(db, { id: "b", timestamp: 200, ...base })
    await insertRawSensorRecord(db, { id: "c", timestamp: 300, ...base })
    const mid = await listRawSensorRecordsByDateRange(db, 150, 250)
    expect(mid.map((r) => r.id)).toEqual(["b"])
  })
})
