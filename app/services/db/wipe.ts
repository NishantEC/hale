import { wipeDatabase } from "./index"
import { setActiveUserId } from "./session"

// Called from the logout path. Closes the local SQLite DB, deletes the
// file, and clears the active user so subsequent writes will fail-fast
// until the next login.

export async function wipeDatabaseForLogout(): Promise<void> {
  await wipeDatabase()
  setActiveUserId(null)
}
