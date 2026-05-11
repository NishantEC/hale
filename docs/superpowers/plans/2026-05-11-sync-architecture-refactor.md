# Sync Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four correctness bugs (split-brain auth, dead-letter blocking, offline drain burns retries, queueDepth counting dead rows) and restructure the app into focused providers with a single drain loop.

**Architecture:** `AuthProvider → SyncProvider → DashboardProvider → BleProvider` — each provider owns a single concern. Auth uses expo-secure-store as the one token store. All drain callers share a unified `drainLoop()`. Network + battery gate every drain.

**Tech Stack:** expo-secure-store, expo-network, expo-battery, expo-updates, expo-sqlite/kv-store, Drizzle ORM, React Native/Expo SDK 55.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `app/context/SyncContext.tsx` | SyncService + network/battery gating + OTA + bg task registration |
| `app/context/BleContext.tsx` | All BLE state and actions, extracted from DashboardContext |

### Heavily modified
| File | Change |
|---|---|
| `app/services/sync/uplinkDrainer.ts` | Add `drainLoop()` that wraps backfill + drainOnce loop |
| `app/services/sync/backgroundSync.ts` | Use SecureStore for auth; call `drainLoop` |
| `app/services/sync/backgroundCatchupTask.ts` | Call `drainLoop` instead of `runBackgroundDrain` |
| `app/services/sync/androidForegroundService.ts` | Call `drainLoop` instead of `runBackgroundDrain` |
| `app/services/api/noopClient.ts` | Remove AsyncStorage + MMKV; add session-cleared callback; `login`/`register` return token string |
| `app/context/AuthContext.tsx` | SecureStore JWT; call `setSessionToken` on every token change; register session-cleared callback |
| `app/context/DashboardContext.tsx` | Remove ~950 lines of BLE code; keep only data fetching + date nav |
| `app/src/app/_layout.tsx` | Strip to ~70 lines — bootstrap + provider tree only |

### Lightly modified (consumer screens)
12 screens split their `useDashboard()` call into `useDashboard()` + `useBle()` where they use BLE fields.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/app/package.json` (via expo install)

- [ ] **Step 1: Install new expo packages**

```bash
cd apps/app
npx expo install expo-secure-store expo-network expo-updates expo-battery
```

Expected output ends with: `✔ Dependencies installed`

- [ ] **Step 2: Verify expo-sqlite/kv-store is available (no install needed)**

`expo-sqlite/kv-store` is a subpath export of `expo-sqlite` which is already installed. Verify:

```bash
node -e "require('expo-sqlite/kv-store'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json apps/app/package-lock.json
git commit -m "chore: install expo-secure-store, expo-network, expo-battery, expo-updates"
```

---

## Task 2: Unified Drain Loop

**Files:**
- Modify: `app/services/sync/uplinkDrainer.ts`

The current file has `drainOnce` which processes one batch. All three callers (foreground SyncService, backgroundSync, androidForegroundService) each implement their own loop + backfill logic. Extract that loop here.

- [ ] **Step 1: Read the current file**

`app/services/sync/uplinkDrainer.ts` — note `drainOnce` signature:
```ts
export async function drainOnce(db: NoopDatabase, opts: DrainOptions): Promise<void>
// opts: { post: (tableName, payloads) => Promise<unknown>, batchSize: number }
```

- [ ] **Step 2: Add `drainLoop` below `drainOnce`**

Open `app/services/sync/uplinkDrainer.ts` and append this export after the existing `drainOnce`:

```ts
export interface DrainLoopOptions {
  post: (tableName: string, payloads: unknown[]) => Promise<unknown>
  batchSize?: number
  maxMs?: number
}

