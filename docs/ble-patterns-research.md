# BLE Patterns & Architectures for React Native / Expo

Reference report for refactoring our WHOOP-talking BLE layer in the Expo app. All recommendations cite a source.

Scope: `react-native-ble-plx` on Expo SDK 50+ talking to a custom GATT service (WHOOP), with custom packet framing (CRC8/CRC32), notifications on multiple characteristics, and the usual production concerns (reconnect, background, testing).

---

## 1. Library landscape (2025/2026)

### react-native-ble-plx — the default choice

The dominant library. ~3.3-3.4k stars, ~90k weekly downloads, actively maintained by dotintent. Latest 3.x line. Supports scanning, multi-device connections, service/characteristic discovery, monitoring, RSSI, MTU negotiation, iOS background mode with state restoration. Does not support Bluetooth Classic, peripheral mode, bonding, or beacons.

Source: [LogRocket: Comparing React Native BLE libraries (Feb 2024)](https://blog.logrocket.com/comparing-react-native-ble-libraries/), [react-native-ble-plx README](https://github.com/dotintent/react-native-ble-plx).

### react-native-ble-manager — simpler alternative

~2.3k stars, ~45k weekly downloads. Innoveit. Simpler API surface, beacon support on both platforms. Lacks multi-device, advanced transactions, and raw packet handling. Generally recommended for simple consumer pairing flows — not what we need.

Source: [LogRocket comparison](https://blog.logrocket.com/comparing-react-native-ble-libraries/), [npm trends](https://npmtrends.com/react-native-ble-manager-vs-react-native-ble-plx).

### No official `expo-bluetooth` module

Despite repeated community asks, there is no Expo-built BLE module as of SDK 52/53/54. The Expo blog post and Expo's own config-plugins repo both endorse `react-native-ble-plx` as the de facto path; `@config-plugins/react-native-ble-plx` is no longer needed since the upstream library bundles its own config plugin.

Source: [Expo blog: BLE Powered Expo App](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app), [@config-plugins/react-native-ble-plx README (deprecated path note)](https://github.com/expo/config-plugins/blob/main/packages/react-native-ble-plx/README.md).

### Notable fork: sfourdrinier/react-native-ble-plx

A modernizing fork worth knowing about. Converts the codebase to TypeScript, targets RN 0.81.4+ and Expo SDK 54+, and ships a built-in `ConnectionManager` with retry, timeouts, exponential backoff, automatic reconnection on unexpected disconnects, Android foreground service support, and optional iOS state restoration. Latest release v3.7.10 (Dec 18, 2025), 883 commits on master. Specifically fixes promise coalescing hangs, memory leaks in auto-reconnect cleanup, connection storms, and races between cancel/reconnect.

Source: [sfourdrinier/react-native-ble-plx](https://github.com/sfourdrinier/react-native-ble-plx).

### New Architecture (Fabric / TurboModules) status

Open issue on the upstream library: RN 0.76.7 + new arch crashes on BLE connect. Workaround is to disable the new architecture in `gradle.properties`. No formal fix as of Feb 2025. The sfourdrinier fork claims compatibility with RN 0.81.4 / Expo SDK 54, so if we move to new arch and hit crashes that's the escape hatch.

Source: [Issue #1277: RN New Architecture Compatibility](https://github.com/dotintent/react-native-ble-plx/issues/1277).

---

## 2. Templates, starters, real repos

Few of these are first-tier — BLE is niche. Listed for completeness; quality varies.

### `NoQuarterTeam/expo-ble-boilerplate`
- URL: https://github.com/NoQuarterTeam/expo-ble-boilerplate
- Stars: ~0, **archived August 2023**.
- Uses `react-native-ble-manager` (not `-plx`), hook-based.
- Useful for us because: not very. Archived and uses the simpler library. Skip.
- Source: [GitHub repo](https://github.com/NoQuarterTeam/expo-ble-boilerplate).

### `watadarkstar/react-native-ble-expo-app`
- URL: https://github.com/watadarkstar/react-native-ble-expo-app
- Stars: ~11. Minimal activity.
- Uses `react-native-ble-plx` inside an Expo project.
- Useful for us because: very thin — just confirms the dev-client + ble-plx wiring. Not a real architecture reference.
- Source: [GitHub repo](https://github.com/watadarkstar/react-native-ble-expo-app).

### `demsr/expo-ble`
- URL: https://github.com/demsr/expo-ble
- Stars: ~16.
- `react-native-ble-plx` in a managed Expo project with EAS dev-client. No ejection.
- Useful for us because: clean reference for the EAS dev-client build profile when we want to revisit our build setup.
- Source: [GitHub repo](https://github.com/demsr/expo-ble).

### `cmcWebCode40/React-Native-Expo-Bluetooth-Integration`
- URL: https://github.com/cmcWebCode40/React-Native-Expo-Bluetooth-Integration
- Stars: ~13. TypeScript, ~91%.
- Companion repo for the well-circulated Chinweike Medium post. Folder structure: `app/`, `components/`, `hooks/`, `utils/`, `types/`, `constants/`.
- Useful for us because: shows the recommended hook + constants + utils slicing on a new-architecture Expo target. Worth a clone-and-skim for the hook structure.
- Source: [GitHub repo](https://github.com/cmcWebCode40/React-Native-Expo-Bluetooth-Integration), [Medium write-up](https://medium.com/@chinweikemichaelchinonso/bluetooth-ble-integration-in-react-native-expo-new-architecture-ios-android-5c0100960979).

### `octoco-ltd/ble-react-native`
- URL: https://github.com/octoco-ltd/ble-react-native
- Stars: ~6. Older but full-stack: companion ESP32 firmware in C++ and an Expo RN app talking to it.
- Architecture: Redux Toolkit + thunks. `bleSlice.ts` + `bleSlice.contracts.ts`. "Invisible BLE Manager component" persists across navigation. Helpful detail: notifications driven via CCCD; Buffer-based decoding.
- Useful for us because: the only public repo we found that pairs a Redux/store-based BLE layer with real notifications. The "invisible manager component that lives in the tree" pattern is exactly the seam we're missing in our monolithic context.
- Source: [GitHub repo](https://github.com/octoco-ltd/ble-react-native).

### `larsthorup/react-native-ble-plx-mock-recorder`
- URL: https://github.com/larsthorup/react-native-ble-plx-mock-recorder
- Stars: ~15.
- Records real BLE traffic to JSON, replays it in Jest. Auto-mocks `react-native-ble-plx`. ~599ms for a realistic test.
- Useful for us because: the only credible answer to "how do we test the packet codec end-to-end without a strap on the desk?" Probably the highest-leverage tool in this whole list for our refactor.
- Source: [GitHub repo](https://github.com/larsthorup/react-native-ble-plx-mock-recorder), [author's writeup](https://www.fullstackagile.eu/2021/06/24/bluetooth-ble-mock-recorder/).

### WHOOP-specific community work
- `bWanShiTong/reverse-engineering-whoop-post` — documented protocol (service UUID `61080000-…`, CMD/RSP/EVENT/DATA characteristics, CRC-32 polynomial `0x4C11DB7` reflected, XOR `0xF43F44AC`, header `aa…`).
- `christianmeurer/whoop-reader` — Python BLE reader, useful as a known-good reference implementation when our codec drifts.
- Useful for us because: ground truth for the wire format. Cite these when adding or modifying packet shapes.
- Sources: [bWanShiTong/reverse-engineering-whoop-post](https://github.com/bWanShiTong/reverse-engineering-whoop-post), [christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader).

---

## 3. Project setup: Expo + ble-plx in 2025/2026

### Config plugin

Add `react-native-ble-plx` to `expo.plugins` with explicit options. The standalone `@config-plugins/react-native-ble-plx` is **no longer needed** — the library now ships its own plugin.

```json
{
  "expo": {
    "plugins": [
      ["react-native-ble-plx", {
        "isBackgroundEnabled": true,
        "modes": ["central"],
        "bluetoothAlwaysPermission": "Allow $(PRODUCT_NAME) to connect to your WHOOP strap"
      }]
    ]
  }
}
```

`modes` writes to iOS `UIBackgroundModes`; we only want `central` (we're not advertising). `isBackgroundEnabled: true` is the switch that pulls in iOS background-mode entitlements and Android foreground-service permissions.

Source: [react-native-ble-plx Expo wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Expo).

### Permissions

- **iOS 13+:** `NSBluetoothAlwaysUsageDescription` (set via plugin). `NSBluetoothPeripheralUsageDescription` is deprecated.
- **Android 12+ (API 31+):** `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`. Use `neverForLocation` in scan filter if scans never derive location.
- **Android <12:** `ACCESS_FINE_LOCATION` (because pre-S, scanning leaks location).
- **Android background scanning:** `ACCESS_BACKGROUND_LOCATION` since Android 10.

Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/), [Expo blog](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app).

### Expo Go cannot run BLE

Always a dev client / EAS build. Same for emulators — BLE has zero simulator support.

Source: [Expo blog](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app), [Medium: Bluetooth BLE Integration (Chinweike)](https://medium.com/@chinweikemichaelchinonso/bluetooth-ble-integration-in-react-native-expo-new-architecture-ios-android-5c0100960979).

---

## 4. Architecture patterns for the BLE layer

### Option A: BleManager singleton + thin React layer (most common)

Create `BleManager` once at module load, never inside React. Either a direct export or wrapped in a service class.

```ts
// services/ble/manager.ts
export const manager = new BleManager({
  restoreStateIdentifier: 'WhoopBleRestore',
  restoreStateFunction: handleRestoredState,
});
```

Why: as of `react-native-ble-plx` 3.4.0 the underlying client is a singleton anyway. Multiple `new BleManager()` calls leak native clients (issue #767). One module-scoped instance avoids that and avoids React-tree lifetimes.

Source: [react-native-ble-plx docs (Getting Started)](https://dotintent.github.io/react-native-ble-plx/), [Issue #767: Potential memory leaks on multiple constructor calls](https://github.com/dotintent/react-native-ble-plx/issues/767), [DeepWiki: dotintent/react-native-ble-plx](https://deepwiki.com/dotintent/react-native-ble-plx).

### Option B: Two-container split — recommended

Stormotion's writeup and the official docs both recommend organizing logic into two layers:

1. **Generic BLE layer** — scanning, connection, disconnection, adapter state.
2. **Device-specific layer** — known service/characteristic UUIDs, monitoring, read/write, codec, command/event dispatch.

Why: keeps generic Bluetooth lifecycle reusable, and the WHOOP packet codec/dispatch isolated. Makes both layers independently testable.

Source: [Stormotion: BLE in React Native](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/).

### Option C: State store (Redux / Zustand) over the singleton

Use a state library (Zustand is the modern pick; Redux Toolkit if you need devtools) to expose `connectionState`, `device`, `battery`, etc. The BleManager singleton dispatches into the store. UI subscribes via selectors.

Why: avoids the "boolean flag soup" anti-pattern (`isConnected && !isConnecting && isScanning && isReady && ...`). Selectors keep components from rerendering on unrelated state. Zustand specifically avoids the context-provider boilerplate and is friendlier to the singleton because the store is reachable outside React.

Source: [IoTfast: BLE Connection Patterns That Survive Real-World IoT Chaos](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos), [DEV: Zustand in React Native](https://dev.to/ersuman/zustand-in-react-native-a-modern-state-management-solution-p6g).

### Option D: RxJS observables wrapping the callback API

`monitorCharacteristicForDevice` returns a subscription, and there's a one-liner to wrap it as an RxJS Observable. Useful if you have **multiple consumers** of the same characteristic stream (your case: command responses, events, data each go to different consumers).

Why: the native callback fires once; if both the command-reply Promise and the event log consumer need it, an Observable with `share()` or a Subject lets you fan out cleanly. Without this you end up registering multiple `monitorCharacteristicForDevice` calls or building a hand-rolled dispatcher.

Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/), [Medium: Reactive Apps with RxJS](https://medium.com/@codenova/building-reactive-apps-with-redux-rxjs-and-redux-observable-in-react-native-7fa2358b1d95).

### Verdict for us

A Zustand store + module-level BleManager singleton + a small per-characteristic event-emitter or RxJS Subject for fan-out, with the device-specific (WHOOP) codec living in its own module. The `BleContext.tsx` becomes a thin selector hook layer over the store, or is deleted entirely.

---

## 5. Connection lifecycle

### Required state machine

The literature is unanimous: a single-active-state machine, not booleans.

```
idle ↔ scanning → connecting → discovering → ready
  ↓                                            ↓
error ←─────────────────────────────── disconnected
```

Guard every action by state. Don't start a new connect unless `idle | disconnected`. Don't allow read/write/monitor unless `ready`.

Source: [IoTfast: Connection Patterns](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos).

### Wait for `PoweredOn` before doing anything

```ts
const sub = manager.onStateChange((state) => {
  if (state === 'PoweredOn') {
    scanAndConnect();
    sub.remove();
  }
}, true); // emit current state
```

The `true` second arg matters — without it you only get future state changes, and on a fresh launch the adapter may already be on.

Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/).

### Connect → discover → subscribe

```ts
const dev = await manager.connectToDevice(id, { requestMTU: 247 });
await dev.discoverAllServicesAndCharacteristics();
// only now subscribe to notifications / read / write
```

`discoverAllServicesAndCharacteristics` is **required once per connection** before any characteristic op. iOS auto-negotiates MTU up to 187; Android needs an explicit `requestMTU` call. Default MTU is 23 (or 517 on Android 14+).

Source: [react-native-ble-plx docs (Connecting / MTU)](https://dotintent.github.io/react-native-ble-plx/), [Device Connecting wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Device-Connecting).

### Connection timeouts and `autoConnect`

`connectToDevice({ autoConnect: false })` (default) gives a direct 30-second window on Android. `autoConnect: true` (Android only) flips to background scanning with no timeout — better for sticky reconnect to a known device, but slower initial connect. iOS does not time out connect attempts by default; you must `cancelDeviceConnection` yourself.

Source: [Device Connecting wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Device-Connecting).

### Reconnect: `onDeviceDisconnected` + exponential backoff

```ts
manager.onDeviceDisconnected(deviceId, async (err, dev) => {
  // mark store: state = 'recovering'
  // exponential backoff: 1s, 2s, 4s, 8s, capped at ~30-60s
  // give up and require user action after N attempts
});
```

The library does **not** auto-reconnect. The pattern: schedule via backoff, check `AppState` (don't burn battery in background), and stop after repeated failure with a clear user-facing state ("move closer / charge / restart").

Source: [IoTfast: Connection Patterns](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos), [Issue #198: Cannot reconnect device after being disconnected](https://github.com/dotintent/react-native-ble-plx/issues/198).

### Scan windows

"Wrap every scan in a window — 10 to 30 seconds. Every connect in a 5-15 second timeout." Move to terminal states ("no device found"), never infinite loop.

Source: [IoTfast](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos).

---

## 6. Notification / characteristic subscriptions and fan-out

### Single subscription per characteristic

`manager.monitorCharacteristicForDevice(deviceId, serviceUUID, charUUID, callback, transactionId)` returns a Subscription. Use **transaction IDs** so you can cancel by name later. Don't register two monitors for the same characteristic — pick one and fan out.

Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/).

### Fan-out patterns (from one BLE callback to many consumers)

Three working options:

1. **EventEmitter (Node-style):** a per-characteristic emitter (`mitt`, `eventemitter3`, or RN's `NativeEventEmitter`). Cheap, no extra dependency cost.
2. **RxJS Subject:** wrap `monitorCharacteristicForDevice` in an `Observable` and `share()` it. Lets command-reply code use `firstValueFrom(stream$.pipe(filter(matchesId), timeout(2000)))` while event-log code does its own `.subscribe()`.
3. **Store dispatch:** notifications dispatch into Zustand/Redux directly; consumers select. Simplest for "latest value wins" semantics (battery, RSSI). Worst for "I'm waiting for response to a specific command" — that needs a queue/correlation.

For WHOOP specifically, with command-reply semantics on `CMD_FROM_STRAP` and pure-stream semantics on `EVENTS_FROM_STRAP` / `DATA_FROM_STRAP`, RxJS or a small typed event emitter beats the store for command correlation.

Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/), [Stormotion: BLE in React Native](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/).

### Base64 in/out

`react-native-ble-plx` exposes characteristic values as base64 strings. Encode with `Buffer.alloc(...).writeUInt16LE(...).toString('base64')`; decode with `Buffer.from(value, 'base64')`. Centralize this in the codec module — never sprinkle Buffer calls in components.

Source: [FAQ: Passing And Retrieving Of Characteristic Value (wiki)](https://github.com/dotintent/react-native-ble-plx/wiki/=--FAQ:-Passing-And-Retrieving-Of-Characteristic-Value), [Issue #245: Sending Long Messages](https://github.com/dotintent/react-native-ble-plx/issues/245).

### Large writes / chunking

You cannot exceed MTU minus a few bytes per write. For ~150-byte+ payloads, chunk into MTU-sized packets and use `writeCharacteristicWithoutResponseForService` with a small inter-packet delay (1-3 ms per chunk is common; iOS specifically allows ~6 packets per 30 ms). Don't spam — phones and devices drop packets if you saturate the queue.

Source: [Issue #549: Fail to write 150+ byte payloads](https://github.com/dotintent/react-native-ble-plx/issues/549), [Issue #245](https://github.com/dotintent/react-native-ble-plx/issues/245).

---

## 7. Background BLE

### iOS — `restoreStateIdentifier` + `restoreStateFunction`

```ts
const manager = new BleManager({
  restoreStateIdentifier: 'WhoopBleRestore',
  restoreStateFunction: (restored) => {
    if (!restored) return; // first launch
    const reconnected = restored.connectedPeripherals;
    // rehydrate store, re-discover, re-subscribe
  },
});
```

Plus: `bluetooth-central` in `UIBackgroundModes` (set via the config plugin's `modes`), `NSBluetoothAlwaysUsageDescription`, and an Xcode capability check (the config plugin handles this when `isBackgroundEnabled: true`).

When backgrounded with restoration enabled, iOS keeps the connection alive, queues BLE events, and even relaunches the app on a relevant event after termination. Limits: background scanning requires a non-empty service UUID array, `allowDuplicates` is ignored in background, you only get ~few seconds of CPU before suspension, then ~35s after each wake.

Test the restoration path with `p (int)raise(9)` in the Xcode LLDB console to simulate iOS killing the app.

Source: [Background mode (iOS) wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS)).

### Android — foreground service

Background BLE on Android requires either a foreground service (with persistent notification) or accepting that the OS will eventually kill the process. The library's plugin can wire up `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_CONNECTED_DEVICE` permissions and the service manifest entry when `isBackgroundEnabled` is set. Background scans also need `ACCESS_BACKGROUND_LOCATION` since Android 10, and must use a UUID filter.

Scan mode matters: `LowPower` is default and the only sensible mode in background; `LowLatency` (highest duty cycle) is foreground-only.

Source: [Bluetooth Scanning wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Bluetooth-Scanning), [oneclickitsolution: BLE Forever Scanning](https://www.oneclickitsolution.com/centerofexcellence/android/ble-forever-scanning-in-background-for-android-app-in-react-native), [Issue #1177: BleManager in background mode](https://github.com/dotintent/react-native-ble-plx/issues/1177).

### Footguns

- **iOS:** UI updates from background may stall; React Native timers may misbehave. Keep BLE/codec logic UI-free.
- **Android:** Without the foreground service, your background work dies. With it, the user sees a persistent notification — design copy for it.
- Both platforms: don't expect cron-like reliability. Background BLE is best-effort.

Source: [Background mode wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS)).

---

## 8. Testing without a strap on the desk

### Mock recorder + Jest playback

`larsthorup/react-native-ble-plx-mock-recorder` is the strongest pattern in the React Native BLE ecosystem:

1. Build a small recorder app (separate Expo target) that runs on a real phone with a real strap and **records actual BLE traffic into a JSON file**.
2. Commit the recordings.
3. In Jest, the package auto-mocks `react-native-ble-plx`. Tests do `blePlayer.playUntil('scanned')`, `blePlayer.expectFullCoverage()` style assertions.

Reported performance: ~599 ms for a realistic 50-message test, ~100 tests/second once warm. The author claims this replaces multi-hour E2E suites with sub-second Jest runs.

Source: [larsthorup/react-native-ble-plx-mock-recorder](https://github.com/larsthorup/react-native-ble-plx-mock-recorder), [Mocking BLE traffic for fast robust app UI testing](https://www.fullstackagile.eu/2021/06/24/bluetooth-ble-mock-recorder/), [Mock Recording reactnativeeu 2021 PDF](https://www.fullstackagile.eu/2021/09/02/react-native-bluetooth-ble-mock-recording/bluetooth-mock-recording-reactnativeeu-2021-09-02-publish.pdf).

### Interface-based abstraction (Beam Benefits)

If you don't want to take the recorder dependency, define your own `BleAdapter` interface in front of `BleManager`. Inject the real adapter in production, a fake one in tests. The Beam Benefits team layered a `FileMonitor` that pushes mock data files via Appium during E2E runs to simulate notifications — overkill for unit tests, but the abstraction shape is right.

Source: [Beam Benefits: Writing E2E tests for Bluetooth applications is difficult (Jul 2020)](https://medium.com/beambenefits/writing-end-to-end-tests-for-bluetooth-applications-is-difficult-441dde7c93).

### Manual `__mocks__/react-native-ble-plx.ts`

Lowest-effort middle ground. Stub `BleManager` with whatever methods you call (`startDeviceScan`, `connectToDevice`, `discoverAllServicesAndCharacteristics`, `monitorCharacteristicForDevice`) and use Jest controls (`jest.useFakeTimers`, `act`) to drive scripted scenarios. Good for unit-testing the packet codec separately.

Source: [oneuptime: How to Mock Native Modules in React Native Tests](https://oneuptime.com/blog/post/2026-01-15-react-native-mock-native-modules/view).

---

## 9. Common bugs and anti-patterns

| Pitfall | Why it bites | Source |
|---|---|---|
| Creating `new BleManager()` more than once | Pre-3.4.0 each call creates a new native client; even in 3.4+, recreating after `destroy()` is the only legitimate use case. Leaks otherwise. | [Issue #767](https://github.com/dotintent/react-native-ble-plx/issues/767) |
| Forgetting `.remove()` on subscriptions in `useEffect` cleanup | Listeners leak across hot reloads and route changes; characteristic monitors keep running and accumulate native handlers. | [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/), [Issue #467: Memory Leak on iOS](https://github.com/dotintent/react-native-ble-plx/issues/467) |
| Boolean flag soup (`isConnected`, `isConnecting`, `isScanning`, `isReady`) | States contradict each other; race conditions during fast reconnect cycles. | [IoTfast](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos) |
| Reading/writing before `discoverAllServicesAndCharacteristics()` | Silent error or wrong characteristic ref. | [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/) |
| Connecting while a scan is still running (Android) | "May cause problems" per official docs — stop scan, then connect. | [Device Connecting wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Device-Connecting) |
| Tight retry loop on disconnect | Drains battery on phone and device; trips OS BLE rate limits; can lock the host stack. | [IoTfast](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos) |
| Rapid characteristic reads / write spamming | Memory grows until OOM on iOS; phones drop packets. | [Issue #1326: Maximum update depth exceeded](https://github.com/dotintent/react-native-ble-plx/issues/1326) |
| Ignoring characteristic capability flags | Writing to a non-writable char silently fails; missing `isNotifiable`. | [react-native-ble-plx docs (Error Handling)](https://dotintent.github.io/react-native-ble-plx/) |
| Background mode without UUID-filtered scan | iOS won't deliver discovery callbacks in background unless a service UUID filter is set. | [Background mode wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS)) |
| Building with the new architecture on RN 0.76.x | Crashes on connect; disable until upstream fixes or use the sfourdrinier fork. | [Issue #1277](https://github.com/dotintent/react-native-ble-plx/issues/1277) |
| Trusting cached device names | ble-plx caches names per session and rename-after-discovery isn't reliable. | [Stormotion](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/) |
| Writing >MTU in one call | Silent truncation. Chunk and use `writeWithoutResponse`. | [Issue #549](https://github.com/dotintent/react-native-ble-plx/issues/549) |

---

## 10. Recommendations for our refactor (ranked)

### 1. Extract `BleManager` to a module-level singleton

**Change:** Move `new BleManager()` out of `BleContext.tsx` and into `services/ble/manager.ts`, exported once. Construct with `restoreStateIdentifier` + `restoreStateFunction` from day one (even if we don't use restoration yet — adding it later means a different identifier and a one-time confusing migration). **Why:** stops the "manager lifetime tied to React tree" footgun, makes the manager reachable from non-React code (background tasks, codec tests), eliminates the leak risk from re-mounts in dev. **Cost:** trivial — a file move and one import update. Source: [Getting Started docs](https://dotintent.github.io/react-native-ble-plx/), [Issue #767](https://github.com/dotintent/react-native-ble-plx/issues/767).

### 2. Replace the connection booleans with an explicit state machine

**Change:** Define a `BleState = 'idle' | 'scanning' | 'connecting' | 'discovering' | 'ready' | 'recovering' | 'error' | 'disconnected'` discriminated union. Every transition goes through one reducer/store action. UI selects `state`, not five booleans. Guards on every operation: `assertState('ready')` before any read/write/monitor. **Why:** kills the entire class of race-condition bugs that come from `isConnecting && !isConnected && isReady` corner cases, and makes reconnect logic readable. **Cost:** a day or two of careful refactor; touches almost every BLE call site in the current `BleContext.tsx`. Source: [IoTfast: Connection Patterns](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos).

### 3. Split the BLE layer into generic-BLE + WHOOP-codec modules

**Change:** Two folders: `services/ble/` (BleManager singleton, scan, connect/disconnect, adapter state, reconnect policy, MTU) and `services/whoop/` (UUIDs, packet codec with CRC8/CRC32, command/event/data dispatchers, history download, alarm/charge parsers). The current monolithic context is split along this seam. **Why:** the WHOOP-specific codec is the single hottest target for tests and the part most likely to need iteration; isolating it from connection lifecycle makes both halves testable in isolation. **Cost:** moderate — the current 770-line context probably becomes ~6 files of ~150 lines each, with one new test file per codec module. Source: [Stormotion](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/), [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/).

### 4. Move state to Zustand (or an equivalent store), keep React context as a thin selector layer

**Change:** A `useBleStore` Zustand store holds `state`, `device`, `battery`, `lastPacketAt`, `recoveryAttempts`. UI subscribes with selectors. `BleContext` either disappears or becomes a `<BleProvider>` whose only job is to mount the BleManager subscriptions on app start. **Why:** lets non-React code (codec, reconnect timer, future background task) read and update state; eliminates "context value identity changed, everything rerenders"; pairs naturally with the state machine in (2). **Cost:** small if (2) is done first — mostly mechanical conversion of `useState`/`useContext` to `useBleStore`. Source: [IoTfast](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos), [DEV: Zustand in React Native](https://dev.to/ersuman/zustand-in-react-native-a-modern-state-management-solution-p6g).

### 5. Add an event-channel dispatcher for the notification characteristics

**Change:** For each notifiable characteristic, register **one** `monitorCharacteristicForDevice` and pipe each frame through a typed emitter (or RxJS Subject). Consumers (command reply correlator, event log, data download, battery poller) subscribe to the same stream with their own filters. Battery polling specifically: spin up a 60-90s interval that issues a battery-read command and resolves via the response stream's reply matcher. **Why:** directly addresses "no battery polling, no event-channel parsing" pain. One subscription per characteristic = no double-fire, no leaks, no fighting for ownership. **Cost:** small — RxJS adds ~6kb gz if we don't already have it; a typed mini-emitter is ~30 lines. Source: [react-native-ble-plx docs](https://dotintent.github.io/react-native-ble-plx/), [Stormotion](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/).

### 6. Formalize the reconnect policy

**Change:** Subscribe to `onDeviceDisconnected` once at startup. On unexpected disconnect, set state to `recovering`, schedule a backoff (`1s, 2s, 4s, 8s, 16s, 30s, 60s`, cap at 60s, give up after ~10 attempts), check `AppState` before each attempt to avoid burning background budget, and surface a clear user-facing state when we give up. Replace any ad-hoc reconnect spread across the current context. **Why:** today's logic is described as ad-hoc; this turns it into one tested function. **Cost:** half a day plus tests once mock-recorder traces exist. Source: [IoTfast](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos), [Issue #198](https://github.com/dotintent/react-native-ble-plx/issues/198).

### 7. Set up `react-native-ble-plx-mock-recorder` for codec & lifecycle tests

**Change:** Build a one-screen Expo target that records sessions to JSON (pair, history download, alarm flow, charge transition). Commit the recordings. Use Jest with the auto-mock to assert codec behavior end-to-end, including history-download chunking, CRC failures, and the alarm-parse path. **Why:** the codec and the dispatch logic are the most regression-prone parts of the WHOOP integration and currently untested. Sub-second Jest runs are achievable. **Cost:** a few days upfront to build the recorder app and capture good traces, then near-zero ongoing — once recorded, traces don't need a strap. Source: [larsthorup/react-native-ble-plx-mock-recorder](https://github.com/larsthorup/react-native-ble-plx-mock-recorder), [Mock Recording writeup](https://www.fullstackagile.eu/2021/06/24/bluetooth-ble-mock-recorder/).

### 8. Decide on background BLE policy explicitly

**Change:** Either (a) commit to iOS state-preservation + Android foreground service now — wire the config plugin's `isBackgroundEnabled: true`, set `modes: ["central"]`, define a friendly persistent notification copy, and write the restore path — or (b) make a conscious decision *not* to support background and document the foreground-only UX. Don't leave it implicit. **Why:** the current code has no background story, which is fine, but users will silently think otherwise and file "the app lost my data overnight" tickets. **Cost:** (a) is real work — ~a week including testing kill-restart cycles with `raise(9)` and Android battery-optimization edge cases. (b) is free but should be visible in product. Source: [Background mode (iOS) wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS)), [Bluetooth Scanning wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Bluetooth-Scanning).

---

## Sources

- [Expo blog: How to build a Bluetooth Low Energy powered Expo app](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app)
- [Medium (Chinweike): Bluetooth BLE Integration in React Native Expo (New Architecture)](https://medium.com/@chinweikemichaelchinonso/bluetooth-ble-integration-in-react-native-expo-new-architecture-ios-android-5c0100960979)
- [react-native-ble-plx documentation (3.3.0)](https://dotintent.github.io/react-native-ble-plx/)
- [react-native-ble-plx GitHub README](https://github.com/dotintent/react-native-ble-plx)
- [react-native-ble-plx Expo wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Expo)
- [react-native-ble-plx Background mode (iOS) wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS))
- [react-native-ble-plx Device Connecting wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Device-Connecting)
- [react-native-ble-plx Bluetooth Scanning wiki](https://github.com/dotintent/react-native-ble-plx/wiki/Bluetooth-Scanning)
- [react-native-ble-plx FAQ: Passing And Retrieving Characteristic Value](https://github.com/dotintent/react-native-ble-plx/wiki/=--FAQ:-Passing-And-Retrieving-Of-Characteristic-Value)
- [Issue #198: Cannot reconnect device after being disconnected](https://github.com/dotintent/react-native-ble-plx/issues/198)
- [Issue #245: Sending Long Messages](https://github.com/dotintent/react-native-ble-plx/issues/245)
- [Issue #467: Memory Leak on iOS](https://github.com/dotintent/react-native-ble-plx/issues/467)
- [Issue #549: Fail to write 150+ byte payloads](https://github.com/dotintent/react-native-ble-plx/issues/549)
- [Issue #767: Potential memory leaks on multiple constructor calls](https://github.com/dotintent/react-native-ble-plx/issues/767)
- [Issue #1177: BleManager in background mode](https://github.com/dotintent/react-native-ble-plx/issues/1177)
- [Issue #1277: RN New Architecture Compatibility](https://github.com/dotintent/react-native-ble-plx/issues/1277)
- [Issue #1326: Maximum update depth exceeded](https://github.com/dotintent/react-native-ble-plx/issues/1326)
- [sfourdrinier/react-native-ble-plx (modernized fork)](https://github.com/sfourdrinier/react-native-ble-plx)
- [@config-plugins/react-native-ble-plx README](https://github.com/expo/config-plugins/blob/main/packages/react-native-ble-plx/README.md)
- [LogRocket: Comparing React Native BLE libraries](https://blog.logrocket.com/comparing-react-native-ble-libraries/)
- [Stormotion: BLE Integration and Case Studies Guide](https://stormotion.io/blog/what-to-consider-when-integrating-ble-in-your-react-native-app/)
- [IoTfast: React Native BLE Connection Patterns That Survive Real-World IoT Chaos](https://iotfast.dev/blog/react-native-ble-connection-patterns-that-survive-real-world-iot-chaos)
- [Beam Benefits (Medium): Writing E2E tests for Bluetooth applications is difficult](https://medium.com/beambenefits/writing-end-to-end-tests-for-bluetooth-applications-is-difficult-441dde7c93)
- [Full Stack Agile: Mocking BLE traffic for fast robust app UI testing](https://www.fullstackagile.eu/2021/06/24/bluetooth-ble-mock-recorder/)
- [Mock Recording slides (ReactNativeEU 2021)](https://www.fullstackagile.eu/2021/09/02/react-native-bluetooth-ble-mock-recording/bluetooth-mock-recording-reactnativeeu-2021-09-02-publish.pdf)
- [larsthorup/react-native-ble-plx-mock-recorder](https://github.com/larsthorup/react-native-ble-plx-mock-recorder)
- [oneuptime: How to Mock Native Modules in React Native Tests](https://oneuptime.com/blog/post/2026-01-15-react-native-mock-native-modules/view)
- [Medium (Codenova): Reactive Apps with Redux, RxJS, and Redux-Observable](https://medium.com/@codenova/building-reactive-apps-with-redux-rxjs-and-redux-observable-in-react-native-7fa2358b1d95)
- [DEV: Zustand in React Native](https://dev.to/ersuman/zustand-in-react-native-a-modern-state-management-solution-p6g)
- [npm trends: react-native-ble-manager vs react-native-ble-plx](https://npmtrends.com/react-native-ble-manager-vs-react-native-ble-plx)
- [DeepWiki: dotintent/react-native-ble-plx](https://deepwiki.com/dotintent/react-native-ble-plx)
- [oneclickitsolution: BLE Forever Scanning Background Android](https://www.oneclickitsolution.com/centerofexcellence/android/ble-forever-scanning-in-background-for-android-app-in-react-native)
- [NoQuarterTeam/expo-ble-boilerplate (archived)](https://github.com/NoQuarterTeam/expo-ble-boilerplate)
- [watadarkstar/react-native-ble-expo-app](https://github.com/watadarkstar/react-native-ble-expo-app)
- [demsr/expo-ble](https://github.com/demsr/expo-ble)
- [cmcWebCode40/React-Native-Expo-Bluetooth-Integration](https://github.com/cmcWebCode40/React-Native-Expo-Bluetooth-Integration)
- [octoco-ltd/ble-react-native](https://github.com/octoco-ltd/ble-react-native)
- [bWanShiTong/reverse-engineering-whoop-post (WHOOP protocol)](https://github.com/bWanShiTong/reverse-engineering-whoop-post)
- [christianmeurer/whoop-reader](https://github.com/christianmeurer/whoop-reader)
