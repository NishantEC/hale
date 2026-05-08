import type { NoopDatabase } from "../index"
import { deviceEvents, realtimeSamples, consoleLogs } from "../schema"
import { getActiveUserId } from "../session"
import { enqueueOutbound } from "./outboundQueue"
import { notifyTable } from "../observable"

function localMirror() {
  return { _syncedAt: null, _localCreatedAt: Date.now(), _origin: "local" as const }
}

export async function insertDeviceEvent(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(deviceEvents).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "device_events", rowId: row.id, payload: row })
  notifyTable("device_events")
}

export async function insertRealtimeSample(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(realtimeSamples).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "realtime_samples", rowId: row.id, payload: row })
  notifyTable("realtime_samples")
}

export async function insertConsoleLog(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await db.insert(consoleLogs).values({ ...row, ...localMirror(), userId })
  await enqueueOutbound(db, { tableName: "console_logs", rowId: row.id, payload: row })
  notifyTable("console_logs")
}
