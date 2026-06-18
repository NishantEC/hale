import TestRenderer, { act } from "react-test-renderer"

import { SyncProvider, useSyncContext } from "../../app/context/SyncContext"

// Serverless: SyncContext no longer drains an outbound queue or pulls a
// downlink — there is no server. The assertions below verify the provider
// stays inert (no syncing, empty queue, refresh is a no-op).


jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ isInternetReachable: true })),
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

jest.mock("@/services/db", () => ({
  openDatabase: jest.fn(() => ({})),
}))

jest.mock("@/services/db/repositories/settings", () => ({
  DEFAULT_RAW_RETENTION_DAYS: 14,
  SETTING_RAW_RETENTION_DAYS: "rawRetentionDays",
  getSetting: jest.fn(() => Promise.resolve("14")),
}))

jest.mock("@/services/sync/retentionSweeper", () => ({
  sweepRetention: jest.fn(() => Promise.resolve()),
}))

interface SyncSnapshot {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  deadCount: number
  lastDeadLetterError: string | null
  syncError: string | null
}

let snapshot: SyncSnapshot | null = null
let refreshFn: (() => Promise<void>) | null = null

function Probe() {
  const ctx = useSyncContext()
  snapshot = {
    isOnline: ctx.isOnline,
    isSyncing: ctx.isSyncing,
    pendingCount: ctx.pendingCount,
    deadCount: ctx.deadCount,
    lastDeadLetterError: ctx.lastDeadLetterError,
    syncError: ctx.syncError,
  }
  refreshFn = ctx.refresh
  return null
}

describe("SyncContext (serverless)", () => {
  jest.useFakeTimers()

  beforeEach(() => {
    snapshot = null
    refreshFn = null
    jest.clearAllTimers()
  })

  async function mount(): Promise<TestRenderer.ReactTestRenderer> {
    let renderer: TestRenderer.ReactTestRenderer | null = null
    await act(async () => {
      renderer = TestRenderer.create(
        <SyncProvider isDbReady>
          <Probe />
        </SyncProvider>,
      )
      await Promise.resolve()
    })
    if (!renderer) throw new Error("renderer not created")
    return renderer
  }

  it("renders and exposes the initial serverless state", async () => {
    const renderer = await mount()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.isSyncing).toBe(false)
    expect(snapshot?.pendingCount).toBe(0)
    expect(snapshot?.deadCount).toBe(0)
    expect(snapshot?.lastDeadLetterError).toBeNull()
    expect(snapshot?.syncError).toBeNull()
    expect(typeof refreshFn).toBe("function")

    await act(async () => {
      renderer.unmount()
    })
  })

  it("refresh() is a no-op — it never drains, pulls, or changes sync state", async () => {
    const renderer = await mount()


    await act(async () => {
      await refreshFn?.()
    })

    expect(snapshot?.isSyncing).toBe(false)
    expect(snapshot?.syncError).toBeNull()

    await act(async () => {
      renderer.unmount()
    })
  })

  it("the foreground interval no longer triggers a drain loop", async () => {
    const renderer = await mount()


    // Advance well past any historical drain interval (15s) — nothing fires.
    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    expect(snapshot?.isSyncing).toBe(false)
    expect(snapshot?.syncError).toBeNull()

    await act(async () => {
      renderer.unmount()
    })
  })
})
