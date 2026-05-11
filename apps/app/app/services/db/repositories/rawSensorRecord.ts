import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { rawSensorRecords } from "../schema"
import { getActiveUserId } from "../session"
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
  // ID is timestamp-only (`ts-${timestamp}`). The strap emits multiple packet
  // formats per sample (V12/V24 full sensor, generic HR-only, retransmits).
  // We merge them via COALESCE: the first-seen value for each field wins,
  // unless it's null — in which case the new value fills the gap. This way:
  //   - A generic HR-only packet that arrives first leaves gravity null.
  //     The follow-up V12/V24 packet fills gravity in.
  //   - A V12/V24 packet that arrives first sets every field. A later
  //     generic packet's HR/RR is preserved from the V12/V24, sensor data
  //     stays valid (excluded.gravityX is null → COALESCE picks existing).
  await db
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
        // Reset sync state on merge — new fields landed, downstream needs to re-uplink.
        _syncedAt: sql`NULL`,
      },
    })
  // Push every raw record into the outbound queue so the drain loop
  // ships them to /pipeline/ingest-table. Idempotent via the
  // (tableName, rowId) unique index — re-merges from later packets
  // just bump _syncedAt back to null above without duplicating queue
  // entries.
  await enqueueOutbound(db, {
    tableName: "raw_sensor_records",
    rowId: input.id,
    payload: input,
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
): Promise<number> {
  const userId = getActiveUserId()
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
