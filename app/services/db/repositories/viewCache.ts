import { and, eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { viewCache } from "../schema"
import { getActiveUserId } from "../session"

export async function setViewCache(
  db: NoopDatabase,
  viewName: string,
  date: string,
  payload: unknown,
): Promise<void> {
  const userId = getActiveUserId()
  await db
    .insert(viewCache)
    .values({
      viewName,
      date,
      userId,
      payload: JSON.stringify(payload),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [viewCache.viewName, viewCache.date, viewCache.userId],
      set: { payload: JSON.stringify(payload), updatedAt: Date.now() },
    })
}

export async function getViewCache<T>(
  db: NoopDatabase,
  viewName: string,
  date: string,
): Promise<T | null> {
  const userId = getActiveUserId()
  const [row] = await db
    .select()
    .from(viewCache)
    .where(
      and(
        eq(viewCache.viewName, viewName),
        eq(viewCache.date, date),
        eq(viewCache.userId, userId),
      ),
    )
  if (!row) return null
  return JSON.parse(row.payload) as T
}
