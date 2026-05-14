# Code review — session-level pass

Scope: changes shipped this session in the noop monorepo:
battery RE pipeline (mobile + backend + inspector), UI surfacing,
Phosphor icon swap, telemetry table additions, and helper scripts.

Out of scope (per request): iOS background BLE, `docs/` research,
Phase 6 deferred items.

Legend: Severity (M = must-fix, S = should-fix, N = nice-to-have,
C = cosmetic) · Effort (S/M/L) · Impact (R = reliability,
P = perf/cost, D = data correctness, U = user-visible).

---

## 1. Battery RE — mobile parsing & wiring

### 1.1 MEMFAULT chunks never reach the backend
Severity **M** · Effort S · Impact R/D

`apps/app/app/context/BleContext.tsx:918-920` routes MEMFAULT chunks
through `consoleLogForwarder.push("[MEMFAULT base64=...]")`. The
`ConsoleLogLineForwarder.push()` implementation
(`apps/app/app/services/ble/telemetry-forwarder.ts:235-249`) is a
**line buffer that only flushes on `\n`**. MEMFAULT base64 chunks
contain no newlines, so each chunk concatenates onto
`lineBuffer` forever until either:
- something else pushes a string containing `\n`, at which point
  the (now arbitrarily long) `[MEMFAULT …][MEMFAULT …]…` blob is
  emitted as a single PG row, or
- the forwarder `stop()`s (disconnect or unmount), at which point
  the whole accumulated blob is forwarded once and then `deviceId`
  is nulled.

Net effect: MEMFAULT capture is non-functional in normal operation
and unbounded-memory in long-lived sessions.

Fix: append `\n` at the call site (`consoleLogForwarder.push(\`[MEMFAULT base64=${base64Chunk}]\n\`)`)
or, better, expose an explicit `pushLine()` method that bypasses the
buffer.

### 1.2 `imu_records` is write-only (orphan)
Severity **S** · Effort M · Impact P/D

`apps/backend/src/telemetry/telemetry.module.ts:12` and the new
`POST /telemetry/imu` route persist IMU samples at ~52 Hz × 100
samples/packet. Nothing reads from `imu_records`:
- `apps/backend/src/pipeline/pipeline.module.ts:24-40` does not list
  `ImuRecord` and `pipeline.service.ts` never queries the table.
- No `/views/*` or `/debug/*` endpoint surfaces it.

At realistic data rates this is ~45M rows/day with no retention or
downstream consumer. Either:
- Add the obvious next step (activity detection / wake detection
  uses gyro variance), or
- Disable ingestion behind a feature flag until a consumer exists,
  or
- Add a TTL prune job before this turns into a Postgres-disk fire.

### 1.3 `command_responses` is write-only (orphan)
Severity **S** · Effort S · Impact P

Same shape as 1.2. `apps/backend/src/telemetry/entities/command-response.entity.ts`
+ `/telemetry/command-responses` ingest, but no reader. Volume is
much lower than IMU (~10-50 rows/min during refresh), so disk
pressure is mild, but it's still useless storage right now. At
minimum add a retention job or a debug view.

### 1.4 Smart-wake monitor has correctness, leak, and platform issues
Severity **S** · Effort M · Impact R/U

`apps/app/app/context/BleContext.tsx:515-573`. Four problems
stacked:

1. **Stale closure on realtime samples**
   The `setInterval` body reads `deviceState.realtimeSamples`
   (line 553), but that closure is captured at the moment
   `armAlarm` ran. React re-renders rebuild a new `armAlarm`, but
   the running interval keeps the old captured value. After arm
   time the interval is reading a frozen array. Either use a
   `samplesRef` updated on every packet, or read off
   `bleManager` / a getter.

