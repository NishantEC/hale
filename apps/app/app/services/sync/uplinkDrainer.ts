import type { NoopDatabase } from "../db"
import { isTransientApiError } from "../api/noopClient"
import {
  acquireDrainLock,
  releaseDrainLock,
} from "../db/repositories/drainLock"
import {
  claimOutboundBatch,
  clearOutboundClaim,
  markOutboundSynced,
  oldestPendingAt,
  queueDepth,
  recordOutboundFailureBatch,
} from "../db/repositories/outboundQueue"
import {
  backfillUnsyncedRawSensorRecords,
  markRawSensorRecordsSynced,
} from "../db/repositories/rawSensorRecord"
import { recordDrainOutcome } from "./syncTelemetry"

export interface DrainOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize: number
  // Cheap top-up of unsynced raw rows into the outbound queue at the
  // start of each drain. Defaults to a small limit so the regular drain
  // path isn't dominated by recovery work; ForceUpload uses a larger
  // limit to flush long offline periods.
  backfillLimit?: number
  // Identifier stamped into the outbound_queue lease so a concurrent
  // drainer can see whose rows are in flight. Should match the
  // drainLoop holder for clarity.
  holder?: string
}

const DEFAULT_BACKFILL_LIMIT = 100

export interface DrainOutcome {
  attempted: number
  succeeded: number
  failed: number
  durationMs: number
  error: string | null
}

export async function drainOnce(
  db: NoopDatabase,
  opts: DrainOptions,
): Promise<DrainOutcome> {
  const started = Date.now()
  const outcome: DrainOutcome = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    durationMs: 0,
    error: null,
  }

  // Cheap backfill so rows that landed without an outbound entry (older
  // builds, recovery from partial writes) don't require Force Upload to
  // ship. Bounded so the regular drain isn't dominated by recovery work.
  try {
    await backfillUnsyncedRawSensorRecords(db, opts.backfillLimit ?? DEFAULT_BACKFILL_LIMIT)
  } catch (err) {
    console.warn("[drainOnce] backfill failed", err)
  }

  const holder = opts.holder ?? "drainer"
  const batch = await claimOutboundBatch(db, opts.batchSize, Date.now(), holder)
  if (batch.length === 0) {
    outcome.durationMs = Date.now() - started
    return outcome
  }
  outcome.attempted = batch.length

  // Group by tableName so each POST carries a single-table bulk payload.
  const groups = new Map<string, typeof batch>()
  for (const row of batch) {
    const list = groups.get(row.tableName) ?? []
    list.push(row)
    groups.set(row.tableName, list)
  }

  for (const [tableName, rows] of groups) {
    const payloads = rows.map((r) => r.payload)
    const ids = rows.map((r) => r.id)
    // Phase 1: POST. Fail-and-bump-attempts is the right behavior for
    // POST failures only — those rows haven't reached the backend.
    let posted = false
    try {
      await opts.post(tableName, payloads)
      posted = true
    } catch (err: any) {
      const transient = isTransientApiError(err)
      const errorMessage = err?.message ?? "unknown error"
      // Batched failure update — single transaction across all rows.
      // recordOutboundFailureBatch also clears the lease so the row
      // becomes claimable again once its backoff window opens.
      await recordOutboundFailureBatch(
        db,
        ids,
        errorMessage,
        { kind: transient ? "transient" : "permanent" },
      )
      outcome.failed += rows.length
      if (!outcome.error) outcome.error = errorMessage
      continue
    }

    // Phase 2: mark synced. If THIS fails, the backend has the rows
    // but we couldn't record local success — we must NOT bump
    // attempts (would re-POST and duplicate). Surface as an error so
    // the loop can decide to stop, but release the lease so the row
    // can be re-claimed; on the next claim, the backend's idempotency
    // on (tableName, rowId) handles the duplicate POST gracefully.
    try {
      await markOutboundSynced(db, ids)
      if (tableName === "raw_sensor_records") {
        await markRawSensorRecordsSynced(
          db,
          rows.map((r) => r.rowId),
          Date.now(),
        )
      }
      outcome.succeeded += rows.length
    } catch (err: any) {
      const errorMessage = err?.message ?? "mark-synced failed"
      console.error(
        "[drainOnce] POST succeeded but markOutboundSynced failed —",
        "rows will re-POST on next drain; backend must be idempotent on (tableName, rowId).",
        "ids=", ids.slice(0, 5).join(","),
        ids.length > 5 ? `+${ids.length - 5} more` : "",
        "err=", errorMessage,
      )
      await clearOutboundClaim(db, ids).catch(() => {})
      outcome.failed += rows.length
      if (!outcome.error) outcome.error = `mark-synced failed: ${errorMessage}`
    }
  }

  outcome.durationMs = Date.now() - started
  return outcome
}

export interface DrainLoopOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize?: number
  backfillLimit?: number
  maxMs?: number
  // Identifier surfaced in the drain_lock row so debug tools can see
  // which JS context is currently draining ("foreground" / "background").
  holder?: string
}

export interface DrainLoopOutcome {
  drained: number
  failed: number
  durationMs: number
  oldestPendingAt: number | null
  skipped: "locked" | null
  error: string | null
}

export async function drainLoop(
  db: NoopDatabase,
  opts: DrainLoopOptions,
): Promise<DrainLoopOutcome> {
  const { post, batchSize = 200, backfillLimit = 200, maxMs, holder = "foreground" } = opts
  const started = Date.now()
  const deadline = maxMs != null ? started + maxMs : Infinity

  // Take a SQLite-backed lock so the foreground interval and the Expo
  // background task can't double-claim the same rows. TTL is intentionally
  // longer than the drain we expect — if the holder crashes mid-drain,
  // the lock expires and the next caller can reclaim.
  const lock = await acquireDrainLock(db, holder, { ttlMs: 90_000 })
  if (!lock) {
    const outcome: DrainLoopOutcome = {
      drained: 0,
      failed: 0,
      durationMs: 0,
      oldestPendingAt: await oldestPendingAt(db),
      skipped: "locked",
      error: null,
    }
    recordDrainOutcome({
      at: started,
      durationMs: 0,
      drained: 0,
      failed: 0,
      error: null,
      oldestPendingAt: outcome.oldestPendingAt,
      skipped: "locked",
      holder,
    })
    return outcome
  }

  let drained = 0
  let failed = 0
  let firstError: string | null = null
  try {
    while (Date.now() < deadline) {
      const before = await queueDepth(db)
      if (before === 0) break
      const outcome = await drainOnce(db, { post, batchSize, backfillLimit, holder })
      drained += outcome.succeeded
      failed += outcome.failed
      if (!firstError && outcome.error) firstError = outcome.error
      const after = await queueDepth(db)
      if (after >= before) break
    }
  } finally {
    await releaseDrainLock(db, holder)
  }

  const finalOutcome: DrainLoopOutcome = {
    drained,
    failed,
    durationMs: Date.now() - started,
    oldestPendingAt: await oldestPendingAt(db),
    skipped: null,
    error: firstError,
  }
  recordDrainOutcome({
    at: started,
    durationMs: finalOutcome.durationMs,
    drained,
    failed,
    error: firstError,
    oldestPendingAt: finalOutcome.oldestPendingAt,
    skipped: null,
    holder,
  })
  return finalOutcome
}
