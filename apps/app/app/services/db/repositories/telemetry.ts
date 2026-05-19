import type { NoopDatabase } from "../index"
import { withWrite } from "../transaction"
import { deviceEvents, realtimeSamples, consoleLogs } from "../schema"
import { getActiveUserId } from "../session"
import { enqueueOutboundTx } from "./outboundQueue"
import { notifyTable } from "../observable"

function localMirror() {
  return { _syncedAt: null, _localCreatedAt: Date.now(), _origin: "local" as const }
}

// Insert + outbound-enqueue are wrapped in a single transaction so a
// crash between them can't leave a row visible in the local table
// without a corresponding upload entry. The raw_sensor_records repo
// pattern, applied uniformly.
export async function insertDeviceEvent(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(deviceEvents).values({ ...row, ...localMirror(), userId })
    await enqueueOutboundTx(tx, { tableName: "device_events", rowId: row.id, payload: row })
  })
  notifyTable("device_events")
}

export async function insertRealtimeSample(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(realtimeSamples).values({ ...row, ...localMirror(), userId })
    await enqueueOutboundTx(tx, { tableName: "realtime_samples", rowId: row.id, payload: row })
  })
  notifyTable("realtime_samples")
}

export async function insertConsoleLog(db: NoopDatabase, row: any): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await tx.insert(consoleLogs).values({ ...row, ...localMirror(), userId })
    await enqueueOutboundTx(tx, { tableName: "console_logs", rowId: row.id, payload: row })
  })
  notifyTable("console_logs")
}
