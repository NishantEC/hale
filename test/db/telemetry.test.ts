import { setActiveUserId } from "../../app/services/db/session"
import {
  insertDeviceEvent,
  insertRealtimeSample,
  insertConsoleLog,
} from "../../app/services/db/repositories/telemetry"
import { queueDepth } from "../../app/services/db/repositories/outboundQueue"
import { makeTestDb } from "./helpers"

describe("telemetry repositories", () => {
  beforeEach(() => setActiveUserId("u"))

  it("each insert enqueues an uplink", async () => {
    const db = makeTestDb() as any
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
    expect(await queueDepth(db)).toBe(3)
  })
})