export async function drainLoop(
  db: NoopDatabase,
  opts: DrainLoopOptions,
): Promise<{ drained: number }> {
  const { post, batchSize = 200, maxMs } = opts
  const deadline = maxMs != null ? Date.now() + maxMs : Infinity

  // Backfill unsynced raw sensor records into the outbound queue before draining.
  try {
    const { backfillUnsyncedRawSensorRecords } = await import(
      "../db/repositories/rawSensorRecord"
    )
    await backfillUnsyncedRawSensorRecords(db, batchSize)
  } catch (err) {
    console.warn("[drainLoop] backfill failed", err)
  }

  let totalDrained = 0
  while (Date.now() < deadline) {
    const { queueDepth } = await import("../db/repositories/outboundQueue")
    const before = await queueDepth(db)
    if (before === 0) break
    await drainOnce(db, { post, batchSize })
    const after = await queueDepth(db)
    totalDrained += Math.max(0, before - after)
    if (after >= before) break
  }
  return { drained: totalDrained }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/services/sync/uplinkDrainer.ts
git commit -m "feat(sync): add drainLoop — unified backfill + drain with optional deadline"
```

---

## Task 3: Update Background Drain Callers

**Files:**
- Modify: `app/services/sync/backgroundSync.ts`
- Modify: `app/services/sync/backgroundCatchupTask.ts`
- Modify: `app/services/sync/androidForegroundService.ts`

All three currently call `drainOnce` or `runBackgroundDrain` with their own loop. After this task they all call `drainLoop`. `backgroundSync.ts` also gets the SecureStore auth fix.

- [ ] **Step 1: Rewrite `backgroundSync.ts`**

Replace the entire file content:

```ts
import * as SecureStore from "expo-secure-store"
import { openDatabase, runMigrations } from "../db"
import { setSessionToken } from "../api/noopClient"
import { drainLoop } from "./uplinkDrainer"

export async function runBackgroundDrain(maxMs = 25_000): Promise<{
  ok: boolean
  drained: number
  reason?: string
}> {
  const token = SecureStore.getItem("noop.authToken")
  if (!token) return { ok: false, drained: 0, reason: "no-session" }
  setSessionToken(token)

  await runMigrations()
  const db = openDatabase()

  const { drained } = await drainLoop(db, {
    post: async (tableName, payloads) => {
      const { apiPost } = await import("../api/noopClient")
      return apiPost("/pipeline/ingest-table", { tableName, rows: payloads })
    },
    batchSize: 200,
    maxMs,
  })
  return { ok: true, drained }
}
```

- [ ] **Step 2: Update `backgroundCatchupTask.ts`**

Replace the `runBackgroundDrain` import with `drainLoop` and call it directly. The task already runs migrations via `runBackgroundDrain` — we keep that via `runBackgroundDrain` for now since it also handles migrations. Actually keep calling `runBackgroundDrain` since it handles the SecureStore auth check + migrations. No change needed to this file — `runBackgroundDrain` is still exported.

Actually `backgroundCatchupTask.ts` already calls `runBackgroundDrain(25_000)` which will now use the new SecureStore + drainLoop internally after step 1. No changes needed.

- [ ] **Step 3: Update `androidForegroundService.ts`**

`androidForegroundService.ts` calls `runBackgroundDrain(20_000)` in its loop. After step 1, `runBackgroundDrain` already uses SecureStore + drainLoop. No changes needed.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in the files we touched (backgroundSync.ts, uplinkDrainer.ts).

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/services/sync/backgroundSync.ts
git commit -m "fix(sync): backgroundSync reads auth token from SecureStore, uses drainLoop"
```

---

## Task 4: Clean Up noopClient.ts

**Files:**
- Modify: `app/services/api/noopClient.ts`

Remove AsyncStorage and MMKV from noopClient. They existed only to:
1. Persist the session token (`AsyncStorage.setItem('sessionToken', ...)` in `login`/`register`)
2. Clear the session on 401 (`AsyncStorage.removeItem` + `mmkv.delete` in `clearSession`)

After this task: AuthProvider owns persistence. noopClient gets a `registerSessionClearedCallback` so AuthProvider can react to 401s. `login`/`register` return the token string instead of `boolean`.

- [ ] **Step 1: Remove AsyncStorage and MMKV imports + module-level instances**

In `app/services/api/noopClient.ts`:

Remove line 1:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
```

Remove lines 2-3:
```ts
import { MMKV } from 'react-native-mmkv';
```

Remove lines 8-9 (the `const mmkv = new MMKV()` block and its comment):
```ts
// Shared MMKV store used by AuthContext...
const mmkv = new MMKV();
```

- [ ] **Step 2: Add session-cleared callback**

After `let sessionToken: string | null = null;`, add:

```ts
let sessionClearedCallback: (() => void) | null = null

export function registerSessionClearedCallback(cb: () => void): void {
  sessionClearedCallback = cb
}
```

- [ ] **Step 3: Update `clearSession`**

Replace the current `clearSession` implementation:

Old:
```ts
async function clearSession() {
  sessionToken = null;
  await AsyncStorage.removeItem('sessionToken');
  try {
    mmkv.delete('AuthProvider.authToken');
    mmkv.delete('AuthProvider.authEmail');
  } catch {
    // best effort
  }
}
```

New:
```ts
function clearSession() {
  sessionToken = null
  sessionClearedCallback?.()
}
```

Note: now synchronous — no async I/O needed since AuthProvider handles persistence.

- [ ] **Step 4: Update `requestJson` call to `clearSession`**

Find `if (res.status === 401) { await clearSession(); }` and remove the `await`:

```ts
if (res.status === 401) {
  clearSession()
}
```

- [ ] **Step 5: Update `forceLogout`**

Old:
```ts
export async function forceLogout() {
  await clearSession();
}
```

New:
```ts
export function forceLogout() {
  clearSession()
}
```

- [ ] **Step 6: Remove `initAuth`**

Delete the function entirely:
```ts
export async function initAuth() {
  sessionToken = await AsyncStorage.getItem('sessionToken');
}
```

- [ ] **Step 7: Update `login` to return the token**

Old:
```ts
export async function login(email: string, password: string): Promise<boolean> {
  ...
  sessionToken = data.token;
  await AsyncStorage.setItem('sessionToken', data.token);
  return true;
}
```

New:
```ts
export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res)
    throw new AuthError(res.status, code, message)
  }
  const data = await res.json()
  if (!data?.token) {
    throw new AuthError(res.status, 'NO_TOKEN', 'Sign-in succeeded but the server returned no token.')
  }
  sessionToken = data.token
  return data.token
}
```

- [ ] **Step 8: Update `register` to return the token**

Old:
```ts
export async function register(email: string, password: string): Promise<boolean> {
  ...
  sessionToken = data.token;
  await AsyncStorage.setItem('sessionToken', data.token);
  return true;
}
```

New:
```ts
export async function register(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: withBaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password, name: email }),
  })
  if (!res.ok) {
    const { code, message } = await readAuthErrorBody(res)
    throw new AuthError(res.status, code, message)
  }
  const data = await res.json()
  sessionToken = data.token
  return data.token
}
```

- [ ] **Step 9: Remove the `logout` export** (now handled by AuthProvider)

Delete:
```ts
export async function logout() {
  await clearSession();
}
```

- [ ] **Step 10: Update LoginScreen to use token return value**

In `app/screens/LoginScreen.tsx`:

Remove the `AsyncStorage` import (line referencing `AsyncStorage.getItem("sessionToken")`).

Replace the auth call block (~lines 66–78):

Old:
```ts
if (isSignUp) {
  await apiRegister(normalizedEmail, authPassword)
} else {
  await apiLogin(normalizedEmail, authPassword)
}
const token = await AsyncStorage.getItem("sessionToken")
if (!token) {
  setAuthError("Sign-in succeeded but no session token was stored.")
  return
}
setIsSubmitted(false)
setAuthPassword("")
setAuthToken(token)
```

New:
```ts
const token = isSignUp
  ? await apiRegister(normalizedEmail, authPassword)
  : await apiLogin(normalizedEmail, authPassword)
setIsSubmitted(false)
setAuthPassword("")
setAuthToken(token)
```

- [ ] **Step 11: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors in noopClient.ts or LoginScreen.tsx.

- [ ] **Step 12: Commit**

```bash
git add apps/app/app/services/api/noopClient.ts apps/app/app/screens/LoginScreen.tsx
git commit -m "refactor(auth): remove AsyncStorage/MMKV from noopClient; login/register return token; add session-cleared callback"
```

---

## Task 5: Migrate AuthContext to expo-secure-store

**Files:**
- Modify: `app/context/AuthContext.tsx`

Currently uses `useMMKVString("AuthProvider.authToken")` which can't be read synchronously by background tasks. Replace with expo-secure-store under key `noop.authToken`. Also wire the session-cleared callback so 401s from noopClient trigger logout without circular deps.

- [ ] **Step 1: Rewrite `AuthContext.tsx`**

Replace the entire file:

```tsx
import * as SecureStore from "expo-secure-store"
import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import { setActiveUserId } from "@/services/db/session"
import { wipeDatabaseForLogout } from "@/services/db/wipe"
import {
  registerSessionClearedCallback,
  setSessionToken,
} from "@/services/api/noopClient"

const SECURE_TOKEN_KEY = "noop.authToken"
const MMKV_EMAIL_KEY = "AuthProvider.authEmail"

