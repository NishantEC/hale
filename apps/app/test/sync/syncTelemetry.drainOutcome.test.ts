jest.mock("../../app/services/observability/sentry", () => ({
  reportError: jest.fn(),
}))

let recordDrainOutcome: typeof import("../../app/services/sync/syncTelemetry").recordDrainOutcome
let getSyncTelemetry: typeof import("../../app/services/sync/syncTelemetry").getSyncTelemetry

describe("syncTelemetry.recordDrainOutcome", () => {
  beforeEach(() => {
    jest.resetModules()
    const mod = require("../../app/services/sync/syncTelemetry")
    recordDrainOutcome = mod.recordDrainOutcome
    getSyncTelemetry = mod.getSyncTelemetry
  })

  it("appends successful drains to history", () => {
    recordDrainOutcome({
      at: 1000,
      durationMs: 50,
      drained: 5,
      failed: 0,
      oldestPendingAt: null,
      skipped: null,
      error: null,
    })
    recordDrainOutcome({
      at: 2000,
      durationMs: 60,
      drained: 3,
      failed: 0,
      oldestPendingAt: null,
      skipped: null,
      error: null,
    })
    expect(getSyncTelemetry().drainHistory).toHaveLength(2)
  })

  it("dedups adjacent skipped:locked entries instead of growing the ring", () => {
    for (let i = 0; i < 50; i++) {
      recordDrainOutcome({
        at: 1000 + i * 15_000,
        durationMs: 0,
        drained: 0,
        failed: 0,
        oldestPendingAt: null,
        skipped: "locked",
        error: null,
      })
    }
    const hist = getSyncTelemetry().drainHistory
    expect(hist).toHaveLength(1)
    expect(hist[0].skipped).toBe("locked")
    expect(hist[0].at).toBe(1000 + 49 * 15_000)
  })

  it("a non-locked drain breaks the dedup run and is recorded normally", () => {
    recordDrainOutcome({
      at: 1000, durationMs: 0, drained: 0, failed: 0,
      oldestPendingAt: null, skipped: "locked", error: null,
    })
    recordDrainOutcome({
      at: 2000, durationMs: 0, drained: 0, failed: 0,
      oldestPendingAt: null, skipped: "locked", error: null,
    })
    recordDrainOutcome({
      at: 3000, durationMs: 100, drained: 5, failed: 0,
      oldestPendingAt: null, skipped: null, error: null,
    })
    recordDrainOutcome({
      at: 4000, durationMs: 0, drained: 0, failed: 0,
      oldestPendingAt: null, skipped: "locked", error: null,
    })
    const hist = getSyncTelemetry().drainHistory
    expect(hist).toHaveLength(3)
    expect(hist.map((r) => r.skipped)).toEqual(["locked", null, "locked"])
  })
})
