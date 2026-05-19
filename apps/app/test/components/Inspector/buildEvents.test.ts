import { buildEvents } from "@/components/Inspector/EventsCard"

describe("buildEvents", () => {
  test("warn rows precede ok rows, both newest first, capped at 10", () => {
    const events = buildEvents({
      apiFailures: [
        {
          at: 100,
          method: "POST",
          path: "/a",
          kind: "timeout",
          message: "",
          status: null,
        },
        {
          at: 50,
          method: "POST",
          path: "/b",
          kind: "server",
          message: "",
          status: 500,
        },
      ],
      detectedGaps: [
        { detectedAt: 80, fromMs: 0, toMs: 8_940_000, durationMinutes: 149 },
      ],
      syncSessions: [
        {
          startedAt: 90,
          durationMs: 1000,
          iterations: 2,
          stopReason: "caught_up",
          oldestBatchMs: null,
          newestBatchMs: null,
          recordsPulled: 72,
          error: null,
        },
      ],
      lastPipelineRunAt: 70,
      lastPipelineDurationMs: 1_078_000,
      daemonRunning: false,
      lastTickAt: 60,
      nowMs: 1000,
    })
    expect(events.map((e) => e.tone)).toEqual(["warn", "warn", "warn", "ok", "ok"])
    expect(events[0].title).toContain("POST /a")
  })
})
