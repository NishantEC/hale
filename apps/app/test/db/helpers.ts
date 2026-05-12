import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../../app/services/db/schema"
import fs from "fs"
import path from "path"

// Test-only DB factory. expo-sqlite requires native bindings that aren't
// available in the Jest/Node test environment, so tests use better-sqlite3
// (same SQL dialect) with drizzle's matching driver. Schema round-trips
// because Drizzle emits portable SQLite DDL.

export function makeTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  applyGeneratedSchema(sqlite)
  const db = drizzle(sqlite, { schema })
  // better-sqlite3's `.transaction` is synchronous and rejects async
  // callbacks; expo-sqlite (production) accepts them. Production code
  // uses `await db.transaction(async (tx) => { ... })`. Shim the test
  // driver to run the callback directly so that atomicity-aware
  // production code is exercisable in unit tests. Atomicity itself
  // isn't asserted at this layer — these tests aren't crash-path tests.
  ;(db as any).transaction = async (callback: (tx: typeof db) => Promise<any>) =>
    callback(db)
  return db
}

function applyGeneratedSchema(sqlite: Database.Database) {
  // Apply every migration in order so tests run against the latest schema
  // (matches what `runMigrations` does on a real device). 0001 is the
  // idempotent repair migration and is intentionally idempotent over
  // 0000.
  const migrationsDir = path.resolve(
    __dirname,
    "..",
    "..",
    "app",
    "services",
    "db",
    "migrations",
  )
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
  for (const file of files) {
    const source = fs.readFileSync(path.join(migrationsDir, file), "utf8")
    const statements = source
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) sqlite.exec(stmt)
  }
}
