import { and, eq } from "drizzle-orm"

import type { NoopDatabase } from "../index"
import { notifyTable } from "../observable"
import { viewCache } from "../schema"
import { peekActiveUserId } from "../session"

export async function setViewCache(
  db: NoopDatabase,
  viewName: string,
  date: string,
  payload: unknown,
): Promise<void> {
  const userId = peekActiveUserId()
  if (!userId) return

  const payloadJson = JSON.stringify(payload)
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
