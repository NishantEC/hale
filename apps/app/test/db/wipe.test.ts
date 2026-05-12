import { wipeDatabaseForLogout } from "../../app/services/db/wipe"
import { setActiveUserId, peekActiveUserId } from "../../app/services/db/session"

describe("wipeDatabaseForLogout", () => {
  it("clears the active user session without wiping the local database", async () => {
    // Local SQLite data is preserved across logout so it's available
    // immediately on next login without a re-sync. See wipe.ts.
    setActiveUserId("u")
    await wipeDatabaseForLogout()
    expect(peekActiveUserId()).toBeNull()
  })
})