2. **Cleanup leak**
   The provider unmount cleanup at line 922-936 clears every
   timer/listener except `smartWakeTimer.current`. If the
   provider unmounts after arm (logout, full reload), the
   interval keeps running. Also, when the interval clears
   itself on `now >= alarmDate` (line 547-549), it does not
   null `smartWakeTimer.current`, so a subsequent `armAlarm`
   sees a non-null ref and `clearInterval`s an already-cleared
   handle (harmless but indicates a missing invariant).

3. **Wake-up heuristic is brittle**
   Buffer cap is 40 samples (line 833 keeps `.slice(-39)` then
   pushes 1). With realtime arriving ~1 Hz that's ~30-40 seconds.
   The fire condition is `mean - min >= 10`, which on a 30-sample
   tail demands a 10 bpm spread within 30 seconds — too short to
   reflect physiological wake transitions. Real smart-wake
   algorithms compare a multi-minute rolling slope, not range,
   and need 5-10 min of context. As written this will either
   (a) never fire, or (b) fire on a movement artifact.

4. **Foreground-only on iOS**
   JS `setInterval` does not fire while the app is backgrounded
   on iOS. A user arming their alarm at bedtime and then
   backgrounding the app will never hit the early-wake path. The
   strap's scheduled alarm still fires, so the feature degrades
   silently, but the value-add is gone. Document this or rebuild
   on a native scheduler — the iOS background BLE work
   (separately in-flight) is the natural home.

### 1.5 `armAlarm` callback churn
Severity **N** · Effort S · Impact P

`armAlarm` (line 573) lists `deviceState.realtimeSamples` in its
deps array. That array grows on every realtime sample (~1 Hz). So
`armAlarm` is rebuilt every second, the memoised context value
re-derives, and every `useBle()` consumer re-renders. Drop the dep
once 1.4 is fixed (the closure should read from a ref, not state).

### 1.6 Live-stress baseline is hardcoded
Severity **N** · Effort M · Impact D

`deriveLiveStressLevel` (line 252-262) hardcodes resting BPM = 60.
There's already a per-user RHR baseline in `BaselineProfile` —
plumb it through `useDashboard()`. The current value will register
"stressed" for anyone with a low resting HR (athletes, etc.).

### 1.7 `/debug/battery-history` is wired client-only — no `fetchBatteryHistory` helper
Severity **C** · Effort S · Impact U (inspector dev experience)

`apps/inspector/src/App.tsx:253,279` uses inline `apiGet<BatteryHistory>(...)`.
There's no helper in `api.ts` (compare: `triggerPipelineRun` etc.).
Minor style drift. If a second caller appears, factor it.

### 1.8 Battery polling: cmd 26 is hot, cmd 98 is unused
Severity **N** · Effort S · Impact P

`apps/app/app/context/BleContext.tsx:913-916` polls cmd 26
(GetBatteryLevel) every 30s. CommandNumber.GetExtendedBatteryInfo
(98) is defined in `packet-types.ts:50` but never sent — extended
data only arrives passively via event 63 (~4 min cadence). If you
want fresh voltage/temp/icon between event 63 broadcasts, send cmd
98. If not, drop the enum entry to avoid implying a feature that
isn't wired.

### 1.9 Parsers: range validation could be one constant table
Severity **C** · Effort S · Impact —

`parseBatteryLevelEvent`, `parseExtendedBatteryEvent`, and the
backend `getBatteryHistory` parser repeat the exact same range
guards (SOC ≤ 1100, V in [2500, 4500], T in [50, 700]/10,
icon ∈ [0, 7]). Extract a shared `validate` table; one drift point
later when the firmware spec is refined.

### 1.10 `parseRealtimeHeartRate` runs on every packet type
Severity **C** · Effort S · Impact P (negligible)

`BleContext.tsx:827` reads HR from any packet (event/cmd-resp/IMU)
because `parseRealtimeHeartRate` only filters at the top. Cheap
guard, but the call ordering is slightly muddled — already inside
the big `onPacket("*")` handler that handles every type
explicitly. Move the call inside the `RealtimeData` branch.

---

## 2. Backend — telemetry, pipeline, views

