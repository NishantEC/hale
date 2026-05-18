import {
  AccessoryState,
  AccessorySnapshot,
  deriveCandidate,
  ACCESSORY_METADATA,
} from "../../../app/components/ActivityStrip/states"

function snap(overrides: Partial<AccessorySnapshot> = {}): AccessorySnapshot {
  return {
    bleError: null,
    syncError: null,
    pipelineState: "idle",
    deadCount: 0,
    connectionState: "disconnected",
    wasWornRecently: false,
    disconnectedAt: null,
    lastSyncAt: null,
    isAppUpdateAvailable: false,
    isLowPowerMode: false,
    isOnline: true,
    pendingCount: 0,
    bleIsSyncing: false,
    syncStage: null,
    syncProgress: null,
    syncIteration: null,
    syncIterationCap: null,
    queueIsSyncing: false,
    syncSummary: null,
    batteryLevel: null,
    isCharging: false,
    strapAlarmArmed: false,
    strapAlarmAt: null,
    now: 1_800_000_000_000,
    ...overrides,
  }
}

describe("deriveCandidate", () => {
  it("returns idle for an empty snapshot", () => {
    expect(deriveCandidate(snap())).toBe<AccessoryState>("idle")
  })

  it("alarm_firing beats every other signal", () => {
    expect(
      deriveCandidate(
        snap({
          strapAlarmArmed: true,
          strapAlarmAt: 1_800_000_000_000 - 1000,
          bleError: "boom",
          syncError: "boom",
          deadCount: 5,
        }),
      ),
    ).toBe<AccessoryState>("alarm_firing")
  })

  it("ble_error beats sync_error", () => {
    expect(
      deriveCandidate(snap({ bleError: "x", syncError: "y" })),
    ).toBe<AccessoryState>("ble_error")
  })

  it("sync_error fires when pipelineState is failed", () => {
    expect(deriveCandidate(snap({ pipelineState: "failed" }))).toBe<AccessoryState>("sync_error")
  })

  it("dead_letters when deadCount > 0", () => {
    expect(deriveCandidate(snap({ deadCount: 3 }))).toBe<AccessoryState>("dead_letters")
  })

  it("disconnected_was_worn requires worn-recently AND > 90s", () => {
    const now = 1_800_000_000_000
    expect(
      deriveCandidate(
        snap({
          now,
          connectionState: "disconnected",
          wasWornRecently: true,
          disconnectedAt: now - 95_000,
        }),
      ),
    ).toBe<AccessoryState>("disconnected_was_worn")

    expect(
      deriveCandidate(
        snap({
          now,
          connectionState: "disconnected",
          wasWornRecently: true,
          disconnectedAt: now - 30_000,
        }),
      ),
    ).toBe<AccessoryState>("idle")
  })

  it("stale_sync when ready and last sync > 24h ago", () => {
    const now = 1_800_000_000_000
    expect(
      deriveCandidate(
        snap({
          now,
          connectionState: "ready",
          lastSyncAt: now - 25 * 60 * 60 * 1000,
        }),
      ),
    ).toBe<AccessoryState>("stale_sync")
  })

  it("app_update", () => {
    expect(deriveCandidate(snap({ isAppUpdateAvailable: true }))).toBe<AccessoryState>("app_update")
  })

  it("low_power_paused requires LPM AND pending > 0", () => {
    expect(
      deriveCandidate(snap({ isLowPowerMode: true, pendingCount: 5 })),
    ).toBe<AccessoryState>("low_power_paused")
    expect(deriveCandidate(snap({ isLowPowerMode: true }))).toBe<AccessoryState>("idle")
  })

  it("ble_connecting", () => {
    expect(deriveCandidate(snap({ connectionState: "scanning" }))).toBe<AccessoryState>(
      "ble_connecting",
    )
    expect(deriveCandidate(snap({ connectionState: "connecting" }))).toBe<AccessoryState>(
      "ble_connecting",
    )
    expect(deriveCandidate(snap({ connectionState: "discovering" }))).toBe<AccessoryState>(
      "ble_connecting",
    )
  })

  it("ble_syncing requires ready", () => {
    expect(
      deriveCandidate(snap({ connectionState: "ready", bleIsSyncing: true })),
    ).toBe<AccessoryState>("ble_syncing")
    expect(
      deriveCandidate(snap({ connectionState: "disconnected", bleIsSyncing: true })),
    ).toBe<AccessoryState>("idle")
  })

  it("pipeline_running", () => {
    expect(deriveCandidate(snap({ pipelineState: "running" }))).toBe<AccessoryState>(
      "pipeline_running",
    )
  })

  it("upload_draining requires queue syncing AND pending > 0", () => {
    expect(
      deriveCandidate(snap({ queueIsSyncing: true, pendingCount: 1 })),
    ).toBe<AccessoryState>("upload_draining")
    expect(deriveCandidate(snap({ queueIsSyncing: true }))).toBe<AccessoryState>("idle")
  })

  it("offline_with_backlog", () => {
    expect(
      deriveCandidate(snap({ isOnline: false, pendingCount: 5 })),
    ).toBe<AccessoryState>("offline_with_backlog")
    expect(deriveCandidate(snap({ isOnline: false }))).toBe<AccessoryState>("idle")
  })

  it("battery_low under 20 and not charging", () => {
    expect(deriveCandidate(snap({ batteryLevel: 15, isCharging: false }))).toBe<AccessoryState>(
      "battery_low",
    )
    expect(deriveCandidate(snap({ batteryLevel: 15, isCharging: true }))).toBe<AccessoryState>(
      "idle",
    )
    expect(deriveCandidate(snap({ batteryLevel: 25 }))).toBe<AccessoryState>("idle")
  })

  it("alarm_armed_soon when alarm < 1h away", () => {
    const now = 1_800_000_000_000
    expect(
      deriveCandidate(
        snap({ now, strapAlarmArmed: true, strapAlarmAt: now + 30 * 60 * 1000 }),
      ),
    ).toBe<AccessoryState>("alarm_armed_soon")
    expect(
      deriveCandidate(
        snap({ now, strapAlarmArmed: true, strapAlarmAt: now + 2 * 60 * 60 * 1000 }),
      ),
    ).toBe<AccessoryState>("idle")
  })

  it("ACCESSORY_METADATA has an entry for every non-idle state", () => {
    const states: AccessoryState[] = [
      "alarm_firing",
      "ble_error",
      "sync_error",
      "dead_letters",
      "disconnected_was_worn",
      "stale_sync",
      "app_update",
      "low_power_paused",
      "ble_connecting",
      "ble_syncing",
      "pipeline_running",
      "upload_draining",
      "synced_confirm",
      "offline_with_backlog",
      "battery_low",
      "alarm_armed_soon",
    ]
    for (const s of states) {
      expect(ACCESSORY_METADATA[s as Exclude<AccessoryState, "idle">]).toBeDefined()
      expect(ACCESSORY_METADATA[s as Exclude<AccessoryState, "idle">].priority).toBeGreaterThan(0)
      expect(typeof ACCESSORY_METADATA[s as Exclude<AccessoryState, "idle">].icon).toBe("string")
    }
  })
})
