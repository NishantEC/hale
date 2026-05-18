# Bottom Accessory — Activity Strip

## Problem

The app's native iOS tab bar (`NativeTabs` from `expo-router/unstable-native-tabs`) has an unused iOS 26 surface: `NativeTabs.BottomAccessory`, the pill that sits above the tab bar (think Apple Music mini-player, Maps nav banner). We want to use it as an *activity strip* — the single source of truth for "what is the most important thing happening with my strap and my data, right now."

Wearable apps have a unique trust problem: the device is invisible, the user can't tell whether data is being collected, moving to the phone, uploading, or stuck. Trust signals are scattered across the Inspector tab, modal errors, and Settings. The activity strip closes that loop in the one piece of real estate iOS gives us for ambient persistent status.

## Decision

A single-slot activity strip mounted on the iOS tab bar (iOS 26+ only) with these rules:

- **Hybrid visibility**: hidden when truly idle; appears whenever any of 16 named states is active; lingers ~8 s with a green confirmation after a successful sync, then collapses back to idle.
- **One state at a time**: a priority-ordered selector picks the single highest-precedence state from the current signal snapshot.
- **No live biometrics**: no real-time heart rate, no live stress, no battery percentage that isn't actionably low. The strip surfaces *events* and *trust signals*, not telemetry.
- **Tap is always meaningful**: every state routes somewhere useful (Inspector for sync, Settings for device, dismiss for active alarm, etc.).
- **iOS < 26 / Android**: surface is omitted entirely. No polyfill.

## State Catalog

Highest priority → lowest. Only the highest-precedence currently-active state is displayed.

| # | State | Trigger predicate | Copy (regular) | Icon (SF Symbol) | Tone | Tap → | Hold rule |
|---|---|---|---|---|---|---|---|
| 1 | `alarm_firing` | `strapAlarmArmed && strapAlarmAt ≤ now` | "Alarm — Tap to dismiss" | `alarm.fill` | red | dismiss on strap | until dismissed |
| 2 | `ble_error` | `BleContext.error != null` | "Strap error — {short msg}" | `exclamationmark.triangle.fill` | red | Inspector | min 4 s, until cleared |
| 3 | `sync_error` | `syncError != null \|\| pipelineState === 'failed'` | "Sync failed — Tap to retry" | `exclamationmark.icloud` | amber | Inspector → retry | min 4 s, dismiss after next success or 12 s cap |
| 4 | `dead_letters` | `deadCount > 0` | "{N} records didn't upload" | `exclamationmark.icloud.fill` | amber | Inspector | persistent until `deadCount === 0` |
| 5 | `disconnected_was_worn` | `connectionState === 'disconnected'` AND was-worn within session AND `elapsed > 90 s` | "Strap disconnected" | `antenna.radiowaves.left.and.right.slash` | amber | Settings → Device | until reconnect |
| 6 | `stale_sync` | `now − lastSyncAt > 24 h` AND `connectionState === 'connected'` | "Last sync {relative}" | `clock.badge.exclamationmark` | amber | Inspector → Sync now | until successful sync |
| 7 | `app_update` | `Updates.isUpdateAvailable === true` (already prefetched in `SyncContext`) | "App update ready · Restart" | `arrow.down.circle.fill` | teal | `Updates.reloadAsync()` | persistent until applied |
| 8 | `low_power_paused` | `Battery.isLowPowerModeEnabled === true` AND `pendingCount > 0` | "Low Power Mode · sync paused" | `bolt.slash` | gray | open iOS Settings | until off |
| 9 | `ble_connecting` | `connectionState === 'scanning' \|\| 'connecting'` | "Connecting to strap…" | `wave.3.left` | blue | Settings → Device | min 2 s |
| 10 | `ble_syncing` | `connectionState === 'connected' && BleContext.isSyncing` | "Syncing · {N of M}" or stage label | `arrow.triangle.2.circlepath` (spinning) | blue | Inspector | min 1.5 s |
| 11 | `pipeline_running` | `pipelineState === 'running'` | "Crunching scores…" | `chart.line.uptrend.xyaxis` | blue | Inspector | min 1.5 s |
| 12 | `upload_draining` | `SyncContext.isSyncing === true && pendingCount > 0` | "Uploading {N} records" | `arrow.up.circle` | teal | Inspector | min 1 s |
| 13 | `synced_confirm` | edge: `pipelineState: running → success` OR `pendingCount → 0` after drain | "Synced — {N} nights · {M} stages" | `checkmark.circle.fill` | green | Health | fixed 8 s linger, then `idle` |
| 14 | `offline_with_backlog` | `!isOnline && pendingCount > 0` | "Offline · {N} waiting" | `wifi.slash` | gray | Inspector | min 2 s, until online or queue empty |
| 15 | `battery_low` | `batteryLevel < 20 && !isCharging` | "Strap battery low · {pct}%" | `battery.25` | amber | Settings → Device | until charging or > threshold |
| 16 | `alarm_armed_soon` | `strapAlarmArmed && (strapAlarmAt − now) < 1 h && (strapAlarmAt − now) > 0` | "Alarm at {time}" | `alarm` | indigo | Health → Sleep | until alarm fires or window passes |
| — | `idle` | none of the above | *(hidden — accessory collapsed)* | — | — | — |

