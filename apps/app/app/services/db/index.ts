import { open, type DB } from "@op-engineering/op-sqlite"
import { drizzle, OPSQLiteDatabase } from "drizzle-orm/op-sqlite"
import { migrate } from "drizzle-orm/op-sqlite/migrator"

import * as schema from "./schema"

// @ts-expect-error — migrations.js has no .d.ts and ships `export default { journal, migrations }`
import migrations from "./migrations/migrations.js"

export type NoopDatabase = OPSQLiteDatabase<typeof schema>

let dbInstance: NoopDatabase | null = null
let sqliteInstance: DB | null = null
let readDbInstance: NoopDatabase | null = null
let readSqliteInstance: DB | null = null

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
  sqliteInstance.executeSync("PRAGMA cache_size = -64000;")
  sqliteInstance.executeSync("PRAGMA temp_store = MEMORY;")
  dbInstance = drizzle(sqliteInstance, { schema })
  return dbInstance
}

// Second connection to the same SQLite file, reserved for long-running
// dashboard/aggregation reads. Lazy + module-cached. The primary connection
// keeps the WAL writer hot; routing big SELECTs here means a multi-second
// scan can't park behind a drainer commit (or vice versa).
export function getReadDb(): NoopDatabase {
  if (readDbInstance) return readDbInstance
  readSqliteInstance = open({ name: "noop.db" })
  readSqliteInstance.executeSync("PRAGMA journal_mode = WAL;")
  readSqliteInstance.executeSync("PRAGMA foreign_keys = ON;")
  readSqliteInstance.executeSync("PRAGMA busy_timeout = 5000;")
  readSqliteInstance.executeSync("PRAGMA synchronous = NORMAL;")
  readSqliteInstance.executeSync("PRAGMA cache_size = -64000;")
  readSqliteInstance.executeSync("PRAGMA temp_store = MEMORY;")
  readDbInstance = drizzle(readSqliteInstance, { schema })
  return readDbInstance
}

export async function runMigrations(): Promise<void> {
  const db = openDatabase()
  await migrate(db, migrations)
}

export async function wipeDatabase(): Promise<void> {
  if (readSqliteInstance) {
    readSqliteInstance.close()
    readDbInstance = null
    readSqliteInstance = null
  }
  if (!sqliteInstance) return
  sqliteInstance.close()
  sqliteInstance.delete()
  dbInstance = null
  sqliteInstance = null
}

// Resolve the on-device filesystem path of the active SQLite file. Used
// by the Inspector "Export DB" action so the user can hand the file to a
// SQLite client on Mac via expo-sharing. Returns null if the database
// hasn't been opened yet (caller should call openDatabase() first).
export function getDatabaseFilePath(): string | null {
  if (!sqliteInstance) return null
  return sqliteInstance.getDbPath()
}

export { schema }
