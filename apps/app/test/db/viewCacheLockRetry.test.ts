import { setViewCache } from "../../app/services/db/repositories/viewCache"
import { setActiveUserId } from "../../app/services/db/session"

function makeDb(results: Array<"ok" | Error>) {
  const onConflictDoUpdate = jest.fn(() => {
    const result = results.shift()
    if (result instanceof Error) return Promise.reject(result)
    return Promise.resolve()
  })
  const values = jest.fn(() => ({ onConflictDoUpdate }))
  const insert = jest.fn(() => ({ values }))

  return {
    db: { insert },
    insert,
    values,
    onConflictDoUpdate,
  }
}

describe("viewCache lock retry", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setActiveUserId("user-1")
  })

  afterEach(() => {
    jest.useRealTimers()
    setActiveUserId(null)
  })

  it("retries cache upserts when SQLite is temporarily locked", async () => {
    const locked = new Error("SQLiteErrorException: Error code 5: database is locked")
    const { db, insert, onConflictDoUpdate } = makeDb([locked, "ok"])

    const promise = setViewCache(db as never, "home", "2026-05-12", { ok: true })
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(50)
    await promise

    expect(insert).toHaveBeenCalledTimes(2)
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2)
  })
})
