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
    await jest.advanceTimersByTimeAsync(20_000)

    expect(outcome).toBe("Request timed out after 20s")
  })

  it("gives backend pipeline runs a longer timeout budget", async () => {
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
    await jest.advanceTimersByTimeAsync(20_000)

    expect(outcome).toBeNull()

    await jest.advanceTimersByTimeAsync(100_000)

    expect(outcome).toBeNull()

    await jest.advanceTimersByTimeAsync(180_000)

    expect(outcome).toBe("Request timed out after 300s")
  })
})
