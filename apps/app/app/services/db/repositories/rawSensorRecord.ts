import { and, asc, eq, gte, lte, sql } from "drizzle-orm"
import { getReadDb, type NoopDatabase } from "../index"
import { withWrite, type WriteTx } from "../transaction"
import { rawSensorRecords } from "../schema"
import { getActiveUserId, peekActiveUserId } from "../session"
import { notifyTable } from "../observable"

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
  await tx
    .insert(rawSensorRecords)
    .values({
      ...input,
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

/**
 * Local strap-data health for the Inspector — the serverless replacement for
 * the server's `/debug/overview`. Returns the most-recent local raw sample
 * timestamp (drives the strap "stream silent" check) and how many distinct
 * minutes of the local day `[dayStartMs, dayStartMs + 24h)` carry at least
 * one local raw sample (the coverage ring). Routed to the read-only
 * connection so it doesn't park behind the WAL writer.
 */
export async function getRawCoverageForDay(
  _db: NoopDatabase,
  dayStartMs: number,
): Promise<{ latestTimestampMs: number | null; coverageMinutes: number }> {
  const userId = peekActiveUserId()
  if (!userId) return { latestTimestampMs: null, coverageMinutes: 0 }
  const readDb = getReadDb()
  const dayEndMs = dayStartMs + 24 * 3_600_000
  const rows = (await readDb
    .select({
      latest: sql<number | null>`MAX(${rawSensorRecords.timestamp})`,
      minutes: sql<number>`COUNT(DISTINCT CASE WHEN ${rawSensorRecords.timestamp} >= ${dayStartMs} AND ${rawSensorRecords.timestamp} < ${dayEndMs} THEN ${rawSensorRecords.timestamp} / 60000 END)`,
    })
    .from(rawSensorRecords)
    .where(and(eq(rawSensorRecords.userId, userId), eq(rawSensorRecords._origin, "local")))) as Array<{
    latest: number | null
    minutes: number
  }>
  const row = rows[0]
  return { latestTimestampMs: row?.latest ?? null, coverageMinutes: Number(row?.minutes ?? 0) }
}
