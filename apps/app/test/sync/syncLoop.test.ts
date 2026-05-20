import { decideContinueSync } from "@/services/sync/syncLoop"

const baseInput = {
  iterationRecords: 100,
  prevNewestMs: 1_700_000_000_000,
  currentNewestMs: 1_700_000_300_000,
  stuckCount: 0,
  iterations: 1,
  nowMs: 1_700_010_000_000,
  caughtUpWindowMs: 5 * 60_000,
}

describe("decideContinueSync", () => {
  test("stops when iteration yielded zero records", () => {
    const d = decideContinueSync({ ...baseInput, iterationRecords: 0 })
    expect(d.stop).toBe(true)
    expect(d.reason).toBe("no_records")
  })

  test("stops when cursor is within caught-up window of now", () => {
    const now = 1_700_000_000_000
    const d = decideContinueSync({
      ...baseInput,
      iterationRecords: 50,
      currentNewestMs: now - 60_000,
      nowMs: now,
    })
    expect(d.stop).toBe(true)
    expect(d.reason).toBe("caught_up")
  })

  test("continues when cursor is behind the caught-up window", () => {
    const now = 1_700_000_000_000
    const d = decideContinueSync({
      ...baseInput,
      iterationRecords: 50,
      currentNewestMs: now - 60 * 60_000,
      nowMs: now,
    })
    expect(d.stop).toBe(false)
    expect(d.reason).toBe("continue")
  })

  test("marks stuck-this-iteration when cursor didn't advance", () => {
    const d = decideContinueSync({
      ...baseInput,
      prevNewestMs: 1_700_000_500_000,
      currentNewestMs: 1_700_000_500_000,
    })
    expect(d.stuckThisIteration).toBe(true)
  })

  test("does NOT stop on first stuck iteration", () => {
    const d = decideContinueSync({
      ...baseInput,
      prevNewestMs: 1_700_000_500_000,
      currentNewestMs: 1_700_000_500_000,
      stuckCount: 0,
    })
    expect(d.stop).toBe(false)
  })

  test("stops on second consecutive stuck iteration", () => {
    const d = decideContinueSync({
      ...baseInput,
      prevNewestMs: 1_700_000_500_000,
      currentNewestMs: 1_700_000_500_000,
      stuckCount: 1,
    })
    expect(d.stop).toBe(true)
    expect(d.reason).toBe("stuck_cursor")
  })

  test("continues past 20 iterations (iter_cap removed; stuck_cursor is the safety net)", () => {
    const d = decideContinueSync({ ...baseInput, iterations: 50 })
    expect(d.stop).toBe(false)
    expect(d.reason).toBe("continue")
  })

  test("first iteration with null prevNewestMs is not stuck", () => {
    const d = decideContinueSync({
      ...baseInput,
      prevNewestMs: null,
      currentNewestMs: 1_700_000_500_000,
    })
    expect(d.stuckThisIteration).toBe(false)
    expect(d.stop).toBe(false)
  })

  test("zero-records rule fires before caught-up rule", () => {
    const now = 1_700_000_000_000
    const d = decideContinueSync({
      ...baseInput,
      iterationRecords: 0,
      currentNewestMs: now - 60_000,
      nowMs: now,
    })
    expect(d.reason).toBe("no_records")
  })
})
