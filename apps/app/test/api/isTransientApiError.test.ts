import { ApiError, isTransientApiError } from "../../app/services/api/noopClient"

describe("isTransientApiError", () => {
  it("treats network/timeout (status 0) as transient", () => {
    expect(isTransientApiError(new ApiError(0, "timeout"))).toBe(true)
  })

  it("treats 5xx as transient", () => {
    expect(isTransientApiError(new ApiError(500, "ise"))).toBe(true)
    expect(isTransientApiError(new ApiError(502, "bg"))).toBe(true)
    expect(isTransientApiError(new ApiError(503, "unavail"))).toBe(true)
  })

  // The bug this row guards against: a token rotating mid-drain used to
  // 401 every in-flight POST, and isTransientApiError used to classify
  // 401 as permanent — instantly dead-lettering the entire batch.
  it("treats 401 as transient so a stale token doesn't dead-letter user data", () => {
    expect(isTransientApiError(new ApiError(401, "unauth"))).toBe(true)
  })

  it("treats 408 / 425 / 429 as transient", () => {
    expect(isTransientApiError(new ApiError(408, "timeout"))).toBe(true)
    expect(isTransientApiError(new ApiError(425, "too early"))).toBe(true)
    expect(isTransientApiError(new ApiError(429, "rate"))).toBe(true)
  })

  it("treats other 4xx as permanent", () => {
    expect(isTransientApiError(new ApiError(400, "bad"))).toBe(false)
    expect(isTransientApiError(new ApiError(403, "forbidden"))).toBe(false)
    expect(isTransientApiError(new ApiError(404, "missing"))).toBe(false)
    expect(isTransientApiError(new ApiError(422, "unprocessable"))).toBe(false)
  })

  it("treats unknown error shapes as transient (fail-safe retry)", () => {
    expect(isTransientApiError(new Error("???"))).toBe(true)
    expect(isTransientApiError("string error")).toBe(true)
    expect(isTransientApiError(null)).toBe(true)
  })
})
