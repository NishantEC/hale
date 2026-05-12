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

  it("rethrows after exhausting all bounded retries", async () => {
    const locked = new Error("SQLiteErrorException: Error code 5: database is locked")
    // 4 attempts total: 1 initial + 3 retries at 50/150/300ms.
    const { db, onConflictDoUpdate } = makeDb([locked, locked, locked, locked])

    const promise = setViewCache(db as never, "home", "2026-05-12", { ok: true }).catch(
      (err) => err,
    )
    // Drain retry delays.
    await jest.advanceTimersByTimeAsync(50)
    await jest.advanceTimersByTimeAsync(150)
    await jest.advanceTimersByTimeAsync(300)
    const result = await promise

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(4)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/database is locked/)
  })

  it("does not retry non-lock errors and propagates immediately", async () => {
    const fatal = new Error("UNIQUE constraint failed: view_cache.viewName")
    const { db, onConflictDoUpdate } = makeDb([fatal, "ok"])

    const result = await setViewCache(db as never, "home", "2026-05-12", { ok: true }).catch(
      (err) => err,
    )

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/UNIQUE constraint/)
  })

  it("does not match 'Error code 50' as code 5", async () => {
    const wrongCode = new Error("Error code 50: something else")
    const { db, onConflictDoUpdate } = makeDb([wrongCode, "ok"])

    const result = await setViewCache(db as never, "home", "2026-05-12", { ok: true }).catch(
      (err) => err,
    )

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
    expect(result).toBeInstanceOf(Error)
  })
})
