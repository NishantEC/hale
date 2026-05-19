import { shouldRunPipelineAfterSync } from "@/services/sync/pipelineTrigger"

describe("shouldRunPipelineAfterSync", () => {
  test("returns false when no records were persisted", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 0,
        isCurrentlyRunning: false,
        msSinceLastRun: 999_999,
      }),
    ).toBe(false)
  })

  test("returns false when a pipeline run is already in flight", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 10_000,
        isCurrentlyRunning: true,
        msSinceLastRun: 999_999,
      }),
    ).toBe(false)
  })

  test("returns true for a large batch even if last run was recent", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 5_000,
        isCurrentlyRunning: false,
        msSinceLastRun: 1_000,
        significantThreshold: 500,
      }),
    ).toBe(true)
  })

  test("throttles small frequent batches", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 50,
        isCurrentlyRunning: false,
        msSinceLastRun: 10_000,
        significantThreshold: 500,
        throttleMs: 60_000,
      }),
    ).toBe(false)
  })

  test("runs small batch once enough time has passed", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 50,
        isCurrentlyRunning: false,
        msSinceLastRun: 120_000,
        significantThreshold: 500,
        throttleMs: 60_000,
      }),
    ).toBe(true)
  })

  test("first run always proceeds (msSinceLastRun = Infinity)", () => {
    expect(
      shouldRunPipelineAfterSync({
        persistedCount: 10,
        isCurrentlyRunning: false,
        msSinceLastRun: Number.POSITIVE_INFINITY,
      }),
    ).toBe(true)
  })
})
