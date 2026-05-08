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
  return drizzle(sqlite, { schema })
}

function applyGeneratedSchema(sqlite: Database.Database) {
  const sqlPath = path.resolve(
    __dirname,
    "..",
    "..",
    "app",
    "services",
    "db",
    "migrations",
    "0000_init.sql",
  )
  const source = fs.readFileSync(sqlPath, "utf8")
  // drizzle-kit emits statements separated by --> statement-breakpoint
  const statements = source
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) sqlite.exec(stmt)
}