### 2.1 `sleepScore` column written but no migration backfill
Severity **S** · Effort S · Impact D

`apps/backend/src/migrations/1779500000000-DailyScoreSleepScore.ts`
adds the column as nullable int. `pipeline.service.ts:639-647`
writes it on the next run for new rows. Existing `daily_scores`
rows from before this session will remain NULL until the row's
night gets re-processed (no global rerun is triggered post-migration).
For users who don't sync for a few days the home view's sleep ring
will show `--` on historical days. Either:
- Run an opportunistic backfill in the migration (compute from
  existing detections/stages/features),
- Trigger a forced pipeline rerun on first boot after migration,
  or
- Document the regression and accept it (cheapest).

### 2.2 `recoveryIndex` removed from response payload but column persists
Severity **N** · Effort S · Impact D

`pipeline.service.ts:1104` still writes `recoveryIndex` and the
column persists (`daily-metric.entity.ts:40`). Views no longer
return it (verified: no `recoveryIndex:` key in any `/views/*`
response), and the mobile app no longer reads it. Decide whether
to:
- Keep computing it (cheap, gives future optionality),
- Stop computing + drop column (cleaner, requires a migration).

If keeping, document it as "internal-only feature" so the next
dev doesn't wire it back into a screen and reintroduce the dual-
recovery confusion.

### 2.3 Detail string still references stages outside the sleep score
Severity **N** · Effort S · Impact U

`apps/backend/src/processing/wellness-scoring.ts:375` now builds
`detail = "Balance N, Load N, Sleep reserve Xh"`. The `, Sleep score N`
suffix was correctly dropped. Verified no stale references in
backend or mobile. Clean change.

### 2.4 `deviceInfo` merge direction fix (debug.service.ts) — verified
Severity (no finding) — call-out only.

`apps/backend/src/debug/debug.service.ts:1086-1092` now iterates
`consoleLogs` (DESC by `capturedAt`) from `length-1` down to `0`,
so the most-recent log line's metadata wins via `Object.assign`.
That matches the comment ("most recent log line wins per key").
Correct.

### 2.5 No retention on `command_responses`, `imu_records`, `device_events`
Severity **S** · Effort M · Impact P

None of the telemetry tables have a TTL job. `IngestImuRecordsDto`
allows up to ~5200 rows per request × frequent packets =
~millions/day per active user. Add a periodic prune (cron in
backend or pg `DELETE WHERE capturedAt < now() - interval '14 days'`)
before this session's work goes to production.

### 2.6 Migration `1779500000000` is column-only — no index update
Severity **N** · Effort S · Impact P

`daily_scores` is already indexed by `(userId, dayDate)` so the new
`sleepScore` column doesn't need its own index. No action — calling
out the verification so it doesn't show up as a finding later.

### 2.7 `CommandResponses_1779600000000` `down()` only drops index/table — OK
Verified. CREATE/DROP are symmetric. No finding.

### 2.8 `IngestImuRecordsDto` lacks an explicit cap
Severity **S** · Effort S · Impact R

`apps/backend/src/telemetry/dto/ingest-imu-records.dto.ts` validates
each record but the array can be arbitrary length. A malicious or
buggy client could submit a 1M-record array. Add an
`@ArrayMaxSize(10000)` (or whatever the realistic upper bound is)
and a request body size limit at the global pipe level.

### 2.9 Backend service does `imuRecordRepo.save(batch)` per chunk synchronously
Severity **N** · Effort S · Impact P

`telemetry.service.ts:81-86`: chunks of 500, awaited sequentially.
For 5200 records that's 11 round-trips. Could use `Promise.all` on
chunks with a small concurrency cap (3-4) — Postgres handles it.
Not critical given current call frequency.

### 2.10 `getBatteryHistory` repeats the parsing constants
Severity **C** · Effort S · Impact —

`debug.service.ts:951-1037` re-implements the byte-offset parsing
of evt3/evt63 that already exists in
`apps/app/app/context/BleContext.tsx:174-207`. See 1.9 — split into
a shared package or processing module so the next firmware tweak
edits one file.

