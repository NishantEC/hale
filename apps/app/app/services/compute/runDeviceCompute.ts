import type { NoopDatabase } from "../db"
import { assembleFullDayInput } from "./assembleFullDayInput"
import { type FullDayOutput, persistFullDay } from "./persistDeviceHistory"
import { and, eq } from "drizzle-orm"

import { dailyMetrics } from "../db/schema"

// ──────────────────────────────────────────────────────────────────
// Drives the on-device Rust pipeline and persists its output as the
// device's own local-origin source of truth. Replaces the server's
// pipeline worker + downlink: assembleFullDayInput → computeFullDayJson
// (native) → persistFullDay.
// ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function nativeComputeFullDayJson(requestJson: string): string {
  // Lazy require so a missing/unlinked native module can't crash import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../../../modules/noop-compute") as {
    computeFullDayJson: (requestJson: string) => string
  }
  return mod.computeFullDayJson(requestJson)
}

function toDateKey(ms: number): string {
  // Local calendar date (matches the dashboard's day keys, which are derived
  // from local Date components). Storing/keying by the device-local day keeps
  // computed rows aligned with the selected-day matcher in the screens.
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Compute the full pipeline for one day and persist it as local-origin data.
 * Returns false (and logs) on any failure so callers can keep going across a
 * date range. The native call throws on a Rust-side error; days with no raw
 * data simply produce empty output.
 */
export async function runDeviceComputeForDay(
  db: NoopDatabase,
  userId: string,
  referenceDate: string,
  timeZone: string,
): Promise<boolean> {
  try {
    const input = await assembleFullDayInput(db, userId, referenceDate, timeZone)
    const outputJson = nativeComputeFullDayJson(JSON.stringify(input))
    const output = JSON.parse(outputJson) as FullDayOutput
    await persistFullDay(db, output, referenceDate)
    return true
  } catch (err) {
    console.warn(`[compute] day ${referenceDate} failed`, err)
    return false
  }
}

/**
 * True if a local daily metric has already been computed for `dateKey`. Used
 * to skip re-computing finalized prior days on every launch.
 */
async function hasLocalDailyMetric(
  db: NoopDatabase,
  userId: string,
  dateKey: string,
): Promise<boolean> {
  const dayDate = Date.parse(`${dateKey}T00:00:00.000Z`)
  const rows = await db
    .select({ id: dailyMetrics.id })
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.userId, userId),
        eq(dailyMetrics._origin, "local"),
        eq(dailyMetrics.dayDate, dayDate),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Compute + persist the most recent `days` days, recent-first (today first).
 * Today and yesterday always recompute (data is still arriving); older days
 * already persisted are skipped so repeat launches don't redo finalized
 * history.
 */
export async function runRecentDays(
  db: NoopDatabase,
  userId: string,
  timeZone: string,
  days = 2,
): Promise<void> {
  const today = Date.now()
  for (let i = 0; i <= days; i++) {
    const dateKey = toDateKey(today - i * DAY_MS)
    if (i >= 2 && (await hasLocalDailyMetric(db, userId, dateKey))) continue
    await runDeviceComputeForDay(db, userId, dateKey, timeZone)
  }
}

/**
 * One-time backfill of the trailing `days` days, oldest-first so each day's
 * baseline sees the previously-computed nights. Idempotent (every write is an
 * upsert), so a re-run is safe. Days with no raw data are cheap no-ops.
 */
export async function backfillDeviceHistory(
  db: NoopDatabase,
  userId: string,
  timeZone: string,
  days = 60,
): Promise<void> {
  const today = Date.now()
  for (let i = days; i >= 0; i--) {
    await runDeviceComputeForDay(db, userId, toDateKey(today - i * DAY_MS), timeZone)
  }
}

const BACKFILL_DONE_KEY = "noop.localBackfillDone"

function readFlag(key: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require("react-native-mmkv")
    return new MMKV().getBoolean(key) === true
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require("react-native-mmkv")
    new MMKV().set(key, value)
  } catch {
    // best effort — MMKV unavailable.
  }
}

/**
 * Run {@link backfillDeviceHistory} exactly once per install, guarded by an
 * MMKV flag. Safe to call on every launch — a no-op after the first success.
 */
export async function backfillDeviceHistoryOnce(
  db: NoopDatabase,
  userId: string,
  timeZone: string,
  days = 60,
): Promise<void> {
  if (readFlag(BACKFILL_DONE_KEY)) return
  await backfillDeviceHistory(db, userId, timeZone, days)
  writeFlag(BACKFILL_DONE_KEY, true)
}
