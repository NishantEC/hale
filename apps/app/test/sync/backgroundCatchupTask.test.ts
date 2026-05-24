const definedTask = { handler: null as null | (() => Promise<unknown>) }

jest.mock("expo-task-manager", () => ({
  defineTask: (_name: string, handler: () => Promise<unknown>) => {
    definedTask.handler = handler
  },
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
}))

const Result = {
  Success: "Success" as const,
  Failed: "Failed" as const,
}

jest.mock("expo-background-task", () => ({
  defineTask: jest.fn(),
  BackgroundTaskResult: Result,
  BackgroundTaskStatus: { Restricted: "Restricted" },
  getStatusAsync: jest.fn(() => Promise.resolve("Available")),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
}))

const mockRunBackgroundDrain = jest.fn()
jest.mock("../../app/services/sync/backgroundSync", () => ({
  runBackgroundDrain: (...args: unknown[]) => mockRunBackgroundDrain(...args),
}))

describe("backgroundCatchupTask", () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    definedTask.handler = null
    mockRunBackgroundDrain.mockReset()
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    require("../../app/services/sync/backgroundCatchupTask")
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("returns Success when there is no auth session (don't punish the app for idle)", async () => {
    mockRunBackgroundDrain.mockResolvedValueOnce({ status: "no-session" })
    const result = await definedTask.handler!()
    expect(result).toBe(Result.Success)
  })

  it("returns Success after a drain that ran with POST errors", async () => {
    mockRunBackgroundDrain.mockResolvedValueOnce({
      status: "drained",
      outcome: {
        drained: 0,
        failed: 5,
        durationMs: 500,
        oldestPendingAt: null,
        skipped: null,
        error: "500 server error",
      },
    })
    const result = await definedTask.handler!()
    expect(result).toBe(Result.Success)
  })

  it("returns Failed only when runBackgroundDrain throws", async () => {
    mockRunBackgroundDrain.mockRejectedValueOnce(new Error("db open exploded"))
    const result = await definedTask.handler!()
    expect(result).toBe(Result.Failed)
  })
})
