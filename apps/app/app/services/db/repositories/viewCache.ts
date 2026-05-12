import { and, eq } from "drizzle-orm"

import type { NoopDatabase } from "../index"
import { notifyTable } from "../observable"
import { viewCache } from "../schema"
import { peekActiveUserId } from "../session"

const LOCK_RETRY_DELAYS_MS = [50, 150, 300]

function isDatabaseLockedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.toLowerCase().includes("database is locked") ||
    /Error code 5(?![0-9])/.test(message) ||
    /SQLITE_BUSY/i.test(message)
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function setViewCache(
  db: NoopDatabase,
  viewName: string,
  date: string,
  payload: unknown,
): Promise<void> {
  const userId = peekActiveUserId()
  if (!userId) return

  const payloadJson = JSON.stringify(payload)
  for (let attempt = 0; ; attempt++) {
    try {
      await db
        .insert(viewCache)
        .values({
          viewName,
          date,
          userId,
          payload: payloadJson,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [viewCache.viewName, viewCache.date, viewCache.userId],
          set: { payload: payloadJson, updatedAt: Date.now() },
        })
      break
    } catch (err) {
      const delay = LOCK_RETRY_DELAYS_MS[attempt]
      if (delay == null || !isDatabaseLockedError(err)) throw err
      await wait(delay)
    }
  }
  notifyTable("view_cache")
}

export async function getViewCache<T>(
  db: NoopDatabase,
  viewName: string,
  date: string,
): Promise<T | null> {
  const userId = peekActiveUserId()
  if (!userId) return null
  const [row] = await db
    .select()
    .from(viewCache)
    .where(
      and(eq(viewCache.viewName, viewName), eq(viewCache.date, date), eq(viewCache.userId, userId)),
    )
  if (!row) return null
  return JSON.parse(row.payload) as T
}
