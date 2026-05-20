import { eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { syncState } from "../schema"

export async function getLastSyncAt(db: NoopDatabase, tableName: string): Promise<number> {
  const [row] = await db.select().from(syncState).where(eq(syncState.tableName, tableName))
  return row?.lastSyncAt ?? 0
}

export async function getSyncCursor(
  db: NoopDatabase,
  tableName: string,
): Promise<{ lastSyncAt: number; lastSyncedRowId: string | null }> {
  const [row] = await db.select().from(syncState).where(eq(syncState.tableName, tableName))
  return {
    lastSyncAt: row?.lastSyncAt ?? 0,
    lastSyncedRowId: row?.lastSyncedRowId ?? null,
  }
}

export async function setLastSyncAt(
  db: NoopDatabase,
  tableName: string,
  lastSyncAt: number,
  lastSyncedRowTimestamp?: number,
  lastSyncedRowId?: string | null,
): Promise<void> {
  const safeLastSyncAt = Number.isFinite(lastSyncAt) ? lastSyncAt : 0
  const safeRowTs =
    lastSyncedRowTimestamp != null && Number.isFinite(lastSyncedRowTimestamp)
      ? lastSyncedRowTimestamp
      : null
  const safeRowId = typeof lastSyncedRowId === "string" ? lastSyncedRowId : null
  await db
    .insert(syncState)
    .values({
      tableName,
      lastSyncAt: safeLastSyncAt,
      lastSyncedRowTimestamp: safeRowTs,
      lastSyncedRowId: safeRowId,
    })
    .onConflictDoUpdate({
      target: syncState.tableName,
      set: {
        lastSyncAt: safeLastSyncAt,
        lastSyncedRowTimestamp: safeRowTs,
        lastSyncedRowId: safeRowId,
      },
    })
}
