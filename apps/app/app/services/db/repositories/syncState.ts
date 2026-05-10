import { eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { syncState } from "../schema"

export async function getLastSyncAt(db: NoopDatabase, tableName: string): Promise<number> {
  const [row] = await db.select().from(syncState).where(eq(syncState.tableName, tableName))
  return row?.lastSyncAt ?? 0
}

export async function setLastSyncAt(
  db: NoopDatabase,
  tableName: string,
  lastSyncAt: number,
  lastSyncedRowTimestamp?: number,
): Promise<void> {
  const safeLastSyncAt = Number.isFinite(lastSyncAt) ? lastSyncAt : 0
  const safeRowTs =
    lastSyncedRowTimestamp != null && Number.isFinite(lastSyncedRowTimestamp)
      ? lastSyncedRowTimestamp
      : null
  await db
    .insert(syncState)
    .values({ tableName, lastSyncAt: safeLastSyncAt, lastSyncedRowTimestamp: safeRowTs })
    .onConflictDoUpdate({
      target: syncState.tableName,
      set: { lastSyncAt: safeLastSyncAt, lastSyncedRowTimestamp: safeRowTs },
    })
}
