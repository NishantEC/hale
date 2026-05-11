import { wipeDatabase, runMigrations } from "./index"
import { setActiveUserId } from "./session"

// Called from the logout path. Closes the local SQLite DB, deletes the
// file, clears the active user, then immediately re-runs migrations so
// a subsequent login writes into a schema-valid DB — not a tableless file.
export async function wipeDatabaseForLogout(): Promise<void> {
  await wipeDatabase()
  setActiveUserId(null)
  await runMigrations()
}
