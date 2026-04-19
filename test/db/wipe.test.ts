import { wipeDatabaseForLogout } from "../../app/services/db/wipe"
import * as dbModule from "../../app/services/db"
import { setActiveUserId, peekActiveUserId } from "../../app/services/db/session"

jest.mock("../../app/services/db", () => ({
  wipeDatabase: jest.fn().mockResolvedValue(undefined),
}))

describe("wipeDatabaseForLogout", () => {
  it("calls wipeDatabase and clears active user", async () => {
    setActiveUserId("u")
    await wipeDatabaseForLogout()
    expect(dbModule.wipeDatabase).toHaveBeenCalled()
    expect(peekActiveUserId()).toBeNull()
  })
})
