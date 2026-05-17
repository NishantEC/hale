import type { NoopDatabase } from "../db"
import { isTransientApiError } from "../api/noopClient"
import {
  claimOutboundBatch,
  listDeadLetters,
  markOutboundSynced,
  queueDepth,
  recordOutboundFailure,
  recordOutboundFailureBatch,
} from "../db/repositories/outboundQueue"
import {
  backfillUnsyncedRawSensorRecords,
  markRawSensorRecordsSynced,
} from "../db/repositories/rawSensorRecord"

export const FORCE_UPLOAD_BATCH_SIZE = 25
export const FORCE_UPLOAD_BACKFILL_LIMIT = 5000

type OutboundBatchRow = Awaited<ReturnType<typeof claimOutboundBatch>>[number]

export interface ForceUploadProgress {
  uploaded: number
  total: number
  tableName: string
  batchSize: number
}

export interface ForceUploadResult {
  uploaded: number
  depthAfter: number
  deadCount: number
  error: string | null
}

export interface ForceUploadDependencies {
  backfillUnsyncedRawSensorRecords: typeof backfillUnsyncedRawSensorRecords
  claimOutboundBatch: typeof claimOutboundBatch
  listDeadLetters: typeof listDeadLetters
  markOutboundSynced: typeof markOutboundSynced
  markRawSensorRecordsSynced: typeof markRawSensorRecordsSynced
  queueDepth: typeof queueDepth
  recordOutboundFailure: typeof recordOutboundFailure
  recordOutboundFailureBatch: typeof recordOutboundFailureBatch
}

export const defaultForceUploadDependencies: ForceUploadDependencies = {
  backfillUnsyncedRawSensorRecords,
  claimOutboundBatch,
  listDeadLetters,
  markOutboundSynced,
  markRawSensorRecordsSynced,
  queueDepth,
  recordOutboundFailure,
  recordOutboundFailureBatch,
}

export async function runForceUpload(
  db: NoopDatabase,
  opts: {
    post: (tableName: string, payloads: unknown[]) => Promise<unknown>
    batchSize?: number
    backfillLimit?: number
    deps?: ForceUploadDependencies
    now?: () => number
    onProgress?: (progress: ForceUploadProgress) => void
  },
): Promise<ForceUploadResult> {
  const deps = opts.deps ?? defaultForceUploadDependencies
  const batchSize = opts.batchSize ?? FORCE_UPLOAD_BATCH_SIZE
  const backfillLimit = opts.backfillLimit ?? FORCE_UPLOAD_BACKFILL_LIMIT
  const now = opts.now ?? Date.now

  await deps.backfillUnsyncedRawSensorRecords(db, backfillLimit).catch(() => undefined)

  const total = await deps.queueDepth(db)
  if (total === 0) {
    return { uploaded: 0, depthAfter: 0, deadCount: 0, error: null }
  }

  let uploaded = 0
  let firstError: string | null = null

  while (!firstError) {
    const batch = await deps.claimOutboundBatch(db, batchSize)
    if (batch.length === 0) break

    const groups = new Map<string, OutboundBatchRow[]>()
    for (const row of batch) {
      const list = groups.get(row.tableName) ?? []
      list.push(row)
      groups.set(row.tableName, list)
    }

    let batchHadError = false
    for (const [tableName, rows] of groups) {
      opts.onProgress?.({
        uploaded,
        total: Math.max(total, uploaded + rows.length),
        tableName,
        batchSize: rows.length,
      })

      try {
        await opts.post(
          tableName,
          rows.map((r) => r.payload),
        )
        await deps.markOutboundSynced(
          db,
          rows.map((r) => r.id),
        )
        if (tableName === "raw_sensor_records") {
          await deps.markRawSensorRecordsSynced(
            db,
            rows.map((r) => r.rowId),
            now(),
          )
        }
        uploaded += rows.length
      } catch (err: any) {
        const errorMessage = err?.message ?? String(err)
        if (!firstError) firstError = errorMessage
        batchHadError = true
        const kind: "transient" | "permanent" = isTransientApiError(err)
          ? "transient"
          : "permanent"
        // Batched failure update — see uplinkDrainer for the same fix.
        // Per-row recordOutboundFailure was hitting SQLITE_BUSY on COMMIT.
        await deps.recordOutboundFailureBatch(
          db,
          rows.map((row) => row.id),
          errorMessage,
          { kind },
        )
      }
    }

    // Stop claiming more batches once anything in this batch failed — but
    // only after every group in the current claim has been attempted, so
    // claimed-but-unprocessed rows don't sit leased until expiry.
    if (batchHadError) break
  }

  const [depthAfter, deadCount] = await Promise.all([
    deps.queueDepth(db),
    deps.listDeadLetters(db).then((rows) => rows.length),
  ])

  return {
    uploaded,
    depthAfter,
    deadCount,
    error: firstError,
  }
}
