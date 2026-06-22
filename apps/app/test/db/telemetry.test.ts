import * as schema from "../../app/services/db/schema"
import { setActiveUserId } from "../../app/services/db/session"
import {
  insertDeviceEvent,
  insertRealtimeSample,
  insertConsoleLog,
} from "../../app/services/db/repositories/telemetry"
import type { NoopDatabase } from "../../app/services/db"
import { makeTestDb } from "./helpers"

// Bridge the better-sqlite3 test driver to the op-sqlite production type.
function testDb(): NoopDatabase {
  return makeTestDb() as unknown as NoopDatabase
}

describe("telemetry repositories", () => {
  beforeEach(() => setActiveUserId("u"))

  it("each insert writes a local mirror row (serverless: no outbound forwarding)", async () => {
    const db = testDb()
    await insertDeviceEvent(db, {
      id: "e1",
      deviceId: "d1",
      eventNumber: 1,
      eventName: "connect",
      rawPayload: null,
      capturedAt: 1000,
    })
    await insertRealtimeSample(db, {
      id: "r1",
      deviceId: "d1",
      sessionId: "s1",
      dataType: "hr",
      heartRate: 62,
      rawFields: null,
      rawPayload: null,
      capturedAt: 1000,
    })
    await insertConsoleLog(db, {
      id: "c1",
      deviceId: "d1",
      message: "hello",
      logLevel: "info",
      metadata: null,
      capturedAt: 1000,
    })

    expect(await db.select().from(schema.deviceEvents)).toHaveLength(1)
    expect(await db.select().from(schema.realtimeSamples)).toHaveLength(1)
    expect(await db.select().from(schema.consoleLogs)).toHaveLength(1)
  })
})