### Tone palette

Resolved against `LOCAL_THEME` (light/dark) at render time:

- **red** — destructive / interrupting (errors, active alarm)
- **amber** — warning / needs attention (failed records, stale, disconnected, low battery)
- **teal** — actionable improvement (app update, uploads in flight)
- **blue** — in-progress activity (connecting, syncing, pipeline)
- **green** — confirmation (synced)
- **indigo** — armed-and-scheduled
- **gray** — passive / informational (offline, low-power-mode)

### Inline placement (when iOS shrinks the bar)

`NativeTabs.BottomAccessory.usePlacement()` returns `"inline"` when iOS collapses the bar (e.g., scroll-minimize). Width is roughly one tab — render icon only, optionally with a ≤ 6-character suffix:

| State family | Inline content |
|---|---|
| error (states 2–3) | `exclamationmark.triangle` |
| dead letters (4) | icon + `{N}` |
| in-progress (9–12) | spinner icon + `{pct}%` if known |
| confirm (13) | `checkmark.circle.fill` |
| persistent warning (5–6, 8, 14, 15) | icon only |
| alarm (1, 16) | icon only |
| update (7) | icon only |

Branch with a separate render tree, not CSS-squeezed copy.

## State Machine

```
signals (BleContext + SyncContext)
    │
    ▼
candidateSelector(snapshot) → State enum   // pure, derived
    │
    ▼  (debounced 300 ms via useDeferredValue/setTimeout)
reducer(displayed, candidate)              // enforces hold times
    │
    ▼
displayedState  ──▶  <AccessoryView />
```

### Rules

1. **Priority preemption**: a higher-priority candidate replaces a lower-priority displayed state *instantly*, ignoring the current state's hold time. (Errors must never wait behind a syncing chip.)
2. **Hold time on downward transitions**: a lower-priority candidate must wait `minHoldFor(displayed)` ms before it can replace `displayed`. Per-state holds are in the table above. Default for unspecified states is 800 ms.
3. **Anti-flicker debounce**: candidate output is debounced 300 ms before reaching the reducer, killing the 80 ms churn that occurs when BLE→sync→pipeline→queue all fire within one user tap.
4. **Hard-suppressed ping-pong**: track `(prevState, currentState, entryTime)`; block any transition where `newCandidate === prevState && now − entryTime < 2000 ms`. Specifically:
   - `ble_syncing → pipeline_running → ble_syncing` within 3 s: hold `ble_syncing`.
   - `upload_draining → offline_with_backlog → upload_draining` within 2 s: hold `upload_draining`.
5. **Confirmation gate**: `synced_confirm` only enters when `pipelineState` transitions `running → success` OR `pendingCount` transitions `>0 → 0` immediately after a `SyncContext.isSyncing` cycle. Never enters from `idle`.
6. **Error sticky**: `sync_error` and `ble_error` enforce a 4 s minimum hold. They auto-dismiss when (a) the underlying signal clears, or (b) a successful sync occurs after the error timestamp. Cap at 12 s total to avoid stale-pinning.
7. **Persistent states**: `dead_letters`, `disconnected_was_worn`, `app_update`, `battery_low`, `stale_sync` do not auto-dismiss — they remain displayed until their predicate flips.

## Engineering Structure

### File layout

```
apps/app/app/components/ActivityStrip/
  ActivityStrip.tsx           // the rendered accessory pill (regular + inline)
  useActivityStripState.ts    // selector + reducer, exposes { state, copy, icon, tone, onPress }
  states.ts                   // the 16-state enum, predicates, copy/icon/tone tables
  activityStrip.test.ts       // state selector + reducer unit tests
```

