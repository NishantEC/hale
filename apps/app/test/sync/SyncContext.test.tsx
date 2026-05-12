import TestRenderer, { act } from "react-test-renderer"

import { SyncProvider, useSyncContext } from "../../app/context/SyncContext"

const mockDrainLoop = jest.fn()
const mockPullDownlink = jest.fn()
const mockQueueDepth = jest.fn()
const mockListDeadLetters = jest.fn()
const mockApiGet = jest.fn()
const mockApiPost = jest.fn()

let resolveNetworkState: ((state: { isInternetReachable: boolean | null }) => void) | null = null

jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(
    () =>
      new Promise((resolve) => {
        resolveNetworkState = resolve
      }),
  ),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock("expo-battery", () => ({
  isLowPowerModeEnabledAsync: jest.fn(() => Promise.resolve(false)),
  addLowPowerModeListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock("expo-updates", () => ({
  checkForUpdateAsync: jest.fn(() => Promise.resolve({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(() => Promise.resolve()),
}))

jest.mock("@/services/db/session", () => ({
  peekActiveUserId: jest.fn(() => "user-1"),
}))

jest.mock("@/services/db", () => ({
  openDatabase: jest.fn(() => ({})),
}))

jest.mock("@/services/api/noopClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}))

jest.mock("@/services/sync/downlinkPuller", () => ({
  pullDownlink: (...args: unknown[]) => mockPullDownlink(...args),
}))

jest.mock("@/services/sync/uplinkDrainer", () => ({
  drainLoop: (...args: unknown[]) => mockDrainLoop(...args),
}))

jest.mock("@/services/sync/backgroundSync", () => ({
  runBackgroundDrain: jest.fn(() => Promise.resolve({ ok: true, drained: 0 })),
}))

jest.mock("@/services/sync/backgroundCatchupTask", () => ({
  registerBackgroundCatchupTask: jest.fn(() => Promise.resolve()),
}))

jest.mock("@/services/db/repositories/settings", () => ({
  DEFAULT_RAW_RETENTION_DAYS: 14,
  SETTING_RAW_RETENTION_DAYS: "rawRetentionDays",
  getSetting: jest.fn(() => Promise.resolve("14")),
}))

jest.mock("@/services/db/repositories/viewCache", () => ({
  setViewCache: jest.fn(() => Promise.resolve()),
}))

jest.mock("@/services/db/repositories/outboundQueue", () => ({
  queueDepth: (...args: unknown[]) => mockQueueDepth(...args),
  listDeadLetters: (...args: unknown[]) => mockListDeadLetters(...args),
}))

describe("SyncContext", () => {
  jest.useFakeTimers()

  beforeEach(() => {
    mockDrainLoop.mockResolvedValue({ drained: 1 })
    mockPullDownlink.mockResolvedValue(undefined)
    mockQueueDepth.mockResolvedValue(0)
    mockListDeadLetters.mockResolvedValue([])
    mockApiGet.mockResolvedValue({})
    mockApiPost.mockResolvedValue({})
    resolveNetworkState = null
    jest.clearAllTimers()
  })

  it("does not permanently lock draining when the startup interval fires before network state resolves", async () => {
    function Probe() {
      useSyncContext()
      return null
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null

    await act(async () => {
      renderer = TestRenderer.create(
        <SyncProvider isDbReady>
          <Probe />
        </SyncProvider>,
      )
      await Promise.resolve()
    })

    await act(async () => {
      jest.advanceTimersByTime(15_000)
      await Promise.resolve()
    })

    expect(mockDrainLoop).not.toHaveBeenCalled()

    await act(async () => {
      resolveNetworkState?.({ isInternetReachable: true })
      await Promise.resolve()
    })

    await act(async () => {
      jest.advanceTimersByTime(15_000)
      await Promise.resolve()
    })

    expect(mockDrainLoop).toHaveBeenCalledTimes(1)

    await act(async () => {
      renderer?.unmount()
    })
  })

  it("releases the draining flag in `finally` so subsequent drains can run after a thrown one", async () => {
    // First scheduled drain throws; second should still run, proving the
    // flag was reset in `finally`.
    mockDrainLoop.mockReset()
    mockDrainLoop
      .mockRejectedValueOnce(new Error("first drain failed"))
      .mockResolvedValue({ drained: 0 })

    function Probe() {
      useSyncContext()
      return null
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null

    await act(async () => {
      renderer = TestRenderer.create(
        <SyncProvider isDbReady>
          <Probe />
        </SyncProvider>,
      )
      await Promise.resolve()
    })

    await act(async () => {
      resolveNetworkState?.({ isInternetReachable: true })
      await Promise.resolve()
    })

    // First interval fires and rejects.
    await act(async () => {
      jest.advanceTimersByTime(15_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockDrainLoop).toHaveBeenCalledTimes(1)

    // Second interval fires — if the flag had latched, this would be a no-op.
    await act(async () => {
      jest.advanceTimersByTime(15_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockDrainLoop).toHaveBeenCalledTimes(2)

    await act(async () => {
      renderer?.unmount()
    })
  })
})
