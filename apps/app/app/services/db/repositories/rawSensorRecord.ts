import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm"
import { getReadDb, type NoopDatabase } from "../index"
import { withWrite, type WriteTx } from "../transaction"
import { rawSensorRecords } from "../schema"
import { getActiveUserId, peekActiveUserId } from "../session"
import { notifyTable } from "../observable"
import { enqueueOutboundTx } from "./outboundQueue"

export interface RawSensorRecordInput {
  id: string
  timestamp: number
  heartRate: number
  rrAverageMs: number | null
  spo2Red: number | null
  spo2IR: number | null
  skinTempRaw: number | null
  gravityMagnitude: number | null
  gravityX: number | null
  gravityY: number | null
  gravityZ: number | null
  respRateRaw: number | null
  skinContact: number | null
  ppgGreen: number | null
  ppgRedIr: number | null
  ambientLight: number | null
  ledDrive1: number | null
  ledDrive2: number | null
  signalQuality: number | null
}

// Tx-scoped insert. Must be called inside a withWrite() callback — the
// caller is responsible for notifyTable() once after the surrounding
// transaction commits.
export async function insertRawSensorRecordTx(
  tx: WriteTx,
  input: RawSensorRecordInput,
  userId: string,
): Promise<void> {
  // Strap re-deliveries from flash bring records we already uploaded. Looking
  // up the existing row first lets us skip re-enqueueing rows that are already
  // synced — otherwise outbound_queue bloats with no-op POSTs every cycle.
  // We still run the upsert so any merged-in field (e.g. HR going from 0 to a
  // real value via the CASE in onConflictDoUpdate) keeps that improvement
  // locally; we just don't ship it again unless it materially changed.
  const existing = await tx
    .select({
      _syncedAt: rawSensorRecords._syncedAt,
      heartRate: rawSensorRecords.heartRate,
      skinContact: rawSensorRecords.skinContact,
    })
    .from(rawSensorRecords)
    .where(eq(rawSensorRecords.id, input.id))
    .limit(1)

  const prior = existing[0]
  const wasSynced = prior?._syncedAt != null
  // If we already synced this row and the new payload doesn't recover HR
  // (going from 0 to a real value) or fill in a skinContact reading, this is
  // a pure re-delivery — no reason to re-enqueue.
  const recoversHR = prior != null && prior.heartRate === 0 && input.heartRate > 0
  const fillsSkinContact = prior != null && prior.skinContact == null && input.skinContact != null
  const skipEnqueue = wasSynced && !recoversHR && !fillsSkinContact

  await tx
    .insert(rawSensorRecords)
    .values({
      ...input,
      _syncedAt: null,
      _localCreatedAt: Date.now(),
      _origin: "local",
      userId,
    })
    .onConflictDoUpdate({
      target: rawSensorRecords.id,
      set: {
        heartRate: sql`CASE WHEN excluded.heart_rate > 0 THEN excluded.heart_rate ELSE ${rawSensorRecords.heartRate} END`,
        rrAverageMs: sql`COALESCE(excluded.rr_average_ms, ${rawSensorRecords.rrAverageMs})`,
        spo2Red: sql`COALESCE(excluded.spo2_red, ${rawSensorRecords.spo2Red})`,
        spo2IR: sql`COALESCE(excluded.spo2_ir, ${rawSensorRecords.spo2IR})`,
        skinTempRaw: sql`COALESCE(excluded.skin_temp_raw, ${rawSensorRecords.skinTempRaw})`,
        gravityMagnitude: sql`COALESCE(excluded.gravity_magnitude, ${rawSensorRecords.gravityMagnitude})`,
        gravityX: sql`COALESCE(excluded.gravity_x, ${rawSensorRecords.gravityX})`,
        gravityY: sql`COALESCE(excluded.gravity_y, ${rawSensorRecords.gravityY})`,
        gravityZ: sql`COALESCE(excluded.gravity_z, ${rawSensorRecords.gravityZ})`,
        respRateRaw: sql`COALESCE(excluded.resp_rate_raw, ${rawSensorRecords.respRateRaw})`,
        skinContact: sql`COALESCE(excluded.skin_contact, ${rawSensorRecords.skinContact})`,
        ppgGreen: sql`COALESCE(excluded.ppg_green, ${rawSensorRecords.ppgGreen})`,
        ppgRedIr: sql`COALESCE(excluded.ppg_red_ir, ${rawSensorRecords.ppgRedIr})`,
        ambientLight: sql`COALESCE(excluded.ambient_light, ${rawSensorRecords.ambientLight})`,
        ledDrive1: sql`COALESCE(excluded.led_drive_1, ${rawSensorRecords.ledDrive1})`,
        ledDrive2: sql`COALESCE(excluded.led_drive_2, ${rawSensorRecords.ledDrive2})`,
        signalQuality: sql`COALESCE(excluded.signal_quality, ${rawSensorRecords.signalQuality})`,
      },
    })
  if (skipEnqueue) return
  await enqueueOutboundTx(tx, {
    tableName: "raw_sensor_records",
    rowId: input.id,
    payload: input,
  })
  // If we're re-enqueueing a previously-synced row because the payload
  // genuinely improved (HR recovered, skinContact filled), clear _syncedAt so
  // the drainer treats it as fresh and re-marks it after a successful upload.
  if (wasSynced) {
    await tx
      .update(rawSensorRecords)
      .set({ _syncedAt: null })
      .where(eq(rawSensorRecords.id, input.id))
  }
}

