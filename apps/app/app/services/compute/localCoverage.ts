import { and, eq, gte, lt, sql } from "drizzle-orm"

import type { CoverageKind, CoverageResponse } from "../api/viewModels"
import type { NoopDatabase } from "../db"
import { dailyMetrics, rawSensorRecords } from "../db/schema"
import { getActiveUserId } from "../db/session"

const LOCAL = "local" as const
const DAY_MS = 24 * 60 * 60 * 1000

// ──────────────────────────────────────────────────────────────────
// Local-first replacement for the server's `/views/coverage`. Marks each day
// in the [fromCursor, toCursor] month range by what the device itself stored:
//   - a local `dailyMetrics` row for the day → 'full' (the day was computed)
//   - raw sensor samples but no computed day → 'partial' (data, not rolled up)
//   - nothing → 'none'
// Day buckets use the same UTC-midnight convention as `dayDate`
// (`Date.parse(`${key}T00:00:00.000Z`)`), so set membership lines up exactly.
// The literal 86400000 is kept inline in the SQL so SQLite does integer
// division (a bound param could bind as a double and yield a non-midnight ms).
// ──────────────────────────────────────────────────────────────────

export async function computeLocalCoverage(
  db: NoopDatabase,
  fromCursor: string,
  toCursor: string,
): Promise<CoverageResponse> {
  const userId = getActiveUserId()
  const rangeStart = monthStartMs(fromCursor)
  const rangeEnd = monthStartMs(nextMonth(toCursor)) // exclusive

  const dayBucket = sql<number>`(${rawSensorRecords.timestamp} / 86400000) * 86400000`

  const [metricDays, rawDayRows] = await Promise.all([
    db
      .select({ dayDate: dailyMetrics.dayDate })
      .from(dailyMetrics)
      .where(
        and(
          eq(dailyMetrics.userId, userId),
          eq(dailyMetrics._origin, LOCAL),
          gte(dailyMetrics.dayDate, rangeStart),
          lt(dailyMetrics.dayDate, rangeEnd),
        ),
      ),
    db
      .select({ day: dayBucket })
      .from(rawSensorRecords)
      .where(
        and(
          eq(rawSensorRecords.userId, userId),
          eq(rawSensorRecords._origin, LOCAL),
          gte(rawSensorRecords.timestamp, rangeStart),
          lt(rawSensorRecords.timestamp, rangeEnd),
        ),
      )
      .groupBy(dayBucket),
  ])

  const fullDays = new Set(metricDays.map((r) => r.dayDate))
  const rawDays = new Set(rawDayRows.map((r) => r.day))

  const days: CoverageResponse["days"] = []
  for (let ms = rangeStart; ms < rangeEnd; ms += DAY_MS) {
    const coverage: CoverageKind = fullDays.has(ms)
      ? "full"
      : rawDays.has(ms)
        ? "partial"
        : "none"
    days.push({ date: new Date(ms).toISOString().slice(0, 10), coverage })
  }
  return { days }
}

function monthStartMs(cursor: string): number {
  return Date.parse(`${cursor}-01T00:00:00.000Z`)
}

function nextMonth(cursor: string): string {
  const [y, m] = cursor.split("-").map(Number)
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}
