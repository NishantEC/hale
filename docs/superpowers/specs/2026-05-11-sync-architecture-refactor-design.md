# Sync Architecture Refactor — Design Spec
*2026-05-11*

---

## 1. Problem Statement

The current sync and data-flow architecture has four correctness bugs and three structural problems that compound each other.

**Correctness bugs**
1. **Split-brain auth token.** `AuthProvider` stores the JWT in MMKV under `AuthProvider.authToken`. `noopClient.ts` mirrors it into a module-level variable via `setSessionToken()`, called from `_layout.tsx`. `backgroundSync.ts` reads from AsyncStorage key `sessionToken`. These three stores diverge on every cold start — background drains fire with `null` token, fail, and burn through the 10-attempt retry budget, turning queue items dead before the foreground ever uploads them.
2. **Dead-letter blocking re-enqueue.** Once a queue row reaches 10 failures it is dead. `enqueueOutbound` used `onConflictDoNothing`, so any future enqueue for the same `(tableName, rowId)` silently does nothing — 508 items were permanently stuck. *(Fixed in commit `31e5ff51` — `onConflictDoUpdate` now revives dead rows.)*
3. **`queueDepth` counted dead rows.** The backfill guard `if (depth === 0)` never fired when dead rows inflated the count. *(Fixed in same commit.)*
4. **No network awareness.** Drains fire on a 15 s timer even when the device is offline. Every offline attempt burns a retry.

**Structural problems**
1. `_layout.tsx` (269 lines) does DB init, i18n, SyncService wiring, BLE packet drain, Android foreground service, and background task registration — all in `useEffect` chains.
2. `DashboardContext.tsx` (1 333 lines) conflates BLE connection management (scanning, connecting, packet parsing, realtime HR, alarms) with dashboard data fetching (homeView, sleepView, view cache). These are independent concerns.
3. Three near-duplicate drain implementations: foreground SyncService, `backgroundSync.ts`, `androidForegroundService.ts`.

---

## 2. Goals

- Auth token has one source of truth, readable synchronously by background tasks.
- Drains never fire when offline or in low-power mode.
- BLE state and dashboard data live in separate, independently testable providers.
- `_layout.tsx` does nothing but bootstrap and compose providers.
- One drain implementation reused in every execution context.
- OTA updates checked and downloaded automatically on foreground.
- AsyncStorage removed entirely; replaced by expo-secure-store (JWT) and expo-sqlite/kv-store (all other key-value).

---

## 3. Expo Packages Used

| Package | Purpose |
|---|---|
| `expo-secure-store` | JWT auth token — iOS Keychain / Android Keystore |
| `expo-sqlite/kv-store` | Replace AsyncStorage for all simple key-value (sync timestamps, prefs) |
| `expo-network` | `addNetworkStateListener` — skip drains when offline |
| `expo-battery` | `addLowPowerModeListener` — throttle drains on low battery |
| `expo-updates` | OTA bundle update check on foreground |
| `expo-background-task` | Already used — background catchup drain (kept) |
| `expo-task-manager` | Already used — task definition (kept) |

---

## 4. Provider Tree

```
_layout.tsx  (bootstrap only — DB init + i18n, ~60 lines)
  └── AuthProvider          MMKV-free; SecureStore JWT; syncs noopClient on change
      └── SyncProvider      SyncService + network + battery + OTA
          └── DashboardProvider   homeView / sleepView / cache / date nav
              └── BleProvider     scan / connect / packets / realtime HR / alarms
                  └── HealthKitProvider
                      └── ThemeProvider
                          └── NavigationThemeProvider + Stack
```

DashboardProvider sits *above* BleProvider so that `BleProvider` can call `useDashboard()` to invoke `refreshDashboard` after a sync completes. BleProvider is a data producer; DashboardProvider is the data consumer and view layer.

---

## 5. Auth Token Unification

### Storage
- **Remove** MMKV storage of auth token (`AuthProvider.authToken` MMKV key deleted).
- **Add** `expo-secure-store` as the single store under key `noop.authToken`.
- Secure store has a synchronous `SecureStore.getItem()` that blocks the JS thread briefly — acceptable for background task bootstrap, which already does sync I/O.

### AuthProvider changes
```ts
// On mount: load token from SecureStore
const [authToken, setAuthTokenState] = useState<string | null>(null)
useEffect(() => {
  SecureStore.getItemAsync('noop.authToken').then(t => setAuthTokenState(t ?? null))
}, [])

// On change: write SecureStore + sync noopClient
const setAuthToken = async (token: string | null) => {
  if (token) await SecureStore.setItemAsync('noop.authToken', token)
  else await SecureStore.deleteItemAsync('noop.authToken')
  setSessionToken(token)          // noopClient module var — always in sync
  setActiveUserId(token ? authEmail : null)
  setAuthTokenState(token)
}

// On logout
const logout = () => {
  setAuthToken(null)
  wipeDatabaseForLogout()
}
```

