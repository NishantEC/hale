import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { rawSensorRecords } from "../schema"
import { getActiveUserId, peekActiveUserId } from "../session"
import { notifyTable } from "../observable"
import { enqueueOutbound } from "./outboundQueue"

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

export async function insertRawSensorRecord(
  db: NoopDatabase,
  input: RawSensorRecordInput,
): Promise<void> {
  const userId = getActiveUserId()
  // Atomic insert + enqueue: a single SQLite transaction ensures the row
  // and its outbound queue entry land together or not at all. Without
  // this, a crash between the two writes could leave the row visible
  // locally with no outbound entry, requiring the backfill helper to
  // recover.
  await db.transaction(async (tx) => {
    // ID is timestamp-only (`ts-${timestamp}`). The strap emits multiple
    // packet formats per sample (V12/V24 full sensor, generic HR-only,
    // retransmits). We merge them via COALESCE: the first-seen value for
    // each field wins, unless it's null — in which case the new value
    // fills the gap.
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
          // HR: prefer non-zero readings (zero is our "junk" sentinel from
          // the bleIngest validity filter)
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
          // Note: we deliberately do NOT reset _syncedAt here. A late merge
          // of a generic HR-only packet onto an already-synced V12 row
          // would force a redundant re-upload; the backend's own COALESCE
          // upsert would not actually add anything new. The enqueueOutbound
          // below is what schedules an upload for genuinely-new data; the
          // _syncedAt timestamp tracks when this row last shipped.
        },
      })
    await enqueueOutbound(tx, {
      tableName: "raw_sensor_records",
      rowId: input.id,
      payload: input,
    })
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

  for (const row of unsynced) {
    await enqueueOutbound(db, {
      tableName: "raw_sensor_records",
      rowId: row.id,
      payload: row,
    })
  }
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

export async function markRawSensorRecordsSynced(
  db: NoopDatabase,
  ids: string[],
  syncedAt: number,
): Promise<void> {
  if (ids.length === 0) return
  for (const id of ids) {
    await db.update(rawSensorRecords).set({ _syncedAt: syncedAt }).where(eq(rawSensorRecords.id, id))
  }
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