export type AuthContextType = {
  isAuthenticated: boolean
  authToken: string | null
  authEmail: string | null
  setAuthToken: (token: string | null) => Promise<void>
  setAuthEmail: (email: string) => void
  logout: () => void
  validationError: string
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [authToken, setAuthTokenState] = useState<string | null>(null)
  const [authEmail, setAuthEmailState] = useState<string | null>(null)

  // Load persisted token and email on mount.
  useEffect(() => {
    SecureStore.getItemAsync(SECURE_TOKEN_KEY).then((t) => {
      if (t) setAuthTokenState(t)
    })
    // Email still lives in MMKV (it's not sensitive — no Keychain needed).
    // We read it via the MMKV JS bindings synchronously.
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      const email = mmkv.getString(MMKV_EMAIL_KEY)
      if (email) setAuthEmailState(email)
    } catch {
      // MMKV unavailable on first install — no email to restore.
    }
  }, [])

  // Keep noopClient module var in sync with every token state change.
  useEffect(() => {
    setSessionToken(authToken)
    setActiveUserId(authToken && authEmail ? authEmail : null)
  }, [authToken, authEmail])

  // Register once so 401 responses from noopClient trigger local logout
  // without creating a circular import (noopClient → AuthProvider).
  useEffect(() => {
    registerSessionClearedCallback(() => {
      setAuthTokenState(null)
      setActiveUserId(null)
    })
  }, [])

  const setAuthToken = useCallback(async (token: string | null) => {
    if (token) {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token)
    } else {
      await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY)
    }
    setAuthTokenState(token)
  }, [])

  const setAuthEmail = useCallback((email: string) => {
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      mmkv.set(MMKV_EMAIL_KEY, email)
    } catch {
      // best effort
    }
    setAuthEmailState(email)
  }, [])

  const logout = useCallback(() => {
    void setAuthToken(null)
    setAuthEmailState(null)
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      mmkv.delete(MMKV_EMAIL_KEY)
    } catch {
      // best effort
    }
    void wipeDatabaseForLogout().catch((err) =>
      console.warn("[auth] db wipe failed", err),
    )
  }, [setAuthToken])

  const validationError = useMemo(() => {
    if (!authEmail || authEmail.length === 0) return "can't be blank"
    if (authEmail.length < 6) return "must be at least 6 characters"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail))
      return "must be a valid email address"
    return ""
  }, [authEmail])

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: !!authToken,
      authToken,
      authEmail,
      setAuthToken,
      setAuthEmail,
      logout,
      validationError,
    }),
    [authToken, authEmail, setAuthToken, setAuthEmail, logout, validationError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
```

- [ ] **Step 2: Fix AuthContextType consumers**

`authToken` type changed from `string | undefined` to `string | null`. Check if any consumer does a strict `=== undefined` check:

```bash
grep -r "authToken.*undefined\|undefined.*authToken" apps/app/app --include="*.tsx" --include="*.ts"
```

If any results: replace `authToken === undefined` with `authToken == null` in those files.

Also `authEmail` changed from `string | undefined` to `string | null`. Check:

```bash
grep -r "authEmail.*undefined\|undefined.*authEmail" apps/app/app --include="*.tsx" --include="*.ts"
```

- [ ] **Step 3: Remove `setSessionToken` useEffect from DashboardContext**

`DashboardContext.tsx` line ~1032 has:
```ts
useEffect(() => {
  setSessionToken(authToken)
}, [authToken])
```

Delete this `useEffect` block (AuthProvider now handles it). Also remove the `setSessionToken` import from DashboardContext if it's only used there.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/context/AuthContext.tsx apps/app/app/context/DashboardContext.tsx
git commit -m "feat(auth): migrate AuthContext to expo-secure-store; wire 401 callback; sync noopClient on every token change"
```

---

## Task 6: Create SyncContext.tsx

**Files:**
- Create: `app/context/SyncContext.tsx`

Owns SyncService, network + battery gating, OTA, background task registration, and the "drain on background" AppState listener. SyncProvider sits above DashboardProvider and BleProvider in the tree.

- [ ] **Step 1: Create `app/context/SyncContext.tsx`**

```tsx
import * as Battery from "expo-battery"
import * as Network from "expo-network"
import * as Updates from "expo-updates"
import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"

import { peekActiveUserId } from "@/services/db/session"
import { openDatabase } from "@/services/db"
import { apiGet, apiPost } from "@/services/api/noopClient"
import { pullDownlink } from "@/services/sync/downlinkPuller"
import { sweepRetention } from "@/services/sync/retentionSweeper"
import { drainLoop } from "@/services/sync/uplinkDrainer"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import { registerBackgroundCatchupTask } from "@/services/sync/backgroundCatchupTask"
import { setViewCache } from "@/services/db/repositories/viewCache"
import {
  DEFAULT_RAW_RETENTION_DAYS,
  SETTING_RAW_RETENTION_DAYS,
  getSetting,
} from "@/services/db/repositories/settings"
import { SyncService } from "@/services/sync/SyncService"

type SyncContextValue = {
  isOnline: boolean
  isSyncing: boolean
  lastDrainAt: number | null
  pendingCount: number
  deadCount: number
  syncError: string | null
  refresh: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export const SyncProvider: FC<PropsWithChildren<{ isDbReady: boolean }>> = ({
  children,
  isDbReady,
}) => {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastDrainAt, setLastDrainAt] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [deadCount, setDeadCount] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)

  const isOnlineRef = useRef(true)
  const isLowPowerRef = useRef(false)

  const drainFn = useCallback(async () => {
    if (!peekActiveUserId()) return
    if (!isOnlineRef.current) return
    if (isLowPowerRef.current) return

    const db = openDatabase()
    setIsSyncing(true)
    setSyncError(null)
    try {
      await drainLoop(db, {
        post: (tableName, payloads) =>
          apiPost("/pipeline/ingest-table", { tableName, rows: payloads }),
        batchSize: 200,
      })
      setLastDrainAt(Date.now())

      const { queueDepth, listDeadLetters } = await import(
        "@/services/db/repositories/outboundQueue"
      )
      const [pending, dead] = await Promise.all([
        queueDepth(db),
        listDeadLetters(db).then((rows) => rows.length),
      ])
      setPendingCount(pending)
      setDeadCount(dead)
    } catch (err: any) {
      setSyncError(err?.message ?? "Sync failed")
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const pullFn = useCallback(async () => {
    if (!peekActiveUserId()) return
    const db = openDatabase()
    await pullDownlink(db, {
      apiGet: async (path) => apiGet(path),
      tables: [
        "daily_metrics",
        "daily_scores",
        "sleep_detections",
        "sleep_stages",
        "night_features",
        "signal_samples",
        "activity_detections",
        "baseline_profile",
        "sleep_plans",
      ],
    })
    const today = new Date().toISOString().slice(0, 10)
    try {
      const [home, sleep, trends] = await Promise.all([
        apiGet(`/views/home?date=${today}`),
        apiGet(`/views/sleep?date=${today}`),
        apiGet(`/views/trends?days=30`),
      ])
      await setViewCache(db, "home", today, home)
      await setViewCache(db, "sleep", today, sleep)
      await setViewCache(db, "trends", "30d", trends)
    } catch (err) {
      console.warn("[sync] view cache refresh failed", err)
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([drainFn(), pullFn()])
  }, [drainFn, pullFn])

  useEffect(() => {
    if (!isDbReady) return

    const svc = new SyncService({ drainFn, pullFn, intervalMs: 15_000 })
    svc.start()

    // Network awareness
    Network.getNetworkStateAsync().then((state) => {
      const online = state.isInternetReachable ?? true
      isOnlineRef.current = online
      setIsOnline(online)
    })
    const unsubNetwork = Network.addNetworkStateListener((state) => {
      const online = state.isInternetReachable ?? true
      isOnlineRef.current = online
      setIsOnline(online)
    })

    // Battery awareness
    Battery.isLowPowerModeEnabledAsync().then((enabled) => {
      isLowPowerRef.current = enabled
    })
    const unsubBattery = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
      isLowPowerRef.current = lowPowerMode
    })

    // Background catchup task
    registerBackgroundCatchupTask().catch((err) =>
      console.warn("[bg-catchup] register failed", err),
    )

    // AppState: foreground → refresh + retention; background → drain flush
    let isBackground = AppState.currentState !== "active"
    const appStateSub = AppState.addEventListener("change", async (next) => {
      const wasForeground = !isBackground
      isBackground = next !== "active"

      if (next === "active") {
        await svc.refresh()
        try {
          const db = openDatabase()
          const raw =
            Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) ||
            DEFAULT_RAW_RETENTION_DAYS
          if (raw > 0) await sweepRetention(db, { rawDays: raw })
        } catch (err) {
          console.warn("[sync] retention sweep failed", err)
        }
        // OTA
        try {
          const update = await Updates.checkForUpdateAsync()
          if (update.isAvailable) await Updates.fetchUpdateAsync()
        } catch {
          // non-fatal
        }
      }

      if (wasForeground && isBackground) {
        runBackgroundDrain(15_000).catch((err) =>
          console.warn("[bg-flush-on-background] failed", err),
        )
      }
    })

    return () => {
      svc.stop()
      unsubNetwork.remove()
      unsubBattery.remove()
      appStateSub.remove()
    }
  }, [isDbReady, drainFn, pullFn])

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isSyncing,
      lastDrainAt,
      pendingCount,
      deadCount,
      syncError,
      refresh,
    }),
    [isOnline, isSyncing, lastDrainAt, pendingCount, deadCount, syncError, refresh],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) throw new Error("useSyncContext must be used within SyncProvider")
  return context
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | grep "SyncContext" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/context/SyncContext.tsx
git commit -m "feat: add SyncContext with network/battery gating, OTA check, and background drain"
```

---

## Task 7: Create BleContext.tsx

**Files:**
- Create: `app/context/BleContext.tsx`

Extract all BLE code from DashboardContext.tsx into a new dedicated provider. BleProvider sits below DashboardProvider in the tree so it can call `useDashboard()` to invoke `refreshDashboard` after sync. It also handles Android foreground service start/stop and the per-packet background drain.

- [ ] **Step 1: Create `app/context/BleContext.tsx`**

```tsx
import KVStore from "expo-sqlite/kv-store"
import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"

import {
  bleManager,
  CommandNumber,
  CommandService,
  ConnectionState,
  ConsoleLogLineForwarder,
  createEventForwarder,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
  RealtimeSessionForwarder,
  ScannedDevice,
  uint8ArrayToBase64,
  WhoopPacket,
} from "@/services/ble"
import type { DeviceEventPayload } from "@/services/ble"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import {
  startAndroidForegroundService,
  stopAndroidForegroundService,
} from "@/services/sync/androidForegroundService"
import { historicalRecordToRawRow, ingestBleRecords } from "@/services/sync/bleIngest"
import { runPipeline, fetchResults, SeriesPoint } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { useDashboard } from "@/context/DashboardContext"
import { useAuth } from "@/context/AuthContext"

const LAST_SYNC_KEY = "noop.lastSyncTimestamp"
const REALTIME_HR_KEY = "noop.prefersRealtimeHeartRate"
const BROADCAST_HR_KEY = "noop.prefersBroadcastHeartRate"
const RAW_STREAM_KEY = "noop.prefersRawDataStream"

export type SyncSummary = {
  nights: number
  stages: number
  scores: number
}

type BleDeviceState = {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  isCharging: boolean
  isBusy: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
}

export type BleContextValue = {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  isCharging: boolean
  isBusy: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
  scannedDevices: ScannedDevice[]
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  error: string | null
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
  clearError: () => void
}

const BleContext = createContext<BleContextValue | null>(null)

// Module-level singletons — safe because BleProvider is mounted once.
const commandService = new CommandService()
const eventForwarder = createEventForwarder()
const consoleLogForwarder = new ConsoleLogLineForwarder()
const realtimeForwarder = new RealtimeSessionForwarder()

const emptyDeviceState: BleDeviceState = {
  connectionState: "disconnected",
  deviceName: null,
  batteryLevel: null,
  isCharging: false,
  isBusy: false,
  isRealtimeHeartRateEnabled: true,
  isBroadcastHeartRateEnabled: true,
  isRawDataStreamingEnabled: true,
  realtimeHeartRate: null,
  realtimeSamples: [],
  strapAlarmAt: null,
  strapAlarmArmed: false,
  isWorn: true,
  lastSyncAt: null,
  firmwareVersion: null,
  deviceClock: null,
}

// ── Packet parsers (extracted from DashboardContext) ──────────────────────────

function parseUint32LE(data: Uint8Array, offset: number) {
  if (offset + 3 >= data.length) return null
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  )
}

function readUint16LE(data: Uint8Array, offset: number) {
  if (offset + 1 >= data.length) return null
  return data[offset] | (data[offset + 1] << 8)
}

function normalizeBatteryRaw(raw: number): number | null {
  if (raw <= 100) return raw
  if (raw <= 1000) return Math.round(raw / 10)
  if (raw >= 3000 && raw <= 4300) {
    return Math.round(Math.max(0, Math.min(100, ((raw - 3300) / 900) * 100)))
  }
  if (raw <= 10000) return Math.round(raw / 100)
  if (raw <= 100000) return Math.round(raw / 1000)
  return null
}

function parseBatteryLevel(packet: WhoopPacket) {
  if (packet.command !== CommandNumber.GetBatteryLevel || packet.data.length < 2) return null
  const rawAt0 = readUint16LE(packet.data, 0)
  const normAt0 = rawAt0 != null ? normalizeBatteryRaw(rawAt0) : null
  if (packet.data.length >= 4) {
    const rawAt2 = readUint16LE(packet.data, 2)
    const normAt2 = rawAt2 != null ? normalizeBatteryRaw(rawAt2) : null
    if (normAt0 != null && normAt2 != null) return Math.min(normAt0, normAt2)
    return normAt2 ?? normAt0
  }
  return normAt0
}

function parseVersionInfo(packet: WhoopPacket): string | null {
  if (packet.command !== CommandNumber.ReportVersionInfo) return null
  if (packet.data.length < 3 + 8 * 4) return null
  const values: number[] = []
  for (let i = 0; i < 8; i++) {
    const v = parseUint32LE(packet.data, 3 + i * 4)
    if (v == null) return null
    values.push(v)
  }
  const harvard = values.slice(0, 4).join(".")
  const boylston = values.slice(4, 8).join(".")
  return `${harvard} / ${boylston}`
}

function parseDeviceClock(packet: WhoopPacket): Date | null {
  if (packet.command !== CommandNumber.GetClock || packet.data.length < 6) return null
  const unix = parseUint32LE(packet.data, 2)
  if (unix == null || unix === 0) return null
  return new Date(unix * 1000)
}

function parseScheduledAlarm(packet: WhoopPacket, now = new Date()) {
  if (packet.command !== CommandNumber.GetScheduledAlarm) return null
  const nowUnix = Math.floor(now.getTime() / 1000)
  const lowerBound = nowUnix - 365 * 24 * 60 * 60
  const upperBound = nowUnix + 365 * 24 * 60 * 60
  for (let offset = 0; offset <= Math.min(16, packet.data.length - 4); offset += 1) {
    const value = parseUint32LE(packet.data, offset)
    if (value == null || value === 0) continue
    if (value >= lowerBound && value <= upperBound) {
      return new Date(value * 1000).toISOString()
    }
  }
  return null
}

function parseRealtimeHeartRate(packet: WhoopPacket) {
  if (packet.type !== PacketType.RealtimeData || packet.data.length <= 5) return null
  const heartRate = packet.data[5]
  return heartRate > 0 ? heartRate : null
}

function nextAlarmDate(alarmMinutes: number) {
  const now = new Date()
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(alarmMinutes / 60),
    alarmMinutes % 60,
    0,
    0,
  )
  if (next <= now) next.setDate(next.getDate() + 1)
  return next
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const BleProvider: FC<PropsWithChildren> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  const { refreshDashboard, sleepView } = useDashboard()

  const [deviceState, setDeviceState] = useState<BleDeviceState>(emptyDeviceState)
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStage, setSyncStage] = useState("")
  const [syncProgress, setSyncProgress] = useState<DownloadProgress | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastAutoSyncAttemptAt = useRef<number>(0)

  const clearError = useCallback(() => setError(null), [])

  const refreshDeviceState = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildGetBatteryLevel())
      await bleManager.writeCommand(commandService.buildGetHelloHarvard())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      await bleManager.writeCommand(commandService.buildReportVersionInfo())
      await bleManager.writeCommand(commandService.buildGetClock())
      await bleManager.writeCommand(commandService.buildToggleRealtimeHR(true))
      await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(true))
      await bleManager.writeCommand(commandService.buildStartRawData())
    } catch {
      // best-effort
    }
  }, [])

  const persistPreference = useCallback(async (key: string, value: boolean) => {
    await KVStore.setItemAsync(key, JSON.stringify(value))
  }, [])

  const scan = useCallback(async () => {
    setError(null)
    setScannedDevices([])
    try {
      const allowed = await bleManager.requestPermissions()
      if (!allowed) throw new Error("Bluetooth permission was denied")
      await bleManager.startScan((device) => {
        setScannedDevices((current) => {
          if (current.some((c) => c.id === device.id)) return current
          return [...current, device]
        })
      })
    } catch (err: any) {
      setError(err?.message ?? "Unable to scan for WHOOP devices")
    }
  }, [])

  const connect = useCallback(
    async (deviceId: string) => {
      setError(null)
      try {
        await bleManager.connect(deviceId)
        setDeviceState((current) => ({
          ...current,
          deviceName: bleManager.getDeviceName() || "WHOOP",
        }))
        await refreshDeviceState()
      } catch (err: any) {
        setError(err?.message ?? "Connection failed")
      }
    },
    [refreshDeviceState],
  )

  const disconnect = useCallback(async () => {
    await bleManager.disconnect()
  }, [])

  const syncNow = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before syncing.")
      return
    }

    setIsSyncing(true)
    setSyncStage("Downloading from strap…")
    setSyncSummary(null)
    setError(null)

    try {
      const downloader = new HistoryDownloader()
      const records = await downloader.startDownload(setSyncProgress)
      setSyncProgress((current) => ({
        state: "complete",
        chunksReceived: current?.chunksReceived ?? 0,
        recordsParsed: records.length,
        totalBytes: current?.totalBytes ?? 0,
      }))

      const lastSyncAt = new Date().toISOString()
      await KVStore.setItemAsync(LAST_SYNC_KEY, lastSyncAt)
      setDeviceState((current) => ({ ...current, lastSyncAt }))

      if (records.length > 0) {
        setSyncStage(`Writing ${records.length} records locally…`)
        const db = openDatabase()
        const mapped = records.map(historicalRecordToRawRow)
        await ingestBleRecords(db, mapped)

        setSyncStage("Running pipeline…")
        await runPipeline()

        setSyncStage("Refreshing views…")
        const results = await fetchResults()
        setSyncSummary({
          nights: results.sleepDetections?.length ?? 0,
          stages: results.sleepStages?.length ?? 0,
          scores: results.dailyScores?.length ?? 0,
        })
      }

      await refreshDashboard()
    } catch (err: any) {
      setError(err?.message ?? "Sync failed")
    } finally {
      setIsSyncing(false)
      setSyncStage("")
    }
  }, [refreshDashboard])

  const maybeAutoSync = useCallback(async () => {
    if (!isAuthenticated || isSyncing || bleManager.connectionState !== "ready") return
    const now = Date.now()
    if (now - lastAutoSyncAttemptAt.current < 60_000) return
    if (deviceState.lastSyncAt) {
      const lastMs = new Date(deviceState.lastSyncAt).getTime()
      if (!Number.isNaN(lastMs) && now - lastMs < 3 * 60_000) return
    }
    lastAutoSyncAttemptAt.current = now
    await syncNow()
  }, [isAuthenticated, isSyncing, deviceState.lastSyncAt, syncNow])

  const toggleRealtimeHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: enabled }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        return
      }
      try {
        await bleManager.writeCommand(commandService.buildToggleRealtimeHR(enabled))
        setDeviceState((current) => ({
          ...current,
          isRealtimeHeartRateEnabled: enabled,
          realtimeHeartRate: enabled ? current.realtimeHeartRate : null,
          realtimeSamples: enabled ? current.realtimeSamples : [],
        }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (err: any) {
        setError(err?.message ?? "Failed to toggle realtime heart rate")
      }
    },
    [persistPreference],
  )

  const toggleBroadcastHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
        return
      }
      try {
        await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(enabled))
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
      } catch (err: any) {
        setError(err?.message ?? "Failed to toggle broadcast heart rate")
      }
    },
    [persistPreference],
  )

  const toggleRawDataStreaming = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        return
      }
      try {
        await bleManager.writeCommand(
          enabled ? commandService.buildStartRawData() : commandService.buildStopRawData(),
        )
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (err: any) {
        setError(err?.message ?? "Failed to toggle raw data stream")
      }
    },
    [persistPreference],
  )

  const armAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready" || !sleepView) {
      setError("Connect your WHOOP strap before arming the strap alarm.")
      return
    }
    const alarmDate = nextAlarmDate(sleepView.planner.alarmMinutes)
    try {
      await bleManager.writeCommand(commandService.buildSetScheduledAlarm(alarmDate))
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: alarmDate.toISOString(),
        strapAlarmArmed: true,
      }))
      await refreshDashboard()
    } catch (err: any) {
      setError(err?.message ?? "Failed to arm strap alarm")
    }
  }, [sleepView, refreshDashboard])

  const disarmAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before disarming the strap alarm.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildClearScheduledAlarm())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: null,
        strapAlarmArmed: false,
      }))
      await refreshDashboard()
    } catch (err: any) {
      setError(err?.message ?? "Failed to disarm strap alarm")
    }
  }, [refreshDashboard])

  const testAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before testing the alarm.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildRunAlarm())
    } catch (err: any) {
      setError(err?.message ?? "Failed to trigger strap alarm")
    }
  }, [])

  // Load persisted prefs from kv-store on mount.
  useEffect(() => {
    KVStore.getItemAsync(LAST_SYNC_KEY).then((lastSyncAt) => {
      if (lastSyncAt) setDeviceState((current) => ({ ...current, lastSyncAt }))
    })
    Promise.all([
      KVStore.getItemAsync(REALTIME_HR_KEY),
      KVStore.getItemAsync(BROADCAST_HR_KEY),
      KVStore.getItemAsync(RAW_STREAM_KEY),
    ]).then(([rt, bcast, raw]) => {
      setDeviceState((current) => ({
        ...current,
        isRealtimeHeartRateEnabled: rt != null ? JSON.parse(rt) : current.isRealtimeHeartRateEnabled,
        isBroadcastHeartRateEnabled:
          bcast != null ? JSON.parse(bcast) : current.isBroadcastHeartRateEnabled,
        isRawDataStreamingEnabled: raw != null ? JSON.parse(raw) : current.isRawDataStreamingEnabled,
      }))
    })
  }, [])

  // BLE connection + packet subscriptions.
  useEffect(() => {
    bleManager.autoConnect().catch(() => undefined)

    const unsubState = bleManager.onConnectionStateChange((connectionState) => {
      setDeviceState((current) => {
        if (connectionState === "disconnected") {
          return {
            ...emptyDeviceState,
            deviceName: current.deviceName,
            isRealtimeHeartRateEnabled: current.isRealtimeHeartRateEnabled,
            isBroadcastHeartRateEnabled: current.isBroadcastHeartRateEnabled,
            isRawDataStreamingEnabled: current.isRawDataStreamingEnabled,
            lastSyncAt: current.lastSyncAt,
          }
        }
        return {
          ...current,
          connectionState,
          isBusy: connectionState !== "ready",
          deviceName: bleManager.getDeviceName() || current.deviceName,
        }
      })

      if (connectionState === "ready") {
        startAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] start failed", err),
        )
        eventForwarder.start()
        realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        consoleLogForwarder.start(bleManager.getDeviceId() || "unknown")
        refreshDeviceState().catch(() => undefined)
        maybeAutoSync().catch(() => undefined)
      } else if (connectionState === "disconnected") {
        stopAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] stop failed", err),
        )
      }
    })

    let bgDebounceTimer: ReturnType<typeof setTimeout> | null = null
    let isBackground = AppState.currentState !== "active"
    const appStateSub = AppState.addEventListener("change", (next) => {
      isBackground = next !== "active"
    })

    const unsubPackets = bleManager.onPacket("*", (packet) => {
      // Reconcile stale disconnected state on first packet after reconnect.
      setDeviceState((current) => {
        if (current.connectionState === "disconnected") {
          return {
            ...current,
            connectionState: "ready" as ConnectionState,
            isBusy: false,
            deviceName: bleManager.getDeviceName() || current.deviceName,
          }
        }
        return current
      })

      // Battery
      const parsedBattery =
        packet.type === PacketType.CommandResponse ? parseBatteryLevel(packet) : null
      if (parsedBattery != null) {
        setDeviceState((current) => ({ ...current, batteryLevel: parsedBattery }))
      }

      // Charging
      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetHelloHarvard &&
        packet.data.length > 7
      ) {
        setDeviceState((current) => ({ ...current, isCharging: packet.data[7] !== 0 }))
      }

      // Alarm
      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetScheduledAlarm
      ) {
        const scheduledAlarm = parseScheduledAlarm(packet)
        setDeviceState((current) => ({
          ...current,
          strapAlarmAt: scheduledAlarm,
          strapAlarmArmed: scheduledAlarm != null,
        }))
      }

      if (packet.type === PacketType.CommandResponse) {
        const version = parseVersionInfo(packet)
        if (version != null) setDeviceState((current) => ({ ...current, firmwareVersion: version }))
        const clock = parseDeviceClock(packet)
        if (clock != null) setDeviceState((current) => ({ ...current, deviceClock: clock }))
        if (packet.command === CommandNumber.GetHelloHarvard && packet.data.length > 116) {
          setDeviceState((current) => ({ ...current, isWorn: packet.data[116] !== 0 }))
        }
      }

      if (packet.type === PacketType.Event) {
        if (packet.command === EventNumber.ChargingOn) {
          setDeviceState((current) => ({ ...current, isCharging: true }))
        } else if (packet.command === EventNumber.ChargingOff) {
          setDeviceState((current) => ({ ...current, isCharging: false }))
        } else if (packet.command === EventNumber.StrapDrivenAlarmSet) {
          setDeviceState((current) => ({ ...current, strapAlarmArmed: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROn) {
          setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROff) {
          setDeviceState((current) => ({
            ...current,
            isRealtimeHeartRateEnabled: false,
            realtimeHeartRate: null,
            realtimeSamples: [],
          }))
        } else if (packet.command === EventNumber.RawDataCollectionOn) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: true }))
        } else if (packet.command === EventNumber.RawDataCollectionOff) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: false }))
        } else if (packet.command === EventNumber.WristOn) {
          setDeviceState((current) => ({ ...current, isWorn: true }))
        } else if (packet.command === EventNumber.WristOff) {
          setDeviceState((current) => ({ ...current, isWorn: false }))
        }

        const deviceId = bleManager.getDeviceId() || "unknown"
        eventForwarder.push({
          deviceId,
          eventNumber: packet.command,
          eventName: EventNumber[packet.command] ?? `unknown_${packet.command}`,
          rawPayload: packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          capturedAt: new Date().toISOString(),
        })
      }

      const realtimeHR = parseRealtimeHeartRate(packet)
      if (realtimeHR != null) {
        const sample = { timestamp: new Date().toISOString(), value: realtimeHR }
        setDeviceState((current) => ({
          ...current,
          realtimeHeartRate: realtimeHR,
          realtimeSamples: [...current.realtimeSamples.slice(-39), sample],
        }))
        realtimeForwarder.pushHR(
          realtimeHR,
          packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          sample.timestamp,
        )
      }

      if (
        packet.type === PacketType.RealtimeIMUStream ||
        packet.type === PacketType.HistoricalIMUStream
      ) {
        console.log(
          `[IMU] ${packet.type === PacketType.RealtimeIMUStream ? "realtime" : "historical"} IMU packet (${packet.data.length} bytes)`,
        )
      }

      if (packet.type === PacketType.ConsoleLogs && packet.data.length > 7) {
        const raw = packet.data.slice(7)
        const filtered: number[] = []
        for (let i = 0; i < raw.length; i++) {
          if (i + 2 < raw.length && raw[i] === 0x34 && raw[i + 1] === 0x00 && raw[i + 2] === 0x01) {
            i += 2
            continue
          }
          filtered.push(raw[i])
        }
        if (filtered.length > 0) {
          consoleLogForwarder.push(new TextDecoder().decode(new Uint8Array(filtered)))
        }
      }

      if (packet.type === PacketType.RealtimeRawData && packet.data.length > 0) {
        realtimeForwarder.pushRaw(null, uint8ArrayToBase64(packet.data), new Date().toISOString())
      }

      // Per-packet background drain when app is in background.
      if (isBackground) {
        if (bgDebounceTimer) clearTimeout(bgDebounceTimer)
        bgDebounceTimer = setTimeout(() => {
          runBackgroundDrain(15_000).catch((err) =>
            console.warn("[bg-packet-drain] failed", err),
          )
        }, 1500)
      }
    })

    const syncTimer = setInterval(() => {
      maybeAutoSync().catch(() => undefined)
    }, 2 * 60_000)

    return () => {
      unsubState()
      unsubPackets()
      appStateSub.remove()
      clearInterval(syncTimer)
      if (bgDebounceTimer) clearTimeout(bgDebounceTimer)
      eventForwarder.stop()
      realtimeForwarder.endSession()
      consoleLogForwarder.stop()
      stopAndroidForegroundService().catch(() => undefined)
    }
  }, [maybeAutoSync, refreshDeviceState])

  const value = useMemo<BleContextValue>(
    () => ({
      connectionState: deviceState.connectionState,
      deviceName: deviceState.deviceName,
      batteryLevel: deviceState.batteryLevel,
      isCharging: deviceState.isCharging,
      isBusy: deviceState.isBusy,
      isRealtimeHeartRateEnabled: deviceState.isRealtimeHeartRateEnabled,
      isBroadcastHeartRateEnabled: deviceState.isBroadcastHeartRateEnabled,
      isRawDataStreamingEnabled: deviceState.isRawDataStreamingEnabled,
      realtimeHeartRate: deviceState.realtimeHeartRate,
      realtimeSamples: deviceState.realtimeSamples,
      strapAlarmAt: deviceState.strapAlarmAt,
      strapAlarmArmed: deviceState.strapAlarmArmed,
      isWorn: deviceState.isWorn,
      lastSyncAt: deviceState.lastSyncAt,
      firmwareVersion: deviceState.firmwareVersion,
      deviceClock: deviceState.deviceClock,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshStrapMetadata: refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      clearError,
    }),
    [
      deviceState,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      clearError,
    ],
  )

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>
}

export function useBle() {
  const context = useContext(BleContext)
  if (!context) throw new Error("useBle must be used within BleProvider")
  return context
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | grep "BleContext" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/context/BleContext.tsx
git commit -m "feat: add BleContext — extract all BLE state and actions from DashboardContext"
```

---

## Task 8: Slim DashboardContext.tsx

**Files:**
- Modify: `app/context/DashboardContext.tsx`

Remove ~950 lines of BLE code. Keep only: date navigation, view fetching, cache, legacy fallback, saveSleepPlan, refreshDashboard. Also remove the `setSessionToken` useEffect (moved to AuthProvider in Task 5).

- [ ] **Step 1: Remove BLE imports**

Delete these import lines at the top of `DashboardContext.tsx`:

```ts
import {
  bleManager,
  CommandNumber,
  CommandService,
  ConnectionState,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
  createEventForwarder,
  RealtimeSessionForwarder,
  ConsoleLogLineForwarder,
  ScannedDevice,
  uint8ArrayToBase64,
  WhoopPacket,
} from "@/services/ble"
import type { DeviceEventPayload } from "@/services/ble"
```

Also remove:
```ts
import { historicalRecordToRawRow, ingestBleRecords } from "../services/sync/bleIngest"
import { runPipeline, setSessionToken, ... } from "@/services/api/noopClient"
```

Keep `runPipeline` only if `syncNow` needs it — but `syncNow` moves to BleContext. So remove `runPipeline` import from here. Keep only `fetchHomeView`, `fetchResults`, `fetchSleepView`, `HomeViewModel`, `PipelineResults`, `SleepPlanInput`, `SleepViewModel`, `updateSleepPlan`, `SeriesPoint` from noopClient.

Remove `AsyncStorage` import (device prefs move to BleContext kv-store; no AsyncStorage remains in DashboardContext).

- [ ] **Step 2: Update type definitions**

Remove `LiveDeviceState` type and `emptyDeviceState` constant.
Remove `SyncSummary` type (moved to BleContext).

Update `DashboardContextValue` to remove BLE fields:

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

- [ ] **Step 3: Remove module-level BLE singletons**

Delete:
```ts
const commandService = new CommandService()
const eventForwarder = createEventForwarder()
const consoleLogForwarder = new ConsoleLogLineForwarder()
const realtimeForwarder = new RealtimeSessionForwarder()
```

- [ ] **Step 4: Update provider body**

Remove from the `DashboardProvider` function body:
- `liveDeviceState`, `scannedDevices`, `isSyncing`, `syncStage`, `syncProgress`, `syncSummary` state vars
- `liveDeviceState` `useEffect` listeners (connection state, packets, auto-sync timer)
- `persistDevicePreference` callback
- `scan`, `connect`, `disconnect`, `syncNow`, `maybeAutoSync`
- `toggleRealtimeHeartRate`, `toggleBroadcastHeartRate`, `toggleRawDataStreaming`
- `armAlarm`, `disarmAlarm`, `testAlarm`
- `refreshDeviceState`
- The `useEffect` that loads `LAST_SYNC_KEY`, `REALTIME_HR_KEY`, etc. from AsyncStorage
- The `useEffect` that calls `setSessionToken(authToken)`
- Remove `liveDeviceState`, `scannedDevices`, `isSyncing`, `syncStage`, `syncProgress`, `syncSummary`, `refreshDeviceState` from the value object and its deps array

Keep:
- `selectedDate` state + `setSelectedDate`, `goToPreviousDay`, `goToNextDay`
- `homeView`, `sleepView`, `isRefreshing`, `error` state
- `loadDashboardForDate`, `refreshDashboard`
- `saveSleepPlan`
- `clearError`
- The `useAuth()` call (for `authToken`, `isAuthenticated`)
- The `useEffect` on `[isAuthenticated, loadDashboardForDate]`
- All the helper functions: `todayKey`, `dateFromKey`, `addDays`, `dayKeyForDate`, `formatSelectedDateTitle`, etc. (they're still used by DashboardContext itself OR were only used by BLE — verify and remove BLE-only ones)
- `buildLegacyHomeView`, `buildLegacySleepView`, `isViewsApiUnavailable` — keep (used in view fallback)
- Parser functions (`parseUint32LE`, `readUint16LE`, `normalizeBatteryRaw`, `parseBatteryLevel`, `parseVersionInfo`, `parseDeviceClock`, `parseScheduledAlarm`, `parseRealtimeHeartRate`, `nextAlarmDate`) — DELETE (moved to BleContext)

- [ ] **Step 5: Trim the value object and useMemo deps**

After removing all BLE fields, the simplified provider tail looks like:

```tsx
const value = useMemo<DashboardContextValue>(
  () => ({
    selectedDate,
    homeView,
    sleepView,
    isRefreshing,
    error,
    setSelectedDate,
    goToPreviousDay,
    goToNextDay,
    refreshDashboard,
    saveSleepPlan,
    clearError,
  }),
  [
    selectedDate,
    homeView,
    sleepView,
    isRefreshing,
    error,
    goToPreviousDay,
    goToNextDay,
    refreshDashboard,
    saveSleepPlan,
    clearError,
  ],
)

return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -40
```

If there are "property does not exist on type DashboardContextValue" errors in screens, that's expected — fix them in Task 9.

- [ ] **Step 7: Commit**

```bash
git add apps/app/app/context/DashboardContext.tsx
git commit -m "refactor: slim DashboardContext to data-fetching only — BLE code moved to BleContext"
```

---

## Task 9: Update Consumer Screens

**Files:**
- Modify: 8 screen files that use BLE fields from `useDashboard()`

For each screen: add `import { useBle } from "@/context/BleContext"`, split the `useDashboard()` destructuring, move BLE fields to `useBle()`.

Fields that come from `useBle()` (BleContext):
> `connectionState`, `deviceName`, `batteryLevel`, `isCharging`, `isBusy`, `firmwareVersion`, `deviceClock`, `isWorn`, `strapAlarmAt`, `strapAlarmArmed`, `isRealtimeHeartRateEnabled`, `isBroadcastHeartRateEnabled`, `isRawDataStreamingEnabled`, `realtimeHeartRate`, `realtimeSamples`, `lastSyncAt`, `scannedDevices`, `isSyncing`, `syncStage`, `syncProgress`, `syncSummary`, `scan`, `connect`, `disconnect`, `syncNow`, `refreshStrapMetadata`, `toggleRealtimeHeartRate`, `toggleBroadcastHeartRate`, `toggleRawDataStreaming`, `armAlarm`, `disarmAlarm`, `testAlarm`

Screens that also have a `error`/`clearError` on BleContext — BleContext now has its own `error` and `clearError`. Some screens use `error`/`clearError` from DashboardContext for view errors and separately may want BLE errors. Check per-screen to avoid double-reporting.

Fields from `useDashboard()` (DashboardContext):
> `selectedDate`, `homeView`, `sleepView`, `isRefreshing`, `error`, `setSelectedDate`, `goToPreviousDay`, `goToNextDay`, `refreshDashboard`, `saveSleepPlan`, `clearError`

Note: `BleContext` also has `error` + `clearError` for BLE-specific errors. Screens that showed BLE errors (DeviceScreen, DeviceSettingsScreen) should switch to `useBle().error`.

- [ ] **Step 1: DeviceScreen.tsx — BLE-only screen**

Old:
```ts
import { useDashboard } from "@/context/DashboardContext"
// ...
const {
  liveDeviceState,
  scannedDevices,
  isSyncing,
  syncStage,
  syncProgress,
  syncSummary,
  syncNow,
} = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const {
  connectionState,
  deviceName,
  batteryLevel,
  isCharging,
  realtimeHeartRate,
  scannedDevices,
  isSyncing,
  syncStage,
  syncProgress,
  syncSummary,
  syncNow,
} = useBle()
```

Update all references from `liveDeviceState.connectionState` → `connectionState`, `liveDeviceState.deviceName` → `deviceName`, etc.

- [ ] **Step 2: DeviceSettingsScreen.tsx — BLE-only screen**

Old:
```ts
import { useDashboard } from "@/context/DashboardContext"
// ...
const {
  liveDeviceState,
  scannedDevices,
  isSyncing,
  syncStage,
  syncProgress,
  scan,
  connect,
  disconnect,
  syncNow,
} = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const {
  connectionState,
  deviceName,
  batteryLevel,
  isCharging,
  scannedDevices,
  isSyncing,
  syncStage,
  syncProgress,
  scan,
  connect,
  disconnect,
  syncNow,
} = useBle()
```

Update all `liveDeviceState.X` → `X` references.

- [ ] **Step 3: DebugInspectorScreen.tsx — mixed**

Old:
```ts
const { selectedDate, refreshDashboard, syncNow } = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const { selectedDate, refreshDashboard } = useDashboard()
const { syncNow } = useBle()
```

- [ ] **Step 4: HomeScreen.tsx — mixed**

Old:
```ts
const {
  selectedDate,
  homeView,
  liveDeviceState,
  error,
  isRefreshing,
  isSyncing,
  goToNextDay,
  goToPreviousDay,
  refreshDashboard,
  clearError,
} = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const {
  selectedDate,
  homeView,
  error,
  isRefreshing,
  goToNextDay,
  goToPreviousDay,
  refreshDashboard,
  clearError,
} = useDashboard()
const { connectionState, realtimeHeartRate, isSyncing } = useBle()
```

Update `liveDeviceState.connectionState` → `connectionState`, etc.

- [ ] **Step 5: HomeDetailsScreen.tsx — mixed**

Old:
```ts
const { homeView, liveDeviceState } = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const { homeView } = useDashboard()
const { connectionState, realtimeHeartRate } = useBle()
```

Update `liveDeviceState.X` references.

- [ ] **Step 6: HomeMetricScreen.tsx — mixed**

Old:
```ts
const { homeView, sleepView, liveDeviceState } = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const { homeView, sleepView } = useDashboard()
const { connectionState, realtimeHeartRate, batteryLevel } = useBle()
```

Update `liveDeviceState.X` references.

- [ ] **Step 7: SleepPlannerScreen.tsx — mixed**

Old:
```ts
const { sleepView, liveDeviceState, saveSleepPlan, armAlarm, disarmAlarm } = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const { sleepView, saveSleepPlan } = useDashboard()
const { connectionState, isBusy, armAlarm, disarmAlarm } = useBle()
```

Update `liveDeviceState.connectionState` → `connectionState`, etc.

- [ ] **Step 8: SettingsScreen.tsx — mixed**

Old:
```ts
const { liveDeviceState } = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const { connectionState, deviceName, batteryLevel } = useBle()
```

Remove `useDashboard()` call if `liveDeviceState` was the only thing it destructured. Update `liveDeviceState.X` references.

- [ ] **Step 9: StrainActivityScreen.tsx — mixed**

Old:
```ts
const {
  homeView,
  liveDeviceState,
  isRefreshing,
  refreshDashboard,
  error,
  clearError,
  selectedDate,
  setSelectedDate,
} = useDashboard()
```

New:
```ts
import { useBle } from "@/context/BleContext"
// ...
const {
  homeView,
  isRefreshing,
  refreshDashboard,
  error,
  clearError,
  selectedDate,
  setSelectedDate,
} = useDashboard()
const { realtimeHeartRate } = useBle()
```

Update `liveDeviceState.realtimeHeartRate` → `realtimeHeartRate`.

- [ ] **Step 10: Verify TypeScript compiles cleanly**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -60
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add apps/app/app/screens/
git commit -m "refactor: consumer screens use useBle() for BLE state, useDashboard() for view data"
```

---

## Task 10: Rewrite _layout.tsx as Thin Bootstrap

**Files:**
- Modify: `app/src/app/_layout.tsx`

Remove all sync, BLE, and service-wiring logic. The layout does only three things: i18n init, DB migration, and provider tree composition.

- [ ] **Step 1: Write the new `_layout.tsx`**

Replace the entire file:

```tsx
/* eslint-disable import/first */
if (__DEV__) {
  require("../../app/devtools/ReactotronConfig.ts")
}
import "@/utils/gestureHandler"

import { useEffect, useState } from "react"
import { Alert } from "react-native"
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native"
import { Stack } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import { TamaguiProvider } from "tamagui"

import tamaguiConfig from "../../tamagui.config"
import { AuthProvider } from "@/context/AuthContext"
import { ToastProviderWithViewport } from "@/components/reactx/toast"
import { DashboardProvider } from "@/context/DashboardContext"
import { BleProvider } from "@/context/BleContext"
import { SyncProvider } from "@/context/SyncContext"
import { HealthKitProvider } from "@/context/HealthKitContext"
import { ThemeProvider, ThemedSubtree, useColorMode } from "@/context/ThemeContext"
import { initI18n } from "@/i18n"
import { useNavigationTheme } from "@/navigators/useNavigationTheme"
import { LOCAL_THEME } from "@/utils/localTheme"
import { loadDateFnsLocale } from "@/utils/formatDate"
import { runMigrations, wipeDatabase } from "@/services/db"

function RootStackLayout() {
  const navigationTheme = useNavigationTheme()
  useColorMode()

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <ThemedSubtree>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: LOCAL_THEME.colors.screenBackground,
            },
          }}
        />
      </ThemedSubtree>
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const [isDbReady, setIsDbReady] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  useEffect(() => {
    let cancelled = false
    const attempt = () => {
      runMigrations()
        .then(() => {
          if (!cancelled) setIsDbReady(true)
        })
        .catch((err) => {
          if (cancelled) return
          console.error("[db] migration failed", err)
          Alert.alert(
            "Local database error",
            `The on-device database failed to initialize.\n\n${String(err)}\n\nRetry, or reset local data to recover (pending un-synced data will be lost).`,
            [
              { text: "Retry", onPress: attempt },
              {
                text: "Reset local data",
                style: "destructive",
                onPress: async () => {
                  try {
                    await wipeDatabase()
                  } catch (wipeErr) {
                    console.error("[db] wipe failed", wipeErr)
                  }
                  attempt()
                },
              },
            ],
            { cancelable: false },
          )
        })
    }
    attempt()
    return () => {
      cancelled = true
    }
  }, [])

  if (!isI18nInitialized || !isDbReady) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
          <KeyboardProvider>
            <AuthProvider>
              <SyncProvider isDbReady={isDbReady}>
                <ThemeProvider>
                  <DashboardProvider>
                    <BleProvider>
                      <HealthKitProvider>
                        <ToastProviderWithViewport>
                          <RootStackLayout />
                        </ToastProviderWithViewport>
                      </HealthKitProvider>
                    </BleProvider>
                  </DashboardProvider>
                </ThemeProvider>
              </SyncProvider>
            </AuthProvider>
          </KeyboardProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd apps/app && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/_layout.tsx
