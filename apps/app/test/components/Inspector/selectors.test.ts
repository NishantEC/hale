import {
  strapChipState,
  phoneChipState,
  backendChipState,
  coverageChipState,
} from "@/components/Inspector/selectors"

describe("strapChipState", () => {
  test("ready + on wrist → green / 'on wrist · 38%'", () => {
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 38,
        lastStreamAt: Date.now(),
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "green", sub: "on wrist · 38%" })
  })

  test("ready + off wrist → green / 'off wrist · 38%'", () => {
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: false,
        batteryLevel: 38,
        lastStreamAt: Date.now(),
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "green", sub: "off wrist · 38%" })
  })

  test("connecting → amber / '—'", () => {
    expect(
      strapChipState({
        connectionState: "connecting",
        isWorn: false,
        batteryLevel: null,
        lastStreamAt: null,
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "amber", sub: "—" })
  })

  test("disconnected → red / '—'", () => {
    expect(
      strapChipState({
        connectionState: "disconnected",
        isWorn: false,
        batteryLevel: null,
        lastStreamAt: null,
        backlogChunks: 0,
        nowMs: Date.now(),
      }),
    ).toEqual({ dot: "red", sub: "—" })
  })

  test("ready + stream silent >3min → 'stream silent'", () => {
    const now = 10_000_000
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 50,
        lastStreamAt: now - 200_000,
        backlogChunks: 0,
        nowMs: now,
      }),
    ).toEqual({ dot: "green", sub: "stream silent" })
  })

  test("ready + backlog pending → 'backlog · 22 chunks'", () => {
    const now = 10_000_000
    expect(
      strapChipState({
        connectionState: "ready",
        isWorn: true,
        batteryLevel: 50,
        lastStreamAt: now,
        backlogChunks: 22,
        nowMs: now,
      }),
    ).toEqual({ dot: "green", sub: "backlog · 22 chunks" })
  })
})

describe("phoneChipState", () => {
  const base = {
    daemonRunning: true,
    lastTickAt: 10_000_000,
    daemonTicks: 38,
    nowMs: 10_000_000,
    appErrorsLast5min: 0,
  }
  test("running + fresh tick → green / 'daemon · 38 ticks'", () => {
    expect(phoneChipState(base)).toEqual({ dot: "green", sub: "daemon · 38 ticks" })
  })
  test("running + stale tick → amber", () => {
    expect(
      phoneChipState({ ...base, lastTickAt: 10_000_000 - 120_000 }),
    ).toEqual({ dot: "amber", sub: "daemon · 38 ticks" })
  })
  test("stopped → amber / 'daemon stopped'", () => {
    expect(phoneChipState({ ...base, daemonRunning: false })).toEqual({
      dot: "amber",
      sub: "daemon stopped",
    })
  })
  test("app errors → red", () => {
    expect(phoneChipState({ ...base, appErrorsLast5min: 3 })).toEqual({
      dot: "red",
      sub: "daemon · 38 ticks",
    })
  })
})

describe("backendChipState", () => {
  const base = {
    queueDepth: 0,
    queueDead: 0,
    lastSyncAt: 10_000_000,
    consecutiveApiFailures: 0,
    nowMs: 10_000_000,
  }
  test("clean → green / 'synced 0m ago'", () => {
    expect(backendChipState(base)).toEqual({ dot: "green", sub: "synced 0m ago" })
  })
  test("pending only → amber", () => {
    expect(backendChipState({ ...base, queueDepth: 3 })).toEqual({
      dot: "amber",
      sub: "3 pending · 0 dead",
    })
  })
  test("dead items → amber", () => {
    expect(backendChipState({ ...base, queueDead: 2 })).toEqual({
      dot: "amber",
      sub: "0 pending · 2 dead",
    })
  })
  test("2+ api failures → red", () => {
    expect(backendChipState({ ...base, consecutiveApiFailures: 2 })).toEqual({
      dot: "red",
      sub: "synced 0m ago",
    })
  })
  test("last sync > 1h → red", () => {
    expect(
      backendChipState({ ...base, lastSyncAt: 10_000_000 - 4_000_000 }),
    ).toEqual({ dot: "red", sub: "synced 67m ago" })
  })
})

describe("coverageChipState", () => {
  test("≥80% → green", () => {
    expect(coverageChipState({ percent: 85 })).toEqual({ color: "green", percent: 85 })
  })
  test("50–79% → amber", () => {
    expect(coverageChipState({ percent: 65 })).toEqual({ color: "amber", percent: 65 })
  })
  test("<50% → red", () => {
    expect(coverageChipState({ percent: 18 })).toEqual({ color: "red", percent: 18 })
  })
})
