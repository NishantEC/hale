import type { NoopDatabase } from "../index"
import { withWrite } from "../transaction"
import { deviceEvents, realtimeSamples, consoleLogs } from "../schema"
import { getActiveUserId } from "../session"
import { notifyTable } from "../observable"

function localMirror() {
  return { _localCreatedAt: Date.now(), _origin: "local" as const }
}

export async function insertDeviceEvent(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(deviceEvents).values({ ...row, ...localMirror(), userId })
  })
  notifyTable("device_events")
}

export async function insertRealtimeSample(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(realtimeSamples).values({ ...row, ...localMirror(), userId })
  })
  notifyTable("realtime_samples")
}

export async function insertConsoleLog(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(consoleLogs).values({ ...row, ...localMirror(), userId })
  })
  notifyTable("console_logs")
}
