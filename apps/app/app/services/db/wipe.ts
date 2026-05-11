import { setActiveUserId } from "./session"

// Clears the active user session on logout. Local SQLite data is preserved
// so it's available immediately on the next login without a re-sync.
export async function wipeDatabaseForLogout(): Promise<void> {
  setActiveUserId(null)
}
