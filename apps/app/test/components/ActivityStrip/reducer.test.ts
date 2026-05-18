import {
  accessoryReducer,
  initialReducerState,
  ReducerState,
} from "../../../app/components/ActivityStrip/reducer"
import { AccessoryState } from "../../../app/components/ActivityStrip/states"

const t0 = 1_800_000_000_000

function step(state: ReducerState, candidate: AccessoryState, now: number): ReducerState {
  return accessoryReducer(state, { type: "CANDIDATE", candidate, now })
}

describe("accessoryReducer", () => {
  it("starts in idle", () => {
    expect(initialReducerState.displayed).toBe<AccessoryState>("idle")
  })

  it("immediately enters a non-idle candidate from idle", () => {
    const next = step(initialReducerState, "ble_syncing", t0)
    expect(next.displayed).toBe<AccessoryState>("ble_syncing")
    expect(next.enteredAt).toBe(t0)
  })

  it("higher-priority candidate preempts displayed state instantly (no hold)", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    s = step(s, "ble_error", t0 + 200)
    expect(s.displayed).toBe<AccessoryState>("ble_error")
  })

  it("lower-priority candidate must wait for hold time", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    // ble_syncing minHold = 1500ms; upload_draining lower priority
    s = step(s, "upload_draining", t0 + 500)
    expect(s.displayed).toBe<AccessoryState>("ble_syncing")
    s = step(s, "upload_draining", t0 + 2000)
    expect(s.displayed).toBe<AccessoryState>("upload_draining")
  })

  it("idle candidate must wait for hold time", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    s = step(s, "idle", t0 + 500)
    expect(s.displayed).toBe<AccessoryState>("ble_syncing")
    s = step(s, "idle", t0 + 2000)
    expect(s.displayed).toBe<AccessoryState>("idle")
  })

  it("suppresses Y -> X ping-pong within 2 s of leaving X (X was lower priority)", () => {
    // X = upload_draining (low prio), Y = sync_error (high prio)
    let s = step(initialReducerState, "upload_draining", t0)
    s = step(s, "sync_error", t0 + 1100) // pre-empted by higher priority
    expect(s.displayed).toBe<AccessoryState>("sync_error")
    // sync_error error-sticky is 4000ms minHold, so we wait it out
    s = step(s, "upload_draining", t0 + 5200) // 4100ms later: error hold expired
    // sync_error entered at t0+1100; we just left it at t0+5200.
    // The ping-pong rule blocks "candidate matches prev AND now - prevLeftAt < 2000ms".
    // But the *previous transition* was idle -> upload_draining -> sync_error, so prev=upload_draining,
    // prevLeftAt=t0+1100. now - prevLeftAt = 4100ms >= 2000ms, so allowed.
    expect(s.displayed).toBe<AccessoryState>("upload_draining")
  })

  it("error sticky: ble_error must hold 4 s before downward yield", () => {
    let s = step(initialReducerState, "ble_error", t0)
    s = step(s, "idle", t0 + 1000)
    expect(s.displayed).toBe<AccessoryState>("ble_error")
    s = step(s, "idle", t0 + 4500)
    expect(s.displayed).toBe<AccessoryState>("idle")
  })

  it("synced_confirm fires via SYNCED_OK action", () => {
    let s = accessoryReducer(initialReducerState, { type: "SYNCED_OK", now: t0 })
    expect(s.displayed).toBe<AccessoryState>("synced_confirm")
  })

  it("synced_confirm lingers 8 s then yields to idle", () => {
    let s = accessoryReducer(initialReducerState, { type: "SYNCED_OK", now: t0 })
    expect(s.displayed).toBe<AccessoryState>("synced_confirm")
    s = step(s, "idle", t0 + 3000)
    expect(s.displayed).toBe<AccessoryState>("synced_confirm")
    s = step(s, "idle", t0 + 8500)
    expect(s.displayed).toBe<AccessoryState>("idle")
  })

  it("synced_confirm yields immediately to a higher-priority error", () => {
    let s = accessoryReducer(initialReducerState, { type: "SYNCED_OK", now: t0 })
    s = step(s, "ble_error", t0 + 1000)
    expect(s.displayed).toBe<AccessoryState>("ble_error")
  })

  it("error display caps at 12 s when candidate has changed", () => {
    let s = step(initialReducerState, "ble_error", t0)
    s = step(s, "idle", t0 + 12_500)
    expect(s.displayed).toBe<AccessoryState>("idle")
  })
})
