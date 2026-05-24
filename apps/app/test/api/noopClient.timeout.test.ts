import { apiPost, runPipeline } from "../../app/services/api/noopClient"

describe("noopClient request timeout", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest
      .spyOn(global, "fetch")
      .mockImplementation(() => new Promise(() => undefined) as Promise<Response>)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("rejects when fetch never settles even if AbortController is ignored", async () => {
    let outcome: string | null = null

    void apiPost("/pipeline/ingest-table", { tableName: "raw_sensor_records", rows: [] }).then(
      () => {
        outcome = "resolved"
      },
      (err: Error) => {
        outcome = err.message
      },
    )

    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(30_000)

    expect(outcome).toMatch(/^Request timed out after 30s:/)
  })

  it("gives backend pipeline runs a longer overall budget than a single request", async () => {
    // runPipeline = enqueue (fast) + awaitPipelineRun (300s deadline).
    // First call (enqueue POST) returns a runId immediately. All later
    // calls (poll GETs) return a non-terminal "running" status quickly
    // so the polling loop can iterate against wall-clock without
    // burning REQUEST_TIMEOUT_MS per poll. The whole promise must
    // outlive REQUEST_TIMEOUT_MS (30s) and reject only at the polling
    // deadline (PIPELINE_TIMEOUT_MS = 300s).
    ;(global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "test-run",
              status: "queued",
              startedAt: new Date().toISOString(),
              deduped: false,
            }),
            { status: 202, headers: { "content-type": "application/json" } },
          ),
        ) as Promise<Response>,
    )
    ;(global.fetch as jest.Mock).mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              runId: "test-run",
              status: "running",
              startedAt: new Date().toISOString(),
              completedAt: null,
              error: null,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ) as Promise<Response>,
    )

    let outcome: string | null = null
    void runPipeline().then(
      () => {
        outcome = "resolved"
      },
      (err: Error) => {
        outcome = err.message
      },
    )

    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(30_000)
    expect(outcome).toBeNull()

    await jest.advanceTimersByTimeAsync(120_000)
    expect(outcome).toBeNull()

    await jest.advanceTimersByTimeAsync(160_000)
    expect(outcome).toMatch(/did not finish within 300s/)
  })
})
