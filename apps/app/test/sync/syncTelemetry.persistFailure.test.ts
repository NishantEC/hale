// Mock the sentry module so we can count captureException calls.
jest.mock("../../app/services/observability/sentry", () => ({
  reportError: jest.fn(),
}))

let recordPersistFailure: typeof import("../../app/services/sync/syncTelemetry").recordPersistFailure
let getSyncTelemetry: typeof import("../../app/services/sync/syncTelemetry").getSyncTelemetry
let reportError: jest.Mock

describe("syncTelemetry.recordPersistFailure", () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    // Re-import each test so the module-level debounce state resets.
    jest.resetModules()
    jest.clearAllMocks()
    const mod = require("../../app/services/sync/syncTelemetry")
    recordPersistFailure = mod.recordPersistFailure
    getSyncTelemetry = mod.getSyncTelemetry
    reportError = require("../../app/services/observability/sentry").reportError as jest.Mock
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("records every failure in the in-memory ring", () => {
    for (let i = 0; i < 15; i++) {
      recordPersistFailure({
        at: Date.now() + i,
        source: "persistAndAck",
        trimValue: i,
        batchSize: 51,
        message: `err-${i}`,
      })
    }
    const tel = getSyncTelemetry()
    // Capped at 10 most recent
    expect(tel.persistFailures.length).toBeLessThanOrEqual(10)
    expect(tel.persistFailures[0].message).toBe("err-14")
  })

  it("always logs to console.warn", () => {
    recordPersistFailure({
      at: Date.now(),
      source: "persistAndAck",
      trimValue: 100,
      batchSize: 51,
      message: "kaboom",
    })
    expect(warnSpy).toHaveBeenCalled()
  })

  it("debounces sentry reports to at most once per minute", () => {
    // First call should fire reportError
    recordPersistFailure({
      at: Date.now(),
      source: "persistAndAck",
      trimValue: 1,
      batchSize: 51,
      message: "first",
    })
    // Several subsequent failures within the minute should not re-fire
    for (let i = 0; i < 5; i++) {
      recordPersistFailure({
        at: Date.now(),
        source: "persistAndAck",
        trimValue: i,
        batchSize: 51,
        message: `noise-${i}`,
      })
    }
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})
