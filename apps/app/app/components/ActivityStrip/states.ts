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
  bleError: string | null
  connectionState: "disconnected" | "scanning" | "connecting" | "discovering" | "ready"
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

  syncError: string | null
  deadCount: number
  isOnline: boolean
  pendingCount: number
  queueIsSyncing: boolean
  syncSummary: { nights: number; stages: number; scores: number } | null

  isAppUpdateAvailable: boolean
  isLowPowerMode: boolean

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
  alarm_firing:           { priority: 100, icon: "alarm.fill",                              tone: "red",    minHoldMs: 800,  persistent: true  },
  ble_error:              { priority: 95,  icon: "exclamationmark.triangle.fill",           tone: "red",    minHoldMs: 4000, persistent: false },
  sync_error:             { priority: 90,  icon: "exclamationmark.icloud",                  tone: "amber",  minHoldMs: 4000, persistent: false },
  dead_letters:           { priority: 85,  icon: "exclamationmark.icloud.fill",             tone: "amber",  minHoldMs: 800,  persistent: true  },
  disconnected_was_worn:  { priority: 80,  icon: "antenna.radiowaves.left.and.right.slash", tone: "amber",  minHoldMs: 800,  persistent: true  },
  stale_sync:             { priority: 75,  icon: "clock.badge.exclamationmark",             tone: "amber",  minHoldMs: 800,  persistent: true  },
  app_update:             { priority: 70,  icon: "arrow.down.circle.fill",                  tone: "teal",   minHoldMs: 800,  persistent: true  },
  low_power_paused:       { priority: 65,  icon: "bolt.slash",                              tone: "gray",   minHoldMs: 800,  persistent: true  },
  ble_connecting:         { priority: 60,  icon: "wave.3.left",                             tone: "blue",   minHoldMs: 2000, persistent: false },
  ble_syncing:            { priority: 55,  icon: "arrow.triangle.2.circlepath",             tone: "blue",   minHoldMs: 1500, persistent: false },
  pipeline_running:       { priority: 50,  icon: "chart.line.uptrend.xyaxis",               tone: "blue",   minHoldMs: 1500, persistent: false },
  upload_draining:        { priority: 45,  icon: "arrow.up.circle",                         tone: "teal",   minHoldMs: 1000, persistent: false },
  synced_confirm:         { priority: 40,  icon: "checkmark.circle.fill",                   tone: "green",  minHoldMs: 8000, persistent: false },
  offline_with_backlog:   { priority: 35,  icon: "wifi.slash",                              tone: "gray",   minHoldMs: 2000, persistent: true  },
  battery_low:            { priority: 30,  icon: "battery.25",                              tone: "amber",  minHoldMs: 800,  persistent: true  },
  alarm_armed_soon:       { priority: 25,  icon: "alarm",                                   tone: "indigo", minHoldMs: 800,  persistent: true  },
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
    s.connectionState === "ready" &&
    s.lastSyncAt != null &&
    s.now - s.lastSyncAt > ONE_DAY_MS },
  { state: "app_update",            test: (s) => s.isAppUpdateAvailable },
  { state: "low_power_paused",      test: (s) => s.isLowPowerMode && s.pendingCount > 0 },
  { state: "ble_connecting",        test: (s) =>
    s.connectionState === "scanning" ||
    s.connectionState === "connecting" ||
    s.connectionState === "discovering" },
  { state: "ble_syncing",           test: (s) => s.connectionState === "ready" && s.bleIsSyncing },
  { state: "pipeline_running",      test: (s) => s.pipelineState === "running" },
  { state: "upload_draining",       test: (s) => s.queueIsSyncing && s.pendingCount > 0 },
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

export function deriveCandidates(snapshot: AccessorySnapshot): AccessoryState[] {
  return PREDICATES.filter((p) => p.test(snapshot)).map((p) => p.state)
}

export const DISMISSABLE_STATES: ReadonlySet<AccessoryState> = new Set<AccessoryState>([
  "sync_error",
  "ble_error",
  "disconnected_was_worn",
  "stale_sync",
  "low_power_paused",
  "offline_with_backlog",
  "battery_low",
  "alarm_armed_soon",
])

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