Mounted in `apps/app/src/app/(app)/(tabs)/_layout.tsx`:

```tsx
<NativeTabs ...>
  {Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26 && (
    <NativeTabs.BottomAccessory>
      <ActivityStrip />
    </NativeTabs.BottomAccessory>
  )}
  <NativeTabs.Trigger name="index" />
  ...
</NativeTabs>
```

### `useActivityStripState`

- Subscribes to `BleContext` + `SyncContext` via the existing `useContext` hooks but immediately derives a narrow snapshot object with only the ~15 fields the selector reads. This snapshot is the input to `useDeferredValue` + `useMemo`, so HR ticks and other irrelevant updates do not propagate.
- The returned `state` object is shallow-stable across re-renders that don't change it — `ActivityStrip` is wrapped in `React.memo`.
- Hold-time logic is implemented as a `useReducer` with action `CANDIDATE_CHANGED`; the reducer reads `Date.now()` to enforce holds.
- A single `useEffect` consumes the debounced candidate and dispatches.

### `ActivityStrip`

- Reads `placement = NativeTabs.BottomAccessory.usePlacement()`.
- Reads `{state, copy, icon, tone, onPress}` from `useActivityStripState()`.
- When `state === 'idle'`, returns `null` (or a zero-height view — see Mount lifecycle below).
- Renders an `Animated.View` with cross-dissolve (`opacity` + tiny `scale`) on state changes; respects `AccessibilityInfo.isReduceMotionEnabled`.
- Icon is an SF Symbol via `expo-symbols`; spinner is implemented as a 1 s linear rotation, gated by reduce-motion.
- Pressable area = full pill. Press routes via `expo-router` for tab/Settings/Inspector destinations. The alarm-firing case calls `BleContext.disarmAlarm()` (the existing BLE command); if a dedicated "dismiss currently-firing alarm" command is needed, add it to `BleContext` as part of this work.

### Mount lifecycle

Per engineer brief: **always keep the `<NativeTabs.BottomAccessory>` mounted to avoid tab-bar layout jank**. The `ActivityStrip` itself returns `null` when state is `idle` — UIKit will collapse the accessory to zero-height cleanly (verify in simulator). Do NOT conditionally include/exclude the `<NativeTabs.BottomAccessory>` node based on idle-ness.

iOS-version gating is still conditional rendering of the node, but only at the outer Platform check — never flickers during normal operation.

### Modal / sheet conflict

- `journal-entry` (modal), `sleep-planner` (formSheet): tab bar (and accessory) is covered by the sheet's dimming layer — no special handling.
- Pushed full-screen stack screens (`sleep-detail`, `home-metric`, etc.): UIKit hides the tab bar automatically; accessory goes with it. No special handling.

### Accessibility

- Container view sets `accessibilityLiveRegion="polite"`.
- On state *transitions* (not on every progress tick), call `AccessibilityInfo.announceForAccessibility(announcementCopyFor(state))`.
- All text uses `allowFontScaling`. At accessibility text sizes, the regular pill falls back to icon-only rendering (same code path as inline placement).
- Reduce Motion disables spinner animation and cross-dissolve, switches to instant replacement.

## Out of Scope

- Live heart-rate / stress / biometric display.
- A "calm baseline" that shows when truly idle. (Hybrid hide-when-idle is the chosen behavior.)
- Strap firmware update detection — no version-check service exists yet; revisit when it does.
- Android equivalent. (`NativeTabs.BottomAccessory` does not render on Android; the surface is iOS-only by design.)
- iOS < 26 polyfill (e.g., custom RN banner above the tab bar). Old-iOS users get no strip.
- Charging-progress display (battery-low only).

## Testing

- **Unit**: `activityStrip.test.ts` covers the selector (every state's predicate fires correctly given a signal snapshot) and the reducer (priority preemption, hold times, anti-flicker suppression, confirmation lingering).
- **Visual prototype**: a developer-only screen (mounted under Inspector or a dev route) that lets us preview every state side by side. Picks state from a list and renders the strip with mocked `copy/icon/tone`. Validates regular + inline. (Tracked as the next deliverable after this spec.)
- **Simulator manual checks**:
  - Mount the accessory while idle, confirm it collapses without tab-bar jank.
  - Trigger a sync with throttled network, confirm transitions don't flicker.
  - Force an error then a successful sync, confirm error clears after success.
  - Toggle Low Power Mode mid-queue, confirm `low_power_paused` appears.
  - Rotate to inline (scroll-minimize), confirm content collapses to icon-only.
