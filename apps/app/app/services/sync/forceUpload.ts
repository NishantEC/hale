import type { NoopDatabase } from "../db"
import { isTransientApiError } from "../api/noopClient"
import {
  acquireDrainLock,
  releaseDrainLock,
} from "../db/repositories/drainLock"
import {
  claimOutboundBatch,
  clearOutboundClaim,
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
// 4 min — leaves a 1 min cushion under the 5 min drain-lock TTL so the loop
// aborts before the lock can expire under another holder.
export const FORCE_UPLOAD_MAX_MS = 4 * 60 * 1_000

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
  clearOutboundClaim: typeof clearOutboundClaim
  listDeadLetters: typeof listDeadLetters
  markOutboundSynced: typeof markOutboundSynced
  markRawSensorRecordsSynced: typeof markRawSensorRecordsSynced
  queueDepth: typeof queueDepth
  recordOutboundFailure: typeof recordOutboundFailure
  recordOutboundFailureBatch: typeof recordOutboundFailureBatch
  acquireDrainLock: typeof acquireDrainLock
  releaseDrainLock: typeof releaseDrainLock
}

export const defaultForceUploadDependencies: ForceUploadDependencies = {
  backfillUnsyncedRawSensorRecords,
  claimOutboundBatch,
  clearOutboundClaim,
  listDeadLetters,
  markOutboundSynced,
  markRawSensorRecordsSynced,
  queueDepth,
  recordOutboundFailure,
  recordOutboundFailureBatch,
  acquireDrainLock,
  releaseDrainLock,
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

  // Coordinate with the regular drainer via the shared SQLite drain lock.
  // Without this, runForceUpload's claimOutboundBatch could SELECT the same
  // eligible rows as an in-flight drainLoop before either lease became
  // visible — both paths would then POST the same payloads. Backend
  // idempotency on (tableName, rowId) absorbs most of it but pollutes
  // dead-letter / attempt-count telemetry. TTL bumped to 5 min because
  // Force Upload can ship MUCH larger batches than the regular drain.
  const lock = await deps.acquireDrainLock(db, "force-upload", { ttlMs: 300_000 })
  if (!lock) {
    const [depthAfter, deadCount] = await Promise.all([
      deps.queueDepth(db),
      deps.listDeadLetters(db).then((rows) => rows.length),
    ])
    return {
      uploaded: 0,
      depthAfter,
      deadCount,
      error: "another sync is in progress — try again in a moment",
    }
  }

  try {
  // Anchor the deadline before backfill so a slow catch-up (up to backfillLimit
  // rows) can't eat into the 1 min cushion under the 5 min lock TTL.
  const deadline = now() + FORCE_UPLOAD_MAX_MS
  await deps.backfillUnsyncedRawSensorRecords(db, backfillLimit).catch(() => undefined)

  const total = await deps.queueDepth(db)
  if (total === 0) {
    return { uploaded: 0, depthAfter: 0, deadCount: 0, error: null }
  }

  let uploaded = 0
  let firstError: string | null = null

  while (!firstError) {
    if (now() >= deadline) {
      firstError = "force upload timed out — try again to continue"
      break
    }
    const batch = await deps.claimOutboundBatch(db, batchSize, now(), "force-upload")
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

      const ids = rows.map((r) => r.id)
      // Phase 1: POST. POST failure → bump attempts.
      try {
        await opts.post(
          tableName,
          rows.map((r) => r.payload),
        )
      } catch (err: any) {
        const errorMessage = err?.message ?? String(err)
        if (!firstError) firstError = errorMessage
        batchHadError = true
        const kind: "transient" | "permanent" = isTransientApiError(err)
          ? "transient"
          : "permanent"
        await deps.recordOutboundFailureBatch(db, ids, errorMessage, { kind })
        continue
      }

      // Phase 2: mark synced. Mark failure → backend has the data but
      // we can't record local success. Don't bump attempts (would
      // duplicate-POST). Release the lease and surface the error so
      // the caller stops; backend idempotency on (tableName, rowId)
      // handles the duplicate POST gracefully on the next attempt.
      try {
        await deps.markOutboundSynced(db, ids)
        if (tableName === "raw_sensor_records") {
          await deps.markRawSensorRecordsSynced(
            db,
            rows.map((r) => r.rowId),
            now(),
          )
        }
        uploaded += rows.length
      } catch (err: any) {
        const errorMessage = err?.message ?? "mark-synced failed"
        console.error(
          "[forceUpload] POST succeeded but markOutboundSynced failed —",
          "rows will re-POST on next drain; backend must be idempotent on (tableName, rowId).",
          "ids=", ids.slice(0, 5).join(","),
          ids.length > 5 ? `+${ids.length - 5} more` : "",
          "err=", errorMessage,
        )
        await deps.clearOutboundClaim(db, ids).catch(() => undefined)
        if (!firstError) firstError = `mark-synced failed: ${errorMessage}`
        batchHadError = true
      }
    }

    // Stop claiming more batches once anything in this batch failed.
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
  } finally {
    await deps.releaseDrainLock(db, "force-upload").catch(() => undefined)
  }
}