git commit -m "refactor: _layout.tsx stripped to bootstrap only — SyncProvider + BleProvider added to tree"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Start the app in Expo Go / dev build**

```bash
cd apps/app && npx expo start
```

- [ ] **Step 2: Verify auth flow (cold start)**

1. Force-close and reopen the app.
2. Confirm login screen appears (token correctly absent from SecureStore on fresh install).
3. Log in — confirm dashboard loads.
4. Force-close and reopen — confirm you're still logged in (SecureStore persists across cold starts).

- [ ] **Step 3: Verify sync flow**

1. Open Sync Inspector (debug screen).
2. Confirm `pendingCount` and `deadCount` update as sync runs.
3. Put device in airplane mode — confirm drains stop firing (network gating working).
4. Re-enable network — confirm drains resume.

- [ ] **Step 4: Verify BLE flow**

1. Connect WHOOP strap.
2. Confirm device name, battery, firmware version appear.
3. Tap "Sync Data" — confirm sync completes and dashboard refreshes.
4. Disconnect — confirm state resets correctly.

- [ ] **Step 5: Verify 401 logout**

Simulate a 401 by temporarily revoking the token server-side or by clearing SecureStore directly in RN Debugger. Confirm the app navigates to login screen.

- [ ] **Step 6: Verify background drain (iOS)**

1. Lock phone with strap connected.
2. Wait 30 seconds.
3. Unlock — confirm in debug logs that `[bg-packet-drain]` fired.

- [ ] **Step 7: Check bundle size isn't regressed**

```bash
cd apps/app && npx expo export --platform ios 2>&1 | tail -5
```

- [ ] **Step 8: Final commit tag**

```bash
git tag v-sync-refactor-complete
```