### backgroundSync.ts changes
```ts
// Before: AsyncStorage.getItem('sessionToken')  ← wrong key, wrong store
// After:
const token = SecureStore.getItem('noop.authToken')  // synchronous variant
if (!token) return { ok: false, drained: 0, reason: 'no-session' }
setSessionToken(token)
```

### noopClient.ts
- `setSessionToken` stays exactly as is — module-level variable, set by AuthProvider.
- Remove all AsyncStorage import and usage from noopClient. The module no longer writes auth state anywhere; AuthProvider owns it.

---

## 6. Key-Value Storage — Replace AsyncStorage

All remaining AsyncStorage usage (sync timestamps, device preferences) migrates to `expo-sqlite/kv-store`. Same API (`getItem` / `setItem` / `removeItem`), no migration needed (values are transient — losing them on first run is fine).

Files affected: `DashboardContext.tsx` (LAST_SYNC_KEY, REALTIME_HR_KEY, BROADCAST_HR_KEY, RAW_STREAM_KEY), `backgroundSync.ts` (already gone after auth fix).

---

## 7. Unified Drain Loop

### Current state (three duplicates)
- `_layout.tsx` SyncService `drainFn` — backfill check + `drainOnce`
- `backgroundSync.ts` `runBackgroundDrain` — deadline loop + `drainOnce`
- `androidForegroundService.ts` — interval loop + `runBackgroundDrain`

### New `uplinkDrainer.ts` export
```ts
/**
 * Drain the outbound queue until empty or deadline reached.
 * Backfills unsynced raw records before the first drain cycle.
 * Returns total rows drained.
 */
export async function drainLoop(
  db: NoopDatabase,
  opts: { post: PostFn; batchSize?: number; maxMs?: number }
): Promise<{ drained: number }>
```

`drainLoop` inlines the backfill + `drainOnce` loop from all three callers. Every execution context calls `drainLoop` with the same `post` function; the only difference is `maxMs` (background tasks pass 25 000, foreground passes `undefined` for unbounded).

---

## 8. SyncProvider (`app/context/SyncContext.tsx`)

### Responsibilities
- Own the `SyncService` instance (foreground 15 s interval drain + pull).
- Track network state via `Network.addNetworkStateListener`.
- Track low-power mode via `Battery.addLowPowerModeListener`.
- Skip drain when `!isInternetReachable || isLowPowerMode`.
- Check for OTA updates via `Updates.checkForUpdateAsync()` on foreground.
- Register the background catchup task.
- Start/stop Android foreground service on BLE connection state changes (receives a `bleConnectionState` prop or reads from BleContext).
- Expose sync status for UI (Sync Inspector, home screen).

### Context shape
```ts
type SyncContextValue = {
  isOnline: boolean
  isSyncing: boolean
  lastDrainAt: number | null
  pendingCount: number
  deadCount: number
  syncError: string | null
  refresh: () => Promise<void>   // drain + pull immediately
}
```

### Network + battery gating
```ts
const drainFn = useCallback(async () => {
  if (!peekActiveUserId()) return
  if (!isOnlineRef.current) return
  if (isLowPowerRef.current) return
  await drainLoop(db, {
    post: (tableName, payloads) =>
      apiPost('/pipeline/ingest-table', { tableName, rows: payloads }),
    batchSize: 200,
  })
}, [db])
```

### OTA update check
```ts
AppState.addEventListener('change', async (state) => {
  if (state !== 'active') return
  svc.refresh()
  retentionSweep()
  // OTA
  try {
    const update = await Updates.checkForUpdateAsync()
    if (update.isAvailable) await Updates.fetchUpdateAsync()
  } catch { /* non-fatal */ }
})
```

---

## 9. BleProvider (`app/context/BleContext.tsx`)

Extracted from `DashboardContext`. Owns everything BLE.

### State
```ts
type BleContextValue = {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  isCharging: boolean
  isBusy: boolean
  firmwareVersion: string | null
  deviceClock: Date | null
  isWorn: boolean
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  lastSyncAt: string | null
  scannedDevices: ScannedDevice[]
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  // actions
  scan: () => Promise<void>
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  refreshStrapMetadata: () => Promise<void>
  toggleRealtimeHeartRate: (enabled: boolean) => Promise<void>
  toggleBroadcastHeartRate: (enabled: boolean) => Promise<void>
  toggleRawDataStreaming: (enabled: boolean) => Promise<void>
  armAlarm: () => Promise<void>
  disarmAlarm: () => Promise<void>
  testAlarm: () => Promise<void>
}
```

