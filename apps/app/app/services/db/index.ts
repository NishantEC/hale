import { open, type DB } from "@op-engineering/op-sqlite"
import { drizzle, OPSQLiteDatabase } from "drizzle-orm/op-sqlite"
import { migrate } from "drizzle-orm/op-sqlite/migrator"

import * as schema from "./schema"

// @ts-expect-error — migrations.js has no .d.ts and ships `export default { journal, migrations }`
import migrations from "./migrations/migrations.js"

export type NoopDatabase = OPSQLiteDatabase<typeof schema>

let dbInstance: NoopDatabase | null = null
let sqliteInstance: DB | null = null

// op-sqlite gives multi-connection per file and a properly async Drizzle
// adapter that awaits transaction callbacks. That's what makes the old
// `runExclusive` JS mutex + sync-only `withWrite` workaround unnecessary —
// reader cursors no longer block writer commits, and async tx bodies are
// finished before COMMIT runs.
export function openDatabase(): NoopDatabase {
  if (dbInstance) return dbInstance
  sqliteInstance = open({ name: "noop.db" })
  sqliteInstance.executeSync("PRAGMA journal_mode = WAL;")
  sqliteInstance.executeSync("PRAGMA foreign_keys = ON;")
  sqliteInstance.executeSync("PRAGMA busy_timeout = 5000;")
  sqliteInstance.executeSync("PRAGMA synchronous = NORMAL;")
  dbInstance = drizzle(sqliteInstance, { schema })
  return dbInstance
}

export async function runMigrations(): Promise<void> {
  const db = openDatabase()
  await migrate(db, migrations)
}

export async function wipeDatabase(): Promise<void> {
  if (!sqliteInstance) return
  sqliteInstance.close()
  sqliteInstance.delete()
  dbInstance = null
  sqliteInstance = null
}

export { schema }
