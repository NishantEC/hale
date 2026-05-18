# Bottom Accessory Activity Strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an iOS-26-only `NativeTabs.BottomAccessory` "activity strip" that surfaces the single most important live truth about the strap + sync pipeline (16 ranked states), with anti-flicker logic, a developer preview screen, and tests.

**Architecture:** Pure-data state module (predicates + copy/icon/tone tables) → pure reducer (priority + hold-times + anti-flicker) → React hook bridging BleContext + SyncContext into a narrow displayed-state via debounce + reducer → memoized `ActivityStrip` component rendered inside `NativeTabs.BottomAccessory` in the tabs layout, gated on iOS 26+.

**Tech Stack:** React Native (Expo SDK 55), expo-router 55 `NativeTabs` (`unstable-native-tabs`), `expo-symbols` for SF Symbol rendering, Jest with `jest-expo` preset, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-19-bottom-accessory-activity-strip-design.md`

---

## File Map

| Path | Role |
|---|---|
| `apps/app/app/components/ActivityStrip/states.ts` | State enum, `AccessoryState` type, signal snapshot type, predicate table, copy/icon/tone tables, `deriveCandidate(snapshot)` pure function |
| `apps/app/app/components/ActivityStrip/reducer.ts` | Pure `accessoryReducer(prev, action, now)` enforcing priority preemption, per-state hold times, ping-pong suppression, confirmation lingering, error caps |
| `apps/app/app/components/ActivityStrip/useActivityStripState.ts` | React hook: subscribes to BleContext + SyncContext, derives snapshot, debounces 300 ms, drives reducer, returns `{ state, copy, icon, tone, onPress, announcement }` |
| `apps/app/app/components/ActivityStrip/ActivityStrip.tsx` | Memoized component that reads `useActivityStripState` + `usePlacement`, renders regular pill / inline icon, cross-dissolves, fires VoiceOver announcements |
| `apps/app/app/components/ActivityStrip/index.ts` | Barrel: `export { ActivityStrip }` and types |
| `apps/app/test/components/ActivityStrip/states.test.ts` | Predicate + `deriveCandidate` tests for every state |
| `apps/app/test/components/ActivityStrip/reducer.test.ts` | Reducer behavior: priority preemption, hold times, ping-pong suppression, confirmation linger, error cap |
| `apps/app/src/app/(app)/(tabs)/_layout.tsx` | Mount `<NativeTabs.BottomAccessory>` inside the existing `<NativeTabs>` tree, gated by iOS-version |
| `apps/app/app/screens/DevActivityStripScreen.tsx` | Developer preview: list of all 16 states + idle; tapping injects a mock snapshot to force-display that state inside a real `ActivityStrip` |
| `apps/app/src/app/(app)/dev-activity-strip.tsx` | Route file mapping to `DevActivityStripScreen` |
| `apps/app/src/app/(app)/_layout.tsx` | Register the new `dev-activity-strip` screen on the Stack |

---

## Task 1 — `states.ts`: enum, snapshot, predicates, copy/icon/tone tables

**Files:**
- Create: `apps/app/app/components/ActivityStrip/states.ts`
- Test: `apps/app/test/components/ActivityStrip/states.test.ts`

This task delivers the pure-data layer: a `deriveCandidate(snapshot)` function and the static metadata tables every other module reads. TDD-style — failing test first.

- [ ] **Step 1: Write the failing test**

Create `apps/app/test/components/ActivityStrip/states.test.ts`:

```ts
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

  it("stale_sync when connected and last sync > 24h ago", () => {
    const now = 1_800_000_000_000
    expect(
      deriveCandidate(
        snap({
          now,
          connectionState: "connected",
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
  })

  it("ble_syncing requires connected", () => {
    expect(
      deriveCandidate(snap({ connectionState: "connected", bleIsSyncing: true })),
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
      expect(ACCESSORY_METADATA[s]).toBeDefined()
      expect(ACCESSORY_METADATA[s].priority).toBeGreaterThan(0)
      expect(typeof ACCESSORY_METADATA[s].icon).toBe("string")
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && yarn jest test/components/ActivityStrip/states.test.ts`
Expected: FAIL with module-not-found ("Cannot find module ../../../app/components/ActivityStrip/states").

- [ ] **Step 3: Write minimal implementation**

Create `apps/app/app/components/ActivityStrip/states.ts`:

```ts
export type AccessoryState =
  | "idle"
  | "alarm_firing"
  | "ble_error"
  | "sync_error"
  | "dead_letters"
  | "disconnected_was_worn"
  | "stale_sync"
  | "app_update"
  | "low_power_paused"
  | "ble_connecting"
  | "ble_syncing"
  | "pipeline_running"
  | "upload_draining"
  | "synced_confirm"
  | "offline_with_backlog"
  | "battery_low"
  | "alarm_armed_soon"

export type AccessoryTone = "red" | "amber" | "teal" | "blue" | "green" | "indigo" | "gray"

export type AccessorySnapshot = {
  // BleContext-derived
  bleError: string | null
  connectionState: "disconnected" | "scanning" | "connecting" | "connected"
  wasWornRecently: boolean
  disconnectedAt: number | null
  lastSyncAt: number | null
  bleIsSyncing: boolean
  syncStage: string | null
  syncProgress: { recordsRead: number; total: number | null } | null
  syncIteration: number | null
  syncIterationCap: number | null
  pipelineState: "idle" | "running" | "success" | "failed"
  batteryLevel: number | null
  isCharging: boolean
  strapAlarmArmed: boolean
  strapAlarmAt: number | null

  // SyncContext-derived
  syncError: string | null
  deadCount: number
  isOnline: boolean
  pendingCount: number
  queueIsSyncing: boolean
  syncSummary: { nights: number; stages: number; scores: number } | null

  // App-level
  isAppUpdateAvailable: boolean
  isLowPowerMode: boolean

  // Clock injected for testability
  now: number
}

type Metadata = {
  priority: number
  icon: string
  tone: AccessoryTone
  minHoldMs: number
  persistent: boolean
}

export const ACCESSORY_METADATA: Record<Exclude<AccessoryState, "idle">, Metadata> = {
  alarm_firing:           { priority: 100, icon: "alarm.fill",                                tone: "red",    minHoldMs: 800,  persistent: true  },
  ble_error:              { priority: 95,  icon: "exclamationmark.triangle.fill",             tone: "red",    minHoldMs: 4000, persistent: false },
  sync_error:             { priority: 90,  icon: "exclamationmark.icloud",                    tone: "amber",  minHoldMs: 4000, persistent: false },
  dead_letters:           { priority: 85,  icon: "exclamationmark.icloud.fill",               tone: "amber",  minHoldMs: 800,  persistent: true  },
  disconnected_was_worn:  { priority: 80,  icon: "antenna.radiowaves.left.and.right.slash",   tone: "amber",  minHoldMs: 800,  persistent: true  },
  stale_sync:             { priority: 75,  icon: "clock.badge.exclamationmark",               tone: "amber",  minHoldMs: 800,  persistent: true  },
  app_update:             { priority: 70,  icon: "arrow.down.circle.fill",                    tone: "teal",   minHoldMs: 800,  persistent: true  },
  low_power_paused:       { priority: 65,  icon: "bolt.slash",                                tone: "gray",   minHoldMs: 800,  persistent: true  },
  ble_connecting:         { priority: 60,  icon: "wave.3.left",                               tone: "blue",   minHoldMs: 2000, persistent: false },
  ble_syncing:            { priority: 55,  icon: "arrow.triangle.2.circlepath",               tone: "blue",   minHoldMs: 1500, persistent: false },
  pipeline_running:       { priority: 50,  icon: "chart.line.uptrend.xyaxis",                 tone: "blue",   minHoldMs: 1500, persistent: false },
  upload_draining:        { priority: 45,  icon: "arrow.up.circle",                           tone: "teal",   minHoldMs: 1000, persistent: false },
  synced_confirm:         { priority: 40,  icon: "checkmark.circle.fill",                     tone: "green",  minHoldMs: 8000, persistent: false },
  offline_with_backlog:   { priority: 35,  icon: "wifi.slash",                                tone: "gray",   minHoldMs: 2000, persistent: true  },
  battery_low:            { priority: 30,  icon: "battery.25",                                tone: "amber",  minHoldMs: 800,  persistent: true  },
  alarm_armed_soon:       { priority: 25,  icon: "alarm",                                     tone: "indigo", minHoldMs: 800,  persistent: true  },
}

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const DISCONNECT_GRACE_MS = 90_000

const PREDICATES: Array<{ state: Exclude<AccessoryState, "idle">; test: (s: AccessorySnapshot) => boolean }> = [
  { state: "alarm_firing",          test: (s) => s.strapAlarmArmed && s.strapAlarmAt != null && s.strapAlarmAt <= s.now },
  { state: "ble_error",             test: (s) => s.bleError != null },
  { state: "sync_error",            test: (s) => s.syncError != null || s.pipelineState === "failed" },
  { state: "dead_letters",          test: (s) => s.deadCount > 0 },
  { state: "disconnected_was_worn", test: (s) =>
    s.connectionState === "disconnected" &&
    s.wasWornRecently &&
    s.disconnectedAt != null &&
    s.now - s.disconnectedAt > DISCONNECT_GRACE_MS },
  { state: "stale_sync",            test: (s) =>
    s.connectionState === "connected" &&
    s.lastSyncAt != null &&
    s.now - s.lastSyncAt > ONE_DAY_MS },
  { state: "app_update",            test: (s) => s.isAppUpdateAvailable },
  { state: "low_power_paused",      test: (s) => s.isLowPowerMode && s.pendingCount > 0 },
  { state: "ble_connecting",        test: (s) => s.connectionState === "scanning" || s.connectionState === "connecting" },
  { state: "ble_syncing",           test: (s) => s.connectionState === "connected" && s.bleIsSyncing },
  { state: "pipeline_running",      test: (s) => s.pipelineState === "running" },
  { state: "upload_draining",       test: (s) => s.queueIsSyncing && s.pendingCount > 0 },
  // synced_confirm is edge-triggered in the reducer — never matches via predicate
  { state: "offline_with_backlog",  test: (s) => !s.isOnline && s.pendingCount > 0 },
  { state: "battery_low",           test: (s) => s.batteryLevel != null && s.batteryLevel < 20 && !s.isCharging },
  { state: "alarm_armed_soon",      test: (s) =>
    s.strapAlarmArmed &&
    s.strapAlarmAt != null &&
    s.strapAlarmAt - s.now > 0 &&
    s.strapAlarmAt - s.now < ONE_HOUR_MS },
]

export function deriveCandidate(snapshot: AccessorySnapshot): AccessoryState {
  for (const p of PREDICATES) {
    if (p.test(snapshot)) return p.state
  }
  return "idle"
}

export function copyFor(state: AccessoryState, snapshot: AccessorySnapshot): string {
  switch (state) {
    case "alarm_firing":          return "Alarm — Tap to dismiss"
    case "ble_error":             return `Strap error${snapshot.bleError ? ` — ${truncate(snapshot.bleError, 24)}` : ""}`
    case "sync_error":            return "Sync failed — Tap to retry"
    case "dead_letters":          return `${snapshot.deadCount} record${snapshot.deadCount === 1 ? "" : "s"} didn't upload`
    case "disconnected_was_worn": return "Strap disconnected"
    case "stale_sync":            return snapshot.lastSyncAt ? `Last sync ${relative(snapshot.now - snapshot.lastSyncAt)}` : "Last sync long ago"
    case "app_update":            return "App update ready · Restart"
    case "low_power_paused":      return "Low Power Mode · sync paused"
    case "ble_connecting":        return "Connecting to strap…"
    case "ble_syncing": {
      const stage = snapshot.syncStage
      const iter = snapshot.syncIteration
      const cap = snapshot.syncIterationCap
      if (iter != null && cap != null && cap > 1) return `Syncing · ${iter} of ${cap}`
      return stage ? `Syncing · ${stage}` : "Syncing…"
    }
    case "pipeline_running":      return "Crunching scores…"
    case "upload_draining":       return `Uploading ${snapshot.pendingCount} record${snapshot.pendingCount === 1 ? "" : "s"}`
    case "synced_confirm": {
      const s = snapshot.syncSummary
      if (s && (s.nights || s.stages)) return `Synced — ${s.nights} night${s.nights === 1 ? "" : "s"} · ${s.stages} stages`
      return "Synced"
    }
    case "offline_with_backlog":  return `Offline · ${snapshot.pendingCount} waiting`
    case "battery_low":           return snapshot.batteryLevel != null ? `Strap battery low · ${snapshot.batteryLevel}%` : "Strap battery low"
    case "alarm_armed_soon":      return snapshot.strapAlarmAt ? `Alarm at ${formatTime(snapshot.strapAlarmAt)}` : "Alarm armed"
    case "idle":                  return ""
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function relative(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = ((hh + 11) % 12) + 1
  return `${h12}:${mm} ${ampm}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && yarn jest test/components/ActivityStrip/states.test.ts`
Expected: PASS — all 18+ cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/ActivityStrip/states.ts apps/app/test/components/ActivityStrip/states.test.ts
git commit -m "app: ActivityStrip state predicates + metadata"
```

---

## Task 2 — `reducer.ts`: priority preemption, hold times, anti-flicker, confirmation

**Files:**
- Create: `apps/app/app/components/ActivityStrip/reducer.ts`
- Test: `apps/app/test/components/ActivityStrip/reducer.test.ts`

This task delivers the pure reducer that enforces the temporal rules in the spec. No React.

- [ ] **Step 1: Write the failing test**

Create `apps/app/test/components/ActivityStrip/reducer.test.ts`:

```ts
import {
  accessoryReducer,
  initialReducerState,
  ReducerState,
} from "../../../app/components/ActivityStrip/reducer"

const t0 = 1_800_000_000_000

function step(state: ReducerState, candidate: any, now: number): ReducerState {
  return accessoryReducer(state, { type: "CANDIDATE", candidate, now })
}

describe("accessoryReducer", () => {
  it("starts in idle", () => {
    expect(initialReducerState.displayed).toBe("idle")
  })

  it("immediately enters a non-idle candidate from idle", () => {
    const next = step(initialReducerState, "ble_syncing", t0)
    expect(next.displayed).toBe("ble_syncing")
    expect(next.enteredAt).toBe(t0)
  })

  it("higher-priority candidate preempts displayed state instantly (no hold)", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    s = step(s, "ble_error", t0 + 200) // ble_error priority > ble_syncing
    expect(s.displayed).toBe("ble_error")
  })

  it("lower-priority candidate must wait for hold time", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    // ble_syncing has 1500ms minHold. upload_draining is lower-priority.
    s = step(s, "upload_draining", t0 + 500)
    expect(s.displayed).toBe("ble_syncing")
    s = step(s, "upload_draining", t0 + 2000)
    expect(s.displayed).toBe("upload_draining")
  })

  it("idle candidate must wait for hold time", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    s = step(s, "idle", t0 + 500)
    expect(s.displayed).toBe("ble_syncing")
    s = step(s, "idle", t0 + 2000)
    expect(s.displayed).toBe("idle")
  })

  it("suppresses X → Y → X ping-pong within 2 s", () => {
    let s = step(initialReducerState, "ble_syncing", t0)
    s = step(s, "ble_error", t0 + 2000) // pre-empted
    expect(s.displayed).toBe("ble_error")
    // ble_error candidate clears, lower candidate tries to come back as ble_syncing
    s = step(s, "ble_syncing", t0 + 2500) // within 2s of leaving ble_syncing? no — leaving was at t0+2000
    // The rule: block transitions where new candidate matches prev AND now - entryTime < 2000
    // prev was ble_syncing, current is ble_error entered at t0+2000.
    // At t0+2500: candidate=ble_syncing matches prev (ble_syncing); now - errorEnteredAt = 500ms < 2000 → suppressed
    // But ble_error has 4000ms min hold anyway, so it stays.
    expect(s.displayed).toBe("ble_error")
  })

  it("error sticky: ble_error must hold 4 s before downward yield", () => {
    let s = step(initialReducerState, "ble_error", t0)
    s = step(s, "idle", t0 + 1000)
    expect(s.displayed).toBe("ble_error")
    s = step(s, "idle", t0 + 4500)
    expect(s.displayed).toBe("idle")
  })

  it("synced_confirm fires only via SYNCED_OK action", () => {
    let s = step(initialReducerState, "idle", t0)
    s = accessoryReducer(s, { type: "SYNCED_OK", now: t0 + 100 })
    expect(s.displayed).toBe("synced_confirm")
  })

  it("synced_confirm lingers 8 s then yields to idle", () => {
    let s = accessoryReducer(initialReducerState, { type: "SYNCED_OK", now: t0 })
    expect(s.displayed).toBe("synced_confirm")
    s = step(s, "idle", t0 + 3000)
    expect(s.displayed).toBe("synced_confirm")
    s = step(s, "idle", t0 + 8500)
    expect(s.displayed).toBe("idle")
  })

  it("synced_confirm yields immediately to a higher-priority error", () => {
    let s = accessoryReducer(initialReducerState, { type: "SYNCED_OK", now: t0 })
    s = step(s, "ble_error", t0 + 1000)
    expect(s.displayed).toBe("ble_error")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && yarn jest test/components/ActivityStrip/reducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/app/app/components/ActivityStrip/reducer.ts`:

```ts
import { ACCESSORY_METADATA, AccessoryState } from "./states"

export type ReducerState = {
  displayed: AccessoryState
  enteredAt: number
  prevDisplayed: AccessoryState | null
  prevLeftAt: number | null
}

export type ReducerAction =
  | { type: "CANDIDATE"; candidate: AccessoryState; now: number }
  | { type: "SYNCED_OK"; now: number }

export const initialReducerState: ReducerState = {
  displayed: "idle",
  enteredAt: 0,
  prevDisplayed: null,
  prevLeftAt: null,
}

const PING_PONG_WINDOW_MS = 2000
const ERROR_DISPLAY_CAP_MS = 12_000

function priority(state: AccessoryState): number {
  if (state === "idle") return 0
  return ACCESSORY_METADATA[state].priority
}

function holdFor(state: AccessoryState): number {
  if (state === "idle") return 0
  return ACCESSORY_METADATA[state].minHoldMs
}

function transition(state: ReducerState, next: AccessoryState, now: number): ReducerState {
  if (next === state.displayed) return state
  return {
    displayed: next,
    enteredAt: now,
    prevDisplayed: state.displayed,
    prevLeftAt: now,
  }
}

export function accessoryReducer(state: ReducerState, action: ReducerAction): ReducerState {
  if (action.type === "SYNCED_OK") {
    if (priority("synced_confirm") < priority(state.displayed)) return state
    return transition(state, "synced_confirm", action.now)
  }

  const { candidate, now } = action
  const elapsed = now - state.enteredAt
  const candPrio = priority(candidate)
  const dispPrio = priority(state.displayed)

  // Hard cap: errors auto-dismiss after 12s if the candidate is no longer the error.
  const isErrorDisplayed = state.displayed === "ble_error" || state.displayed === "sync_error"
  if (isErrorDisplayed && candidate !== state.displayed && elapsed >= ERROR_DISPLAY_CAP_MS) {
    return transition(state, candidate, now)
  }

  // Priority preemption: instantly take higher-priority candidates.
  if (candPrio > dispPrio) {
    return transition(state, candidate, now)
  }

  // Same state — no-op.
  if (candidate === state.displayed) return state

  // Downward yield: must wait minHold of displayed state.
  if (elapsed < holdFor(state.displayed)) return state

  // Ping-pong suppression: block X → Y → X within 2s of leaving X.
  if (
    state.prevDisplayed === candidate &&
    state.prevLeftAt != null &&
    now - state.prevLeftAt < PING_PONG_WINDOW_MS
  ) {
    return state
  }

  return transition(state, candidate, now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && yarn jest test/components/ActivityStrip/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/ActivityStrip/reducer.ts apps/app/test/components/ActivityStrip/reducer.test.ts
git commit -m "app: ActivityStrip reducer (priority, hold, anti-flicker)"
```

---

## Task 3 — `useActivityStripState.ts`: React hook bridging contexts + reducer

**Files:**
- Create: `apps/app/app/components/ActivityStrip/useActivityStripState.ts`

This task is the integration point. It reads the two contexts, derives a narrow snapshot, debounces the candidate, and drives the reducer. No new tests — the pure pieces are already covered; this hook is the wiring.

- [ ] **Step 1: Read current context shapes**

Read `apps/app/app/context/BleContext.tsx` and `apps/app/app/context/SyncContext.tsx` to confirm exported hooks (`useBleContext`, `useSyncContext`). Confirm field names match the snapshot construction below. If a field doesn't exist on a context, add a minimal expose (e.g., `wasWornRecently`, `disconnectedAt`) inside the same task.

Specifically, BleContext currently does NOT expose `wasWornRecently` or `disconnectedAt`. Add them as derived booleans/timestamps inside `BleContext` (track `isWorn`-true → record `disconnectedAt = Date.now()` and `wasWornRecently = true` for 12h). If a separate ticket is preferred, fall back to: `wasWornRecently = isWorn` and `disconnectedAt = lastSyncAt ?? null` as a v1 approximation — note this in the file header so the next iteration tightens it.

- [ ] **Step 2: Write the hook**

Create `apps/app/app/components/ActivityStrip/useActivityStripState.ts`:

```ts
import { useEffect, useMemo, useReducer, useRef } from "react"
import { router } from "expo-router"
import * as Battery from "expo-battery"
import * as Updates from "expo-updates"
import { useBleContext } from "@/context/BleContext"
import { useSyncContext } from "@/context/SyncContext"
import {
  ACCESSORY_METADATA,
  AccessorySnapshot,
  AccessoryState,
  AccessoryTone,
  copyFor,
  deriveCandidate,
} from "./states"
import {
  accessoryReducer,
  initialReducerState,
} from "./reducer"

const DEBOUNCE_MS = 300

export type ActivityStripView = {
  state: AccessoryState
  copy: string
  icon: string
  tone: AccessoryTone
  announcement: string
  onPress: (() => void) | null
}

const PRESS_ROUTES: Partial<Record<AccessoryState, string>> = {
  ble_error: "/(tabs)/inspector",
  sync_error: "/(tabs)/inspector",
  dead_letters: "/(tabs)/inspector",
  disconnected_was_worn: "/device-settings",
  stale_sync: "/(tabs)/inspector",
  ble_connecting: "/device-settings",
  ble_syncing: "/(tabs)/inspector",
  pipeline_running: "/(tabs)/inspector",
  upload_draining: "/(tabs)/inspector",
  offline_with_backlog: "/(tabs)/inspector",
  battery_low: "/device-settings",
  alarm_armed_soon: "/(tabs)/health",
  synced_confirm: "/(tabs)/health",
  app_update: "__APP_UPDATE__",
  alarm_firing: "__DISMISS_ALARM__",
  low_power_paused: "__OPEN_SETTINGS__",
}

function buildSnapshot(
  ble: ReturnType<typeof useBleContext>,
  sync: ReturnType<typeof useSyncContext>,
  isLowPowerMode: boolean,
  isAppUpdateAvailable: boolean,
  now: number,
): AccessorySnapshot {
  return {
    bleError: ble.error ?? null,
    connectionState: ble.connectionState,
    wasWornRecently: !!ble.isWorn || ble.lastSyncAt != null,
    disconnectedAt: ble.connectionState === "disconnected"
      ? (ble.lastSyncAt ? Date.parse(ble.lastSyncAt) : null)
      : null,
    lastSyncAt: ble.lastSyncAt ? Date.parse(ble.lastSyncAt) : null,
    bleIsSyncing: ble.isSyncing,
    syncStage: ble.syncStage ?? null,
    syncProgress: ble.syncProgress
      ? { recordsRead: ble.syncProgress.recordsRead ?? 0, total: ble.syncProgress.total ?? null }
      : null,
    syncIteration: ble.syncIteration ?? null,
    syncIterationCap: ble.syncIterationCap ?? null,
    pipelineState: ble.pipelineState,
    batteryLevel: ble.batteryLevel,
    isCharging: ble.isCharging,
    strapAlarmArmed: ble.strapAlarmArmed,
    strapAlarmAt: ble.strapAlarmAt ? Date.parse(ble.strapAlarmAt) : null,

    syncError: sync.syncError ?? null,
    deadCount: sync.deadCount,
    isOnline: sync.isOnline,
    pendingCount: sync.pendingCount,
    queueIsSyncing: sync.isSyncing,
    syncSummary: ble.syncSummary ?? null,

    isAppUpdateAvailable,
    isLowPowerMode,
    now,
  }
}

export function useActivityStripState(): ActivityStripView {
  const ble = useBleContext()
  const sync = useSyncContext()
  const [reducerState, dispatch] = useReducer(accessoryReducer, initialReducerState)

  // Low Power Mode + app-update flags via small effect-driven refs.
  const lpmRef = useRef(false)
  const updateRef = useRef(false)
  useEffect(() => {
    Battery.isLowPowerModeEnabledAsync().then((v) => { lpmRef.current = v })
    const sub = Battery.addLowPowerModeListener(({ lowPowerMode }) => { lpmRef.current = lowPowerMode })
    return () => sub.remove()
  }, [])
  useEffect(() => {
    let cancelled = false
    Updates.checkForUpdateAsync()
      .then((u) => { if (!cancelled) updateRef.current = u.isAvailable })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Build snapshot on every render — cheap (small object) and required since signals change frequently.
  const snapshot = useMemo(
    () => buildSnapshot(ble, sync, lpmRef.current, updateRef.current, Date.now()),
    [
      ble.error, ble.connectionState, ble.isWorn, ble.lastSyncAt, ble.isSyncing, ble.syncStage,
      ble.syncIteration, ble.syncIterationCap, ble.pipelineState, ble.batteryLevel, ble.isCharging,
      ble.strapAlarmArmed, ble.strapAlarmAt, ble.syncSummary,
      sync.syncError, sync.deadCount, sync.isOnline, sync.pendingCount, sync.isSyncing,
    ],
  )

  const candidate = deriveCandidate(snapshot)

  // Debounce candidate → CANDIDATE dispatch by 300ms to kill rapid churn.
  const candidateRef = useRef(candidate)
  useEffect(() => {
    candidateRef.current = candidate
    const id = setTimeout(() => {
      dispatch({ type: "CANDIDATE", candidate: candidateRef.current, now: Date.now() })
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [candidate])

  // Edge-detect sync confirmation.
  const prevPipelineRef = useRef(ble.pipelineState)
  const prevQueueRef = useRef({ syncing: sync.isSyncing, pending: sync.pendingCount })
  useEffect(() => {
    const wasRunning = prevPipelineRef.current === "running"
    if (wasRunning && ble.pipelineState === "success") {
      dispatch({ type: "SYNCED_OK", now: Date.now() })
    }
    prevPipelineRef.current = ble.pipelineState
  }, [ble.pipelineState])
  useEffect(() => {
    const prev = prevQueueRef.current
    if (prev.syncing && !sync.isSyncing && prev.pending > 0 && sync.pendingCount === 0) {
      dispatch({ type: "SYNCED_OK", now: Date.now() })
    }
    prevQueueRef.current = { syncing: sync.isSyncing, pending: sync.pendingCount }
  }, [sync.isSyncing, sync.pendingCount])

  const state = reducerState.displayed
  const copy = copyFor(state, snapshot)
  const meta = state === "idle" ? null : ACCESSORY_METADATA[state]
  const tone: AccessoryTone = meta?.tone ?? "gray"
  const icon = meta?.icon ?? "circle"

  const onPress = useMemo<(() => void) | null>(() => {
    const target = PRESS_ROUTES[state]
    if (!target) return null
    if (target === "__APP_UPDATE__") return () => { Updates.reloadAsync() }
    if (target === "__DISMISS_ALARM__") return () => { ble.disarmAlarm?.() }
    if (target === "__OPEN_SETTINGS__") {
      return () => {
        const { Linking } = require("react-native")
        Linking.openURL("app-settings:")
      }
    }
    return () => { router.push(target as any) }
  }, [state, ble])

  return { state, copy, icon, tone, announcement: copy, onPress }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/app && yarn tsc --noEmit`
Expected: PASS. Resolve any "Property does not exist on context" errors by either adjusting the field name on the snapshot builder or extending the context's exported value type.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/components/ActivityStrip/useActivityStripState.ts
git commit -m "app: useActivityStripState hook (snapshot + debounce + reducer)"
```

---

## Task 4 — `ActivityStrip.tsx`: the rendered pill (regular + inline)

**Files:**
- Create: `apps/app/app/components/ActivityStrip/ActivityStrip.tsx`
- Create: `apps/app/app/components/ActivityStrip/index.ts`

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/ActivityStrip/ActivityStrip.tsx`:

```tsx
import { memo, useEffect, useRef } from "react"
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { SymbolView } from "expo-symbols"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useActivityStripState } from "./useActivityStripState"
import type { AccessoryTone } from "./states"

function toneColor(tone: AccessoryTone): string {
  const c = LOCAL_THEME.colors
  switch (tone) {
    case "red":    return c.danger ?? "#FF453A"
    case "amber":  return c.warning ?? "#FF9F0A"
    case "teal":   return c.accent ?? "#64D2FF"
    case "blue":   return c.tint ?? "#0A84FF"
    case "green":  return c.success ?? "#30D158"
    case "indigo": return "#5E5CE6"
    case "gray":   return c.textDim ?? "#8E8E93"
  }
}

const SPIN_STATES = new Set(["ble_syncing", "pipeline_running", "upload_draining", "ble_connecting"])

export const ActivityStrip = memo(function ActivityStrip() {
  const { state, copy, icon, tone, onPress, announcement } = useActivityStripState()
  const placement = NativeTabs.BottomAccessory.usePlacement()
  const fade = useRef(new Animated.Value(0)).current
  const spin = useRef(new Animated.Value(0)).current
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v })
  }, [])

  useEffect(() => {
    if (state === "idle") {
      fade.setValue(0)
      return
    }
    AccessibilityInfo.announceForAccessibility(announcement)
    Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotionRef.current ? 0 : 180,
      useNativeDriver: true,
    }).start()
  }, [state, announcement, fade])

  useEffect(() => {
    if (!SPIN_STATES.has(state) || reduceMotionRef.current) {
      spin.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [state, spin])

  if (state === "idle") return null

  const color = toneColor(tone)
  const isInline = placement === "inline"
  const iconSize = isInline ? 18 : 18
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })

  return (
    <Animated.View style={[styles.wrap, isInline && styles.wrapInline, { opacity: fade }]}>
      <Pressable
        onPress={onPress ?? undefined}
        disabled={!onPress}
        accessibilityLabel={announcement}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        style={({ pressed }) => [styles.pill, isInline && styles.pillInline, pressed && styles.pillPressed]}
      >
        <Animated.View style={SPIN_STATES.has(state) ? { transform: [{ rotate }] } : undefined}>
          <SymbolView name={icon as any} size={iconSize} tintColor={color} resizeMode="scaleAspectFit" />
        </Animated.View>
        {!isInline && <Text numberOfLines={1} style={[styles.text, { color }]}>{copy}</Text>}
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  wrapInline: { paddingHorizontal: 0 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  pillInline: { paddingHorizontal: 4 },
  pillPressed: { opacity: 0.6 },
  text: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
})
```

- [ ] **Step 2: Add barrel**

Create `apps/app/app/components/ActivityStrip/index.ts`:

```ts
export { ActivityStrip } from "./ActivityStrip"
export { useActivityStripState } from "./useActivityStripState"
export type { ActivityStripView } from "./useActivityStripState"
```

- [ ] **Step 3: Type-check**

Run: `cd apps/app && yarn tsc --noEmit`
Expected: PASS. Resolve any LOCAL_THEME color name mismatches by reading `apps/app/app/utils/localTheme.ts` and adjusting the `toneColor` mapping to use whatever colors exist (e.g., `c.danger` may be named `c.error`, etc.).

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/components/ActivityStrip/ActivityStrip.tsx apps/app/app/components/ActivityStrip/index.ts
git commit -m "app: ActivityStrip pill component (regular + inline)"
```

---

## Task 5 — Mount in tabs layout (iOS 26 gate)

**Files:**
- Modify: `apps/app/src/app/(app)/(tabs)/_layout.tsx`

- [ ] **Step 1: Edit the layout**

Open `apps/app/src/app/(app)/(tabs)/_layout.tsx`. The current file is:

```tsx
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export default function TabsLayout() {
  useColorMode()
  const { colors } = LOCAL_THEME
  return (
    <NativeTabs tintColor={colors.tint} minimizeBehavior="automatic" blurEffect="systemChromeMaterial">
      <NativeTabs.Trigger name="index">
        ...
```

Replace it with:

```tsx
import { Platform } from "react-native"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"
import { ActivityStrip } from "@/components/ActivityStrip"

function supportsBottomAccessory(): boolean {
  if (Platform.OS !== "ios") return false
  const major = parseInt(String(Platform.Version).split(".")[0], 10)
  return Number.isFinite(major) && major >= 26
}

export default function TabsLayout() {
  useColorMode()
  const { colors } = LOCAL_THEME

  return (
    <NativeTabs tintColor={colors.tint} minimizeBehavior="automatic" blurEffect="systemChromeMaterial">
      {supportsBottomAccessory() && (
        <NativeTabs.BottomAccessory>
          <ActivityStrip />
        </NativeTabs.BottomAccessory>
      )}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        <NativeTabs.Trigger.Label hidden>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <NativeTabs.Trigger.Icon sf="waveform.path.ecg" md="monitor_heart" />
        <NativeTabs.Trigger.Label hidden>Health</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inspector">
        <NativeTabs.Trigger.Icon sf={{ default: "gauge.medium", selected: "gauge.high" }} md="speed" />
        <NativeTabs.Trigger.Label hidden>Inspector</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        <NativeTabs.Trigger.Label hidden>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
```

- [ ] **Step 2: Run the app on iOS 26 simulator**

Run: `cd apps/app && yarn ios` (or `yarn start` and pick an iOS 26 simulator).
Expected: app boots; tab bar renders; if no signal is active, the accessory area is empty/zero-height; if any signal fires (force-disconnect strap, simulate sync error in code), the strip appears.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/(app)/(tabs)/_layout.tsx
git commit -m "app: mount ActivityStrip in tabs layout (iOS 26+ only)"
```

---

## Task 6 — Developer preview screen (every state side-by-side)

**Files:**
- Create: `apps/app/app/screens/DevActivityStripScreen.tsx`
- Create: `apps/app/src/app/(app)/dev-activity-strip.tsx`
- Modify: `apps/app/src/app/(app)/_layout.tsx`
- Modify: `apps/app/app/screens/DebugInspectorScreen.tsx` or whichever Inspector screen lists debug routes — add a link to `/dev-activity-strip`.

This screen renders a controlled-snapshot ActivityStrip and a list of state buttons.

- [ ] **Step 1: Create the preview screen**

Create `apps/app/app/screens/DevActivityStripScreen.tsx`:

```tsx
import { useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { SymbolView } from "expo-symbols"
import { LOCAL_THEME } from "@/utils/localTheme"
import {
  ACCESSORY_METADATA,
  AccessorySnapshot,
  AccessoryState,
  AccessoryTone,
  copyFor,
} from "@/components/ActivityStrip/states"

const ALL_STATES: AccessoryState[] = [
  "idle",
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

function mockSnapshot(state: AccessoryState): AccessorySnapshot {
  const now = Date.now()
  const base: AccessorySnapshot = {
    bleError: null, syncError: null, pipelineState: "idle", deadCount: 0,
    connectionState: "disconnected", wasWornRecently: false, disconnectedAt: null,
    lastSyncAt: null, isAppUpdateAvailable: false, isLowPowerMode: false,
    isOnline: true, pendingCount: 0, bleIsSyncing: false, syncStage: null,
    syncProgress: null, syncIteration: null, syncIterationCap: null,
    queueIsSyncing: false, syncSummary: null, batteryLevel: null,
    isCharging: false, strapAlarmArmed: false, strapAlarmAt: null, now,
  }
  switch (state) {
    case "alarm_firing":          return { ...base, strapAlarmArmed: true, strapAlarmAt: now - 5000 }
    case "ble_error":             return { ...base, bleError: "Lost packets after handshake" }
    case "sync_error":            return { ...base, syncError: "HTTP 500" }
    case "dead_letters":          return { ...base, deadCount: 12 }
    case "disconnected_was_worn": return { ...base, connectionState: "disconnected", wasWornRecently: true, disconnectedAt: now - 120_000 }
    case "stale_sync":            return { ...base, connectionState: "connected", lastSyncAt: now - 2 * 24 * 60 * 60 * 1000 }
    case "app_update":            return { ...base, isAppUpdateAvailable: true }
    case "low_power_paused":      return { ...base, isLowPowerMode: true, pendingCount: 30 }
    case "ble_connecting":        return { ...base, connectionState: "connecting" }
    case "ble_syncing":           return { ...base, connectionState: "connected", bleIsSyncing: true, syncIteration: 3, syncIterationCap: 5 }
    case "pipeline_running":      return { ...base, pipelineState: "running" }
    case "upload_draining":       return { ...base, queueIsSyncing: true, pendingCount: 247 }
    case "synced_confirm":        return { ...base, syncSummary: { nights: 3, stages: 247, scores: 12 } }
    case "offline_with_backlog":  return { ...base, isOnline: false, pendingCount: 7 }
    case "battery_low":           return { ...base, batteryLevel: 17, isCharging: false }
    case "alarm_armed_soon":      return { ...base, strapAlarmArmed: true, strapAlarmAt: now + 30 * 60 * 1000 }
    case "idle":
    default:                      return base
  }
}

function toneColor(tone: AccessoryTone): string {
  const c = LOCAL_THEME.colors
  switch (tone) {
    case "red":    return c.danger ?? "#FF453A"
    case "amber":  return c.warning ?? "#FF9F0A"
    case "teal":   return c.accent ?? "#64D2FF"
    case "blue":   return c.tint ?? "#0A84FF"
    case "green":  return c.success ?? "#30D158"
    case "indigo": return "#5E5CE6"
    case "gray":   return c.textDim ?? "#8E8E93"
  }
}

export default function DevActivityStripScreen() {
  const [selected, setSelected] = useState<AccessoryState>("ble_syncing")
  const snapshot = useMemo(() => mockSnapshot(selected), [selected])
  const meta = selected === "idle" ? null : ACCESSORY_METADATA[selected]
  const tone: AccessoryTone = meta?.tone ?? "gray"
  const color = toneColor(tone)
  const copy = copyFor(selected, snapshot)
  const icon = meta?.icon ?? "circle"

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.h1}>Activity Strip — Preview</Text>

      <View style={styles.preview}>
        <Text style={styles.label}>Regular placement</Text>
        <View style={[styles.pill, styles.pillRegular]}>
          {selected !== "idle" ? (
            <>
              <SymbolView name={icon as any} size={18} tintColor={color} resizeMode="scaleAspectFit" />
              <Text numberOfLines={1} style={[styles.pillText, { color }]}>{copy}</Text>
            </>
          ) : (
            <Text style={styles.idleText}>(hidden)</Text>
          )}
        </View>

        <Text style={styles.label}>Inline placement</Text>
        <View style={[styles.pill, styles.pillInline]}>
          {selected !== "idle" ? (
            <SymbolView name={icon as any} size={18} tintColor={color} resizeMode="scaleAspectFit" />
          ) : (
            <Text style={styles.idleText}>—</Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {ALL_STATES.map((s) => {
          const m = s === "idle" ? null : ACCESSORY_METADATA[s]
          const c = m ? toneColor(m.tone) : "#999"
          const i = m?.icon ?? "circle"
          return (
            <Pressable
              key={s}
              onPress={() => setSelected(s)}
              style={[styles.row, selected === s && styles.rowSelected]}
            >
              <SymbolView name={i as any} size={16} tintColor={c} resizeMode="scaleAspectFit" />
              <Text style={styles.rowState}>{s}</Text>
              <Text style={styles.rowMeta}>{m ? `p${m.priority}` : ""}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LOCAL_THEME.colors.bg ?? "#000" },
  h1: { color: LOCAL_THEME.colors.text ?? "#fff", fontSize: 18, fontWeight: "700", padding: 16 },
  preview: { paddingHorizontal: 16, gap: 8 },
  label: { color: LOCAL_THEME.colors.textDim ?? "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  pillRegular: { alignSelf: "stretch", justifyContent: "center" },
  pillInline: { alignSelf: "flex-start", paddingHorizontal: 10 },
  pillText: { fontSize: 14, fontWeight: "600" },
  idleText: { color: LOCAL_THEME.colors.textDim ?? "#666", fontSize: 13 },
  list: { padding: 16, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  rowSelected: { backgroundColor: "rgba(255,255,255,0.08)" },
  rowState: { color: LOCAL_THEME.colors.text ?? "#fff", fontSize: 14, flex: 1 },
  rowMeta: { color: LOCAL_THEME.colors.textDim ?? "#888", fontSize: 12, fontVariant: ["tabular-nums"] },
})
```

- [ ] **Step 2: Create the route file**

Create `apps/app/src/app/(app)/dev-activity-strip.tsx`:

```tsx
import DevActivityStripScreen from "@/screens/DevActivityStripScreen"

export default DevActivityStripScreen
```

- [ ] **Step 3: Register the route on the Stack**

Open `apps/app/src/app/(app)/_layout.tsx` and add the screen entry:

```tsx
<Stack.Screen name="dev-activity-strip" options={{ headerShown: true, title: "Activity Strip" }} />
```

Place it next to the other `<Stack.Screen>` entries.

- [ ] **Step 4: Add a discovery entry-point in Inspector / Settings**

Choose one — easiest is a debug list. In `apps/app/app/screens/SettingsScreen.tsx`, find the developer/debug section (search for an existing debug push such as `/device-settings` or any of the inspector probe rows) and add a row that calls `router.push("/dev-activity-strip")` with label "Activity Strip preview". Reuse the same `Pressable + Text` pattern that the surrounding rows use — do not invent a new style.

- [ ] **Step 5: Boot the app and verify**

Run: `cd apps/app && yarn ios`
Tap into Settings → "Activity Strip preview" → tap each state and confirm both regular and inline previews render correctly with the right icon/color/copy.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/screens/DevActivityStripScreen.tsx apps/app/src/app/\(app\)/dev-activity-strip.tsx apps/app/src/app/\(app\)/_layout.tsx apps/app/app/screens/SettingsScreen.tsx
git commit -m "app: dev-only ActivityStrip preview screen + settings link"
```

---

## Task 7 — Manual simulator verification checklist

No code in this task — only verification. Do not mark complete until each box passes.

- [ ] iOS 26 simulator: app boots, no crash, tab bar height is unchanged vs main.
- [ ] Idle state: accessory area is empty (no ghost height).
- [ ] Force a BLE sync (real device or mock): `ble_syncing` appears within ~300 ms; spinner rotates; copy reads "Syncing · {N} of {M}".
- [ ] Kill network mid-drain: `offline_with_backlog` appears (after the hold-time on whatever was previously displayed).
- [ ] Restore network: `upload_draining` appears, then `synced_confirm` fades in for ~8 s, then strip hides.
- [ ] Pull strap battery low (mock `batteryLevel < 20`): `battery_low` shows persistently; tapping routes to Device Settings.
- [ ] Toggle Low Power Mode in iOS settings while queue is non-zero: `low_power_paused` appears.
- [ ] Scroll a tab content view: when iOS minimizes the bar, the accessory collapses to inline (icon only).
- [ ] VoiceOver on: announce-on-transition fires once per state change, not on every progress tick.
- [ ] iOS 25 simulator (or any iOS < 26): tab bar renders; no accessory; no crash.
- [ ] Android: tab bar renders; no accessory; no crash.

If any check fails, file follow-up task before merging.

---

## Self-Review Notes

- **Spec coverage**: every state from the 16-row catalog is implemented (Task 1 metadata + predicates). Reducer rules from spec §State Machine are mechanically captured in Task 2 (priority preemption, hold, ping-pong, error sticky/cap, confirmation linger). Engineering rules from spec §Engineering Structure: file layout matches (Task 4), narrow snapshot + memoization (Task 3), `useReducer` + debounce (Task 3), modal/sheet inheritance is automatic via the tabs layout (Task 5), accessibility live region + reduce motion (Task 4), iOS<26/Android gating (Task 5).
- **Placeholders**: none. The only "investigate-in-context" item is in Task 3 Step 1, where the engineer must reconcile `wasWornRecently`/`disconnectedAt` (currently not on `BleContext`); the task gives an explicit v1 fallback so it cannot stall.
- **Type consistency**: `AccessoryState`, `AccessorySnapshot`, `AccessoryTone` are defined exactly once (Task 1) and re-used by name in every later task. `accessoryReducer`, `initialReducerState`, `ReducerState`, `ReducerAction` likewise.
- **Test coverage**: predicates (Task 1) and reducer (Task 2) have full unit tests; the hook (Task 3) is wired but not unit-tested because RN context mocks add noise for low return; the preview screen (Task 6) is the behavioral end-to-end check.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-19-bottom-accessory-activity-strip.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