### 2.11 `getBatteryHistory` "latest" loop early-exits when all four fields are non-null
Severity **C** · Effort S · Impact —

`debug.service.ts:1015-1029`. Logic is correct but the early-exit
`if (… ! null) break` is a micro-optimisation that complicates the
read. Either drop the break and accept the O(N) per field, or factor
into `findLatestNonNull(series, key)`.

### 2.12 Pipeline.module entity registration `ImuRecord` missing
Severity **N** · Effort S · Impact —

If a follow-up wants the pipeline to read IMU, register `ImuRecord`
in `pipeline.module.ts`. Already noted in 1.2.

---

## 3. UI surfacing

### 3.1 HRV tile is hardcoded to "--" on the home screen
Severity **N** · Effort S · Impact U

`apps/app/app/screens/HomeScreen.tsx:225-231`. Intentional per the
brief ("broken recoveryIndex-as-HRV fallback removed"), but the
HRV tile now shows `--` regardless of whether real HRV is available
in `sleepView.metrics["HRV (RMSSD)"]`. Plumb the real value through
instead of leaving the tile inert. Otherwise tapping the tile takes
the user to `HrvDetailScreen` which DOES show a number — that
discontinuity is jarring.

### 3.2 `HrvDetailScreen` synthesizes a flat HRV trend
Severity **S** · Effort M · Impact U/D

`apps/app/app/screens/HrvDetailScreen.tsx:82-89, 137-141`. The
"HRV · 7-night" chart maps every point's value to the **current**
night's HRV, producing a flat line. The trend chart looks valid
but is meaningless. Either:
- Add a real `hrvTrend` series to `/views/sleep` (the backend
  already has it in `/views/trends` — wire it through), or
- Hide the chart until real data exists.

The fact that there's a comment acknowledging this ("flat line
until per-night HRV trend exists") makes it a known-issue rather
than a bug, but the user-facing render is misleading.

### 3.3 `DeviceSettingsScreen` BatteryDetail typeof check
Severity **C** · Effort S · Impact —

`apps/app/app/screens/DeviceSettingsScreen.tsx:357-361`. The
`typeof value === "string"` branch renders the `Text` element;
otherwise it renders the raw value. Works because the only
non-string passed is `<LevelBar />`. If a future caller passes a
number, it'd hit the else branch and try to render the bare number
as a child — RN throws on that. Tighten the type:
`value: string | ReactElement`.

### 3.4 `DeviceSettingsScreen` icons `"sync"` etc. return null
Severity **S** · Effort S · Impact U

`apps/app/app/components/PhosphorIcon.tsx`'s `ALIAS_MAP` does not
contain `"sync"`. `DeviceSettingsScreen.tsx:244` passes
`name={isSyncing ? "sync" : "cloud-download-outline"}`. When
syncing, the icon renders nothing (the adapter at line 184 returns
`null` when COMPONENT_MAP misses). Same applies to
`LabsAccordion.tsx:35` (`"chevron-up"` / `"chevron-down"` —
neither aliased). Audit the full set of names you pass in and add
the missing entries. Suggested missing:
- `sync` → ArrowsClockwise or Repeat
- `chevron-up` / `chevron-down` → CaretUp / CaretDown
(plus any other Ionicon names from the prior swap that no longer
render).

### 3.5 `HomeDetailsScreen` ODI parsing regex is fragile
Severity **N** · Effort S · Impact D

`apps/app/app/screens/HomeDetailsScreen.tsx:34-39`. The ODI
numeric value is extracted by regex (`/ODI\s+([\d.]+)/`) from the
`detail` string of the `SpO2 Dips` metric. Backend formats this in
`views.service.ts:1336-1338` as `\`ODI ${selectedMetric.odiPerHour.toFixed(1)}/hr\``.
If backend formatting ever changes (e.g., comma decimals in some
locale), the regex silently returns null. Surface `odiPerHour`
directly through the metric (extra field) and bind on that
instead of round-tripping through display text.