export async function insertRawSensorRecord(
  db: NoopDatabase,
  input: RawSensorRecordInput,
): Promise<void> {
  const userId = getActiveUserId()
  await withWrite(db, async (tx) => {
    await insertRawSensorRecordTx(tx, input, userId)
  })
  notifyTable("raw_sensor_records")
}

/**
 * Backfill helper: enqueue any locally-unsynced raw_sensor_records
 * into the outbound queue. Used once on app launch after upgrading
 * past the fix, so records inserted by older builds (which didn't
 * enqueue) finally get shipped.
 */
export async function backfillUnsyncedRawSensorRecords(
  db: NoopDatabase,
  limit = 100,
): Promise<number> {
  const userId = peekActiveUserId()
  if (!userId) return 0
  const unsynced = await db
    .select()
    .from(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        isNull(rawSensorRecords._syncedAt),
      ),
    )
    .orderBy(asc(rawSensorRecords.timestamp))
    .limit(limit)

  await withWrite(db, async (tx) => {
    for (const row of unsynced) {
      await enqueueOutboundTx(tx, {
        tableName: "raw_sensor_records",
        rowId: row.id,
        payload: row,
      })
    }
  })
  return unsynced.length
}

export async function listRawSensorRecordsByDateRange(
  db: NoopDatabase,
  fromTs: number,
  toTs: number,
) {
  const userId = getActiveUserId()
  return db
    .select()
    .from(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        gte(rawSensorRecords.timestamp, fromTs),
        lte(rawSensorRecords.timestamp, toTs),
      ),
    )
    .orderBy(asc(rawSensorRecords.timestamp))
}

export async function countRawSensorRecordsPerHour(
  _db: NoopDatabase,
  hours: number,
): Promise<Array<{ hourStartUtc: string; rows: number }>> {
  // Long-running aggregation — route to the read-only connection so it
  // doesn't park behind the WAL writer (drain commits / streaming inserts).
  const readDb = getReadDb()
  const userId = getActiveUserId()
  const nowMs = Date.now()
  const bucketStartMs = Math.floor((nowMs - hours * 3_600_000) / 3_600_000) * 3_600_000

  const rows = (await readDb
    .select({
      bucket: sql<number>`((${rawSensorRecords.timestamp}) / 3600000) * 3600000`.as("bucket"),
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(rawSensorRecords)
    .where(
      and(
        eq(rawSensorRecords.userId, userId),
        gte(rawSensorRecords.timestamp, bucketStartMs),
      ),
    )
    .groupBy(sql`bucket`)
    .orderBy(sql`bucket ASC`)) as Array<{ bucket: number; count: number }>

  const byHour = new Map<number, number>()
  for (const r of rows) byHour.set(Number(r.bucket), Number(r.count))

  const totalBuckets = Math.ceil((nowMs - bucketStartMs) / 3_600_000) + 1
  const out: Array<{ hourStartUtc: string; rows: number }> = []
  for (let i = 0; i < totalBuckets; i++) {
    const t = bucketStartMs + i * 3_600_000
    out.push({ hourStartUtc: new Date(t).toISOString(), rows: byHour.get(t) ?? 0 })
  }
  return out
}

export async function markRawSensorRecordsSynced(
  db: NoopDatabase,
  ids: string[],
  syncedAt: number,
): Promise<void> {
  if (ids.length === 0) return
  // SQLite's default parameter cap is 999. Chunk at 500 for safety.
  const CHUNK = 500
  await withWrite(db, async (tx) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await tx
        .update(rawSensorRecords)
        .set({ _syncedAt: syncedAt })
        .where(inArray(rawSensorRecords.id, slice))
    }
  })
}

export async function getRawSyncBreakdown(db: NoopDatabase): Promise<{
  total: number
  synced: number
  pending: number
  oldestPendingMs: number | null
}> {
  const userId = peekActiveUserId()
  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      synced: sql<number>`sum(case when ${rawSensorRecords._syncedAt} is not null then 1 else 0 end)`,
      oldestPending: sql<number | null>`min(case when ${rawSensorRecords._syncedAt} is null then ${rawSensorRecords.timestamp} end)`,
    })
    .from(rawSensorRecords)
    .where(userId ? eq(rawSensorRecords.userId, userId) : sql`1=1`)
  const row = rows[0]
  const total = row?.total ?? 0
  const synced = row?.synced ?? 0
  return {
    total,
    synced,
    pending: total - synced,
    oldestPendingMs: row?.oldestPending ?? null,
  }
}