### Key moves from DashboardContext
- All `bleManager.*` calls
- All `parseBatteryLevel`, `parseVersionInfo`, `parseDeviceClock`, `parseScheduledAlarm`, `parseRealtimeHeartRate`, `normalizeBatteryRaw` functions
- `commandService`, `eventForwarder`, `realtimeForwarder`, `consoleLogForwarder` instances
- `autoConnect`, `onConnectionStateChange`, `onPacket` subscriptions
- `syncNow` (BLE download → local ingest → `runPipeline` → `refreshDashboard` callback)
- Auto-sync timer (2-min interval)
- Device preference persistence (kv-store keys)

`syncNow` calls `refreshDashboard()` obtained from `useDashboard()` — BleProvider is a child of DashboardProvider in the tree, so it can call `useDashboard()` directly without prop threading.

---

## 10. DashboardProvider (leaner `DashboardContext.tsx`)

After BLE extraction: ~350 lines (from 1 333).

### Responsibilities
- `selectedDate` state + navigation helpers.
- `homeView` / `sleepView` — cache-first load, then API, then legacy fallback.
- `refreshDashboard` — called by BleProvider after sync completes.
- `saveSleepPlan`.
- Error state.
- Journal entry fetch on date change (delegated to a `useJournalEntries` hook).

### Context shape
```ts
type DashboardContextValue = {
  selectedDate: string
  homeView: HomeViewModel | null
  sleepView: SleepViewModel | null
  isRefreshing: boolean
  error: string | null
  setSelectedDate: (date: string) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  refreshDashboard: () => Promise<void>
  saveSleepPlan: (input: SleepPlanInput) => Promise<void>
  clearError: () => void
}
```

Uses `expo-sqlite/kv-store` for view cache timestamps (already done via `viewCache` repository).

---

## 11. `_layout.tsx` — Thin Bootstrap

After extraction, `_layout.tsx` does exactly three things:

1. **i18n** — `initI18n()` + `loadDateFnsLocale()`.
2. **DB** — `runMigrations()` with retry + wipe-on-failure alert.
3. **Provider composition** — renders the provider tree from §4.

No sync logic. No BLE logic. No useEffects beyond the two above. Target: ~70 lines.

---

## 12. Error Handling

| Layer | Strategy |
|---|---|
| Drain failure | `recordOutboundFailure` increments attempts. Dead-letter revived on next enqueue (`onConflictDoUpdate`). |
| Network loss | `isOnlineRef` gates drain — no attempt made, no retry consumed. |
| 401 from backend | `requestJson` calls `clearSession()`. AuthProvider detects null token → navigates to login. |
| BLE packet parse error | Swallowed locally; device state unchanged. Logged as warn. |
| OTA fetch error | Swallowed. Non-fatal — embedded bundle continues running. |
| DB migration failure | Alert with Retry + Reset options (current behaviour kept). |
| View API failure | `isViewsApiUnavailable` check → legacy `/pipeline/results` fallback (current behaviour kept). |

---

## 13. File Inventory

### New files
| File | Description |
|---|---|
| `app/context/SyncContext.tsx` | SyncProvider + `useSyncContext` hook |
| `app/context/BleContext.tsx` | BleProvider + `useBle` hook |

### Heavily modified
| File | Change |
|---|---|
| `app/context/AuthContext.tsx` | SecureStore JWT; inline `setSessionToken` + `setActiveUserId` sync |
| `app/context/DashboardContext.tsx` | Remove all BLE code (~950 lines removed); keep data fetching |
| `app/src/app/_layout.tsx` | Strip to ~70 lines — bootstrap + provider tree only |
| `app/services/sync/uplinkDrainer.ts` | Add `drainLoop` function |
| `app/services/sync/backgroundSync.ts` | SecureStore auth read; call `drainLoop` |
| `app/services/sync/androidForegroundService.ts` | Call `drainLoop` directly |

### Lightly modified
| File | Change |
|---|---|
| `app/services/sync/backgroundCatchupTask.ts` | Call `drainLoop` |
| `app/services/api/noopClient.ts` | Remove AsyncStorage import + session write |
| `app/services/db/repositories/outboundQueue.ts` | Already fixed (`onConflictDoUpdate`, live `queueDepth`) |

### Deleted
| File | Reason |
|---|---|
| AsyncStorage dependency for auth | Replaced by SecureStore |
| MMKV `AuthProvider.authToken` key | Replaced by SecureStore |

---

## 14. Install / Dependencies

```bash
npx expo install expo-secure-store expo-network expo-updates
# expo-battery, expo-sqlite already installed
```

`expo-sqlite/kv-store` is a sub-path export of the already-installed `expo-sqlite` — no new package install needed.

---

## 15. Out of Scope (follow-up)

- `expo-sqlite` `SQLiteProvider` + `useSQLiteContext()` — replaces `openDatabase()` singleton. Correct long-term pattern but touches every repository file. Separate spec.
- `expo-notifications` — push notifications for sync completion / anomalies.
- Full test suite for BleProvider and SyncProvider.