### 3.6 `HomeDetailsScreen` Live Heart Rate chart never empties on disconnect
Severity **C** · Effort S · Impact U

`HomeDetailsScreen.tsx:72` always renders `realtimeSamples`. On
disconnect the buffer is cleared (BleContext line 805 / 833 path)
but if a connection-loss happens silently mid-stream the chart
shows a stale curve until the empty-state takes over. Cheap fix:
gate on `connectionState === "ready"`.

### 3.7 `DeviceScreen` and `DeviceSettingsScreen` duplicate battery UI
Severity **N** · Effort M · Impact U

Both screens render battery / voltage / temperature / icon level.
Same component code lives once in each. Extract a single
`<BatteryPanel/>` and reuse. Doubles as a single source of truth
for the formatting (`(mV/1000).toFixed(3)`, etc.).

---

## 4. Phosphor icon swap

### 4.1 Missing entries silently render `null`
Severity **S** · Effort S · Impact U

See 3.4. The adapter at
`apps/app/app/components/PhosphorIcon.tsx:184-186` returns `null`
when `COMPONENT_MAP[canonical]` is undefined. **Recommended
hardening**: in dev (`__DEV__`), log a warning or throw so missing
aliases surface immediately instead of producing blank icons.

```ts
if (!Component) {
  if (__DEV__) console.warn(`[PhosphorIcon] no icon for "${name}"`);
  return null;
}
```

### 4.2 `name=` is a free string at the type level
Severity **C** · Effort M · Impact —

`PhosphorIconName = AppIconName | keyof typeof ALIAS_MAP`. Several
call sites use `name={someDynamicString as any}` (e.g.,
`TrendsScreen.tsx:300`, `JournalEntryScreen.tsx:137`). The
adapter accepts anything via the `as Record<string, AppIconName>`
cast on line 182. Type safety is partial. Acceptable for a
migration, but track tightening it once the swap is fully stable.

### 4.3 Phosphor adds RN dependency footprint
Severity **N** · Effort — · Impact P (bundle)

