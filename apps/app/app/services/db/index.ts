import * as SQLite from "expo-sqlite"
import { drizzle, ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite"
import { migrate } from "drizzle-orm/expo-sqlite/migrator"
import * as schema from "./schema"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrations = require("./migrations/migrations.js")

export type NoopDatabase = ExpoSQLiteDatabase<typeof schema>

let dbInstance: NoopDatabase | null = null
let sqliteInstance: SQLite.SQLiteDatabase | null = null

export function openDatabase(): NoopDatabase {
  if (dbInstance) return dbInstance
  sqliteInstance = SQLite.openDatabaseSync("noop.db")
  sqliteInstance.execSync("PRAGMA journal_mode = WAL;")
  sqliteInstance.execSync("PRAGMA foreign_keys = ON;")
  dbInstance = drizzle(sqliteInstance, { schema })
  return dbInstance
}

export async function runMigrations(): Promise<void> {
  const db = openDatabase()
  await migrate(db, migrations)
}

export async function wipeDatabase(): Promise<void> {
  if (!sqliteInstance) return
  sqliteInstance.closeSync()
  await SQLite.deleteDatabaseAsync("noop.db")
  dbInstance = null
  sqliteInstance = null
}

export { schema }
