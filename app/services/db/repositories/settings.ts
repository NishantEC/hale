import { eq } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { settings } from "../schema"

export async function getSetting(db: NoopDatabase, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return row?.value ?? null
}

export async function setSetting(db: NoopDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

export const SETTING_RAW_RETENTION_DAYS = "raw_retention_days"
export const DEFAULT_RAW_RETENTION_DAYS = 30