`phosphor-react-native` ships a non-trivial set of SVG icons.
Verify that the metro/babel pipeline tree-shakes unused exports
(by default it doesn't unless you alias to per-icon imports).
Spot-check the production bundle size after the swap.

---

## 5. Scripts

### 5.1 `validate-sleep-stager.ts` is scaffold-only and exits non-zero on `--predictions-from=*`
Severity **N** · Effort — · Impact —

`apps/backend/src/scripts/validate-sleep-stager.ts:172-181`. Both
db and run branches `console.error('TODO: …')` then
`process.exit(1)`. If anyone runs the script expecting it to work
they'll see a non-helpful failure. Either:
- Stub a third `--predictions-from=fixture` path that reads a
  predictions JSON next to the labels JSON (immediately testable),
  or
- Print a clear "scaffold not yet wired" message before exiting.

### 5.2 Scripts write `.md` reports under `.fixtures/`
Severity **C** · Effort — · Impact —

`dump-battery-payloads.ts`, `correlate-unknown-events.ts`, and
`validate-sleep-stager.ts` write to `.fixtures/.../report.md`.
Verify `.fixtures/` is in `.gitignore` (it should be — these are
local-only artefacts) and that the scripts don't accidentally
write into the repo proper.

### 5.3 Scripts hardcode DB connection
Severity **C** · Effort S · Impact —

All three scripts open a `new DataSource(...)` with env-driven
defaults. They diverge slightly from the main `typeorm.datasource.ts`
config (synchronize false, no entities, no migrations). Acceptable
for one-off RE scripts. If you add more, factor a
`createScriptDataSource()` helper.

### 5.4 `correlate-unknown-events.ts` `bisectLeft` is O(log N) but the outer loop is O(M log N)
Severity (no finding) — call-out only. Correct and fast enough for the data volumes.

---

## 6. Inspector

### 6.1 `BatterySection` chart domain uses string sentinels
Severity **C** · Effort — · Impact —

`apps/inspector/src/tabs/Telemetry.tsx:396, 405`. Recharts accepts
`["dataMin - 50", "dataMax + 50"]` strings as domain — non-obvious
to readers. Comment or use numeric `domain={[dMin-50, dMax+50]}`
computed from the data. Cosmetic.

### 6.2 `EventBreakdown` parses unknown event numbers with `parseInt`
Severity **C** · Effort — · Impact —

`apps/inspector/src/tabs/Telemetry.tsx:250-251`. The `unknown_NNN`
form is generated by the backend; if NNN is ever non-numeric,
`parseInt(numStr, 10)` yields `NaN` and the conditional
`Number.isFinite(num)` correctly falls back to the raw string. No
finding — just verified.

### 6.3 Pipeline tab unaffected, but mind the live timer / battery refresh
Severity (no finding)

`live=true && tab==='telemetry'` triggers `refreshTelemetry` every
5s, which double-fetches `/debug/telemetry` and `/debug/battery-history`.
Verified the cleanup `clearInterval` handles cross-tab switches.

---

## 7. Cross-cutting / convention drift

### 7.1 `apps/app/app/services/ble/index.ts` doesn't re-export `MEMFAULT_UUID`
Severity **C** · Effort — · Impact —

Only used internally by ble-manager. Either keep it internal-only
or re-export with the rest for consistency. Lean toward keeping it
internal.

### 7.2 `noopClient.ts` lacks helpers for `/telemetry/imu` and `/telemetry/command-responses`
Severity **C** · Effort S · Impact —

`apps/app/app/services/api/noopClient.ts:897-902` defines
`ingestDeviceEvents` and `ingestRealtimeSamples`. The IMU and
command-response forwarders call `apiPost('/telemetry/imu', ...)`
directly via the generic `TelemetryForwarder` (line 65). Either:
- Add `ingestImuRecords` / `ingestCommandResponses` helpers for
  consistency, or
- Document the choice (forwarder owns its endpoint).

### 7.3 Field-validation duplication across mobile + backend
Severity **N** · Effort M · Impact —

The SOC / voltage / temperature / icon-level guards are duplicated
in two parsers (`BleContext.tsx`, `debug.service.ts`). Cross-cuts
1.9, 2.10 — same root cause, same fix.

### 7.4 No tests for the new parsers or `getBatteryHistory`
Severity **S** · Effort M · Impact D

`parseBatteryLevelEvent`, `parseExtendedBatteryEvent`,
`getBatteryHistory`, `deriveLiveStressLevel` — none have unit
tests. The deleted `sleep-stage-engine.spec.ts` (-59 LOC) likewise
removed coverage. Add at least:
- one fixture per parser shape (valid, malformed, out-of-range),
- a `getBatteryHistory` test that asserts latest-value
  precedence between evt3 and evt63,
- a `deriveLiveStressLevel` boundary test for the 10/25/50 bpm
  thresholds.

### 7.5 `liveStressLevel` is recomputed per render
Severity **N** · Effort S · Impact P

`apps/app/app/context/BleContext.tsx:954` calls
`deriveLiveStressLevel(deviceState.realtimeSamples)` inside the
`useMemo` body. Cheap (just a reduce over <=40 samples), but the
memo deps include `deviceState` so it runs on every state change.
Move the derivation onto `deviceState.realtimeSamples` only and
break out a per-field memo if useBle consumers start re-rendering
too aggressively.

---

## 8. Type / runtime safety scan

| Site | Concern |
|---|---|
| `BleContext.tsx:951` `liveStressLevel: number \| null` | typed in context — no `as any` casts |
| `views.service.ts:1131` `(selectedFeature as any).pnn50 ?? 0` | unchanged from prior session, still papering over |
| `pipeline.service.ts:1119` `as any` on entity create | unchanged |
| `BatteryDetail` value `ReactNode` | see 3.3 |
| `BatteryHistory.latest.capturedAt` typed `string \| null` but accessed without guard at `Telemetry.tsx:361` `formatTime(latestAt)` after a `typeof latest.capturedAt === "string"` narrowing — OK |

No `@ts-expect-error` introduced this session. No `any` regressions found.

---

## 9. Subtle bugs / race conditions

| # | File:line | Issue |
|---|---|---|
| a | BleContext.tsx:544-566 | Stale-closure on `deviceState.realtimeSamples` inside smart-wake interval (covered in 1.4) |
| b | BleContext.tsx:922-936 | smartWakeTimer not cleared on unmount |
| c | telemetry-forwarder.ts:235-249 | MEMFAULT chunks accumulate without newline (covered in 1.1) |
| d | telemetry-forwarder.ts:61-69 | On flush failure `buffer.unshift(...batch)` reorders if new pushes interleaved during the await — order not guaranteed, but acceptable for this domain |
| e | BleContext.tsx:733 | `commandResponseForwarder.push` even when `data.length === 0` (just sends null payload) — fine but produces noise rows for every poll |
| f | BleContext.tsx:707-718 | `onPacket("*")` handler force-promotes `connectionState` to "ready" on any packet — fights with the state machine. If a packet leaks during a reconnect-in-progress phase, the UI flickers to "ready". This was pre-existing, just noting. |

---

## 10. Top 5 follow-ups to ship before calling this "done"

1. **Fix the MEMFAULT line-buffer bug (1.1).** One-line code change.
   Without this, every "MEMFAULT subscription routed to console-log
   forwarder" claim is false on a live device.

2. **Decide what to do about `imu_records` (and `command_responses`).
   (1.2, 1.3, 2.5)** Either wire a reader, add retention, or feature-
   flag ingestion off. Currently each connected strap writes
   millions of rows/day to disk with no consumer — this becomes a
   production fire long before anyone notices, and the cost compounds
   per user.

3. **Backfill `sleepScore` post-migration. (2.1)** Either run an
   opportunistic backfill in the migration body or force a pipeline
   rerun on next boot, so users don't see `--` in their sleep ring
   for the days between last sync and the column add.

4. **Harden the Phosphor adapter and audit existing call sites.
   (3.4, 4.1)** Add a dev warning for missing icons, plus the missing
   aliases (`sync`, `chevron-up`, `chevron-down`, anything else).
   This is the kind of silent-null breakage QA misses.

5. **Smart-wake monitor rebuild or removal. (1.4)** As shipped, the
   feature has a stale-closure bug, an unbounded-cleanup path, an
   undersized HR buffer, and a foreground-only ceiling on iOS.
   The honest options are (a) lift it onto the iOS background BLE
   stack now under development, or (b) remove the timer and label
   the toggle as "informational only" in the settings copy until
   the native scheduler exists.

Other items (HRV-trend synthesis in HrvDetailScreen, dedupe range
guards, write parser tests) are real follow-ups but lower-priority
than the above five.

---

## Verification status — what was checked end-to-end

- Migrations apply cleanly: `1779500000000` (column add) and
  `1779600000000` (table create) are well-formed; column types and
  index match entities.
- No orphan import references to the deleted `sleep-stage-engine.ts`
  (grep across `apps/backend/src` clean — only a research doc
  reference, which is out of scope).
- TelemetryModule entity registration covers all five entities and
  the controller exposes routes for all of them.
- Inspector `BatteryHistory` type matches the backend response
  shape exactly (verified field-by-field).
- `recoveryIndex` removed from the home/sleep view payloads;
  database column and pipeline write retained; no mobile screen
  reads it; `HomeScreen` HRV tile is "--" (intentional).
- `deviceInfo` aggregation in `getTelemetry` now iterates oldest →
  newest so latest log line wins (verified ordering matches the
  inline comment).
