jest.mock("../../app/services/observability/sentry", () => ({
  reportError: jest.fn(),
}))

let recordApiFailure: typeof import("../../app/services/sync/syncTelemetry").recordApiFailure
let getSyncTelemetry: typeof import("../../app/services/sync/syncTelemetry").getSyncTelemetry
let reportError: jest.Mock

describe("syncTelemetry.recordApiFailure", () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    const mod = require("../../app/services/sync/syncTelemetry")
    recordApiFailure = mod.recordApiFailure
    getSyncTelemetry = mod.getSyncTelemetry
    reportError = require("../../app/services/observability/sentry").reportError as jest.Mock
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("records every failure in a capped ring (newest first)", () => {
    for (let i = 0; i < 15; i++) {
      recordApiFailure({
        at: Date.now() + i,
        method: "GET",
        path: `/views/home?date=${i}`,
        kind: "timeout",
        message: `err-${i}`,
      })
    }
    const tel = getSyncTelemetry()
    expect(tel.apiFailures.length).toBeLessThanOrEqual(10)
    expect(tel.apiFailures[0].message).toBe("err-14")
    expect(tel.apiFailures[0].path).toBe("/views/home?date=14")
  })

  it("always logs to console.warn", () => {
    recordApiFailure({
      at: Date.now(),
      method: "POST",
      path: "/pipeline/run",
      kind: "timeout",
      message: "Request timed out after 45s: POST /pipeline/run",
    })
    expect(warnSpy).toHaveBeenCalled()
  })

  it("debounces sentry reports to at most once per minute", () => {
    recordApiFailure({
      at: Date.now(),
      method: "GET",
      path: "/views/home",
      kind: "timeout",
      message: "first",
    })
    for (let i = 0; i < 5; i++) {
      recordApiFailure({
        at: Date.now(),
        method: "GET",
        path: "/views/home",
        kind: "timeout",
        message: `noise-${i}`,
      })
    }
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it("records network and server failures, not just timeouts", () => {
    recordApiFailure({
      at: Date.now(),
      method: "POST",
      path: "/pipeline/ingest",
      kind: "network",
      message: "Network request failed",
    })
    recordApiFailure({
      at: Date.now(),
      method: "GET",
      path: "/views/sleep",
      kind: "server",
      message: "500 Internal Server Error",
      status: 500,
    })
    const tel = getSyncTelemetry()
    expect(tel.apiFailures.length).toBe(2)
    expect(tel.apiFailures[0].kind).toBe("server")
    expect(tel.apiFailures[1].kind).toBe("network")
  })
})
