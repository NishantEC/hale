# noop ↔ WHOOP ↔ RE-projects Feature Matrix Audit

Internal audit of `/Users/nish/Documents/noop`. Cross-references the shipped
code against the bundled reverse-engineering projects (Rust `openwhoop`,
Python `openWhoop-2`, JS `whoomp.js`) and against WHOOP's published feature
surface (sourced from `research/whoop-features-deep-dive.md`).

Generated: 2026-05-14. File-path references use absolute paths.

---

## 1. Our currently shipped surface

Everything in this section is real code in the monorepo today.

### 1.1 BLE / strap stack (mobile)

Lives in `/Users/nish/Documents/noop/apps/app/app/services/ble/`.

| Capability | File / line anchors |
|---|---|
| GATT service + 5 characteristic UUIDs (incl. MEMFAULT documented but unsubscribed) | `apps/app/app/services/ble/packet-types.ts:1-7` |
| SOF=0xAA framing, CRC-8 (poly 0x07) header, CRC-32 (refl. 0xEDB88320) payload | `apps/app/app/services/ble/packet-codec.ts:6-46` |
| Frame encode/decode | `apps/app/app/services/ble/packet-codec.ts:51-124` |
| Multi-fragment packet assembler (notification-stream → whole packets) | `apps/app/app/services/ble/packet-assembler.ts` |
| Command builder (24+ commands) | `apps/app/app/services/ble/command-service.ts:23-131` |
| BLE manager (scan, connect, autoConnect, MTU negotiation, subscribe notifs) | `apps/app/app/services/ble/ble-manager.ts` |
| Historical sync driver w/ high-freq sync (cmd 96/97), idle timer, ACK metadata | `apps/app/app/services/ble/history-downloader.ts:24-245` |
| V12/V24 (full sensor) + generic (HR+RR-only) historical record parsers | `apps/app/app/services/ble/history-parser.ts:27-211` |
| IMU stream parser (PacketType 51 + 52, BE i16 ×6 axes, 100 samples/packet) | `apps/app/app/services/ble/imu-parser.ts:46-89` |
| Console-log filtering (strip 0x34 0x00 0x01 markers, UTF-8 decode) | `apps/app/app/context/BleContext.tsx:744-758` |
| Event-payload forwarder (every `PacketType.Event` ships to backend as base64) | `apps/app/app/context/BleContext.tsx:709-716` |
| Realtime HR forwarder + session tagger | `apps/app/app/services/ble/index.ts` (`RealtimeSessionForwarder`) |
| Generic batching telemetry forwarder (events / realtime / console-logs) | `apps/app/app/services/ble/telemetry-forwarder.ts:13-100` |

### 1.2 BLE context (live state in the mobile app)

`apps/app/app/context/BleContext.tsx` (881 LOC) is the single source of truth
for device state. It surfaces:

| Surface | Field | Source |
|---|---|---|
| Connection state | `connectionState`, `deviceName`, `firmwareVersion`, `deviceClock`, `isWorn` | lines 75-94 |
| Battery (cmd 26 / event 3 / event 63) | `batteryLevel`, `batteryVoltageMv`, `batteryTemperatureC`, `batteryIconLevel`, `isCharging` | lines 159-199 (parsers), 664-690 (event routing) |
| Realtime HR | `realtimeHeartRate`, `realtimeSamples` (rolling 40) | lines 241-245, 719-733 |
| Toggles | `isRealtimeHeartRateEnabled`, `isBroadcastHeartRateEnabled`, `isRawDataStreamingEnabled` | lines 415-487 |
| Strap alarm | `strapAlarmAt`, `strapAlarmArmed`, plus arm/disarm/test | lines 489-543 |
| Sync flow | `isSyncing`, `syncStage`, `syncProgress`, `syncSummary`, `lastSyncAt` | lines 338-413 |
| Scanned devices | `scannedDevices` | lines 298-315 |

Auto-behaviors live in the big `useEffect` (lines 572-808):

- `bleManager.autoConnect()` on mount.
- On `ready` → start eventForwarder, realtimeForwarder, consoleLogForwarder;
  refresh device state; `maybeAutoSync` if >3 min since last sync;
  start Android foreground service.
- Background packet drainer (debounced 1500 ms) when AppState is not active.
- `syncTimer` every 2 min, `batteryPollTimer` every 30 s.
- Battery event-3 parser: SOC tenths @[10..11], voltage mV @[14..15] (lines 167-177).
- Battery event-63 (`ExtendedBatteryInformation`) parser: voltage @[14..15],
  temp tenths °C @[16..17], icon level @[21], SOC tenths @[25..26] (lines 185-199).
- Charging on/off, wrist on/off, BLE realtime/raw-data state-mirroring events.

### 1.3 Mobile screens

Inventory under `apps/app/app/screens/`:

| Screen | LOC | Purpose |
|---|---|---|
| `HomeScreen.tsx` | 542 | Home dashboard: recovery hero, stat grid, HK feed, FAB |
| `HomeMetricScreen.tsx` | — | Drill-in for a single home metric |
| `HomeDetailsScreen.tsx` | — | Extended detail page |
| `HealthScreen.tsx` | 600+ | Healthspan / noop Age + Pace of Aging + sections |
| `SleepDetailScreen.tsx` | 329 | Hypnogram, vitals, sleep score, why-panel, labs accordion |
| `SleepPlannerScreen.tsx` | 491 | Target sleep, alarm, smart wake config |
| `StrainActivityScreen.tsx` | 220 | Activity feed + strain drill-in |
| `TrendsScreen.tsx` | 345 | Multi-metric trend lines |
| `HrvDetailScreen.tsx` | 226 | HRV detail |
| `JournalEntryScreen.tsx` | 400 | Add journal entry |
| `JournalHistoryScreen.tsx` | 429 | List journal entries |
| `SettingsScreen.tsx` | 651 | App settings |
| `DeviceScreen.tsx` | — | Connected strap detail |
| `DeviceSettingsScreen.tsx` | — | Toggle realtime HR / broadcast HR / raw stream |
| `LoginScreen.tsx` | 452 | Better-Auth based login |
| `WelcomeScreen.tsx` | 84 | First-run welcome |
| `DebugInspectorScreen.tsx` | — | In-app debug |

### 1.4 Mobile sync stack

`apps/app/app/services/sync/`:

| File | Role |
|---|---|
| `SyncService.ts` | Periodic drain + on-demand drain+pull orchestrator |
| `bleIngest.ts` | Maps `HistoricalRecord` → local SQLite `raw_sensor_records` |
| `uplinkDrainer.ts` | Drains local `outbound_queue` to backend `/pipeline/ingest-table` |
| `downlinkPuller.ts` | Pulls server-mutated tables down |
| `backgroundSync.ts` | iOS/Android background-task entry |
| `backgroundCatchupTask.ts` | Catches up sleep + scoring on wake |
| `androidForegroundService.ts` | Android FGS to keep BLE alive |
| `refreshAllViews.ts` | Triggers `/views/{home,sleep,trends,health}` refetch |
| `retentionSweeper.ts` | Local data pruning |
| `forceUpload.ts` | Diagnostic-only push |
| `syncTelemetry.ts` | Sync-event observability |

### 1.5 Backend

Major module roots (`apps/backend/src/`):

| Module | Surface area |
|---|---|
| `pipeline/` | Ingest (raw sensors + signal samples) + run pipeline + results |
| `processing/` | Pure-function algorithm zoo (32 .ts files) |
| `views/` | Home / Sleep / Trends API shapes (the dashboard contract) |
| `sleep/` | `sleep_detections`, `sleep_stages`, `night_features` entities |
| `wellness/` | `daily_scores`, `daily_metrics`, `signal_samples` entities |
| `activity/` | Activity, HealthKit workouts, daily summaries, motion + barometer samples |
| `plans/` | `baseline_profile`, `sleep_plan` entities |
| `journal/` | Free-text journal entries + factor tags |
| `telemetry/` | Device events, realtime samples, console logs |
| `health/` | Healthspan / noop Age / Pace of Aging service |
| `liveness/` | Probe endpoints |
| `auth/` | Better-Auth integration |
| `sync/` | Mobile<->backend `push`/`pull` per table |
| `debug/` | Inspector backend (overview, raw-records, pipeline-state, pipeline-runs, …) |

Endpoints actually exposed:

```
POST /pipeline/ingest               apps/backend/src/pipeline/pipeline.controller.ts:26
POST /pipeline/ingest-table         pipeline.controller.ts:41 (generic outbound_queue sink)
POST /pipeline/run                  pipeline.controller.ts:52
GET  /pipeline/results              pipeline.controller.ts:67
GET  /views/home                    apps/backend/src/views/views.controller.ts:26
GET  /views/sleep                   views.controller.ts:42
GET  /views/trends                  views.controller.ts:58
GET  /views/health                  apps/backend/src/health/health.controller.ts:27
GET  /views/health/profile          health.controller.ts:48
POST /journal                       apps/backend/src/journal/journal.controller.ts:22
GET  /journal                       journal.controller.ts:33
POST /telemetry/events              apps/backend/src/telemetry/telemetry.controller.ts:13
POST /telemetry/realtime            telemetry.controller.ts:18
POST /telemetry/console-logs        telemetry.controller.ts:23
GET  /debug/overview                apps/backend/src/debug/debug.controller.ts:26
GET  /debug/raw-records             debug.controller.ts:41
GET  /debug/sleep-night             debug.controller.ts:57
GET  /debug/pipeline-results        debug.controller.ts:72
GET  /debug/pipeline-state          debug.controller.ts:82
GET  /debug/pipeline-runs           debug.controller.ts:92
POST /debug/pipeline/run            debug.controller.ts:103
POST /debug/views/recompute        debug.controller.ts:124
GET  /debug/telemetry               debug.controller.ts:139
GET  /debug/battery-history         debug.controller.ts:150
POST /debug/seed                    debug.controller.ts:161
POST /sync/push                     apps/backend/src/sync/sync.controller.ts:12
GET  /sync/pull                     sync.controller.ts:24
GET  /sync/:tableName               sync.controller.ts:38
POST /activity                      apps/backend/src/activity/activity.controller.ts:33
GET  /activity                      activity.controller.ts:10
```

### 1.6 Inspector

`apps/inspector/src/tabs/`:

- `Overview.tsx` — top-level KPIs
- `Pipeline.tsx` — pipeline-state (clean/dirty), pipeline-runs chart, results
- `Sleep.tsx` — night drill-down with hypnogram + sleep-period overlay
- `Trends.tsx` — trend chart matrix
- `Insights.tsx` — today vs baseline panel (sprint B/C output)
- `Telemetry.tsx` — device-events, realtime-samples, battery chart
- `Raw.tsx` — raw-record stream view

---

## 2. Backend pipeline stages

Source: `apps/backend/src/pipeline/pipeline.service.ts` — single `runPipeline()`
method, stages timestamped via the `mark()` helper at line 309.

Inputs into the pipeline (from `apps/backend/src/pipeline/entities/`):

- `raw_sensor_records` — strap-derived V12/V24 + generic per-timestamp rows. 18
  nullable sensor columns (`raw-sensor-record.entity.ts:22-71`).
- `signal_samples` — pre-conditioned `{heartRate, ibiMs, motionScore, qualityScore, source}`
  samples (mobile-side or derived).
- `journal_entries` — user-tagged factors.
- `baseline_profile` — per-user RHR / RMSSD / SDNN / nightsUsed / maxHR.
- `sleep_plans` — `targetSleepMinutes`, `alarmEnabled`, `smartWakeEnabled`, `wakeMinutes`.

Persistent outputs (every stage is inside one transaction; see line 544):

| Stage | Function | Input | Output entity | Watermark |
|---|---|---|---|---|
| 0 — skip check | `maxInputUpdatedAt()` (line 849) | `max(updatedAt)` over raw + signal | `PipelineState.lastInputMaxUpdatedAt` | short-circuit when unchanged |
| 1 — fetch | `Promise.all` (line 316) | 45-day window or `opts.from`/`opts.to` | in-memory | — |
| 2 — sanitize | `sanitize()` from `ppg-quality-gate.ts` (line 390) | `signalSamples` | sanitized samples | — |
| 3 — sleep detection | `SleepEventEngine.detect()` (line 392) | sensorRecords + timeZone | `sleep_detections` (`sleep/entities/sleep-detection.entity.ts`) | nightDate |
| 4 — activity detection | `detectActivities()` + `applyHealthkitReclassifiers()` (lines 396-407) | sensorRecords + sleepDetections + baseline + HealthKit | `activity_detections` (`activity/entities/activity-detection.entity.ts`) | startTime |
| 5 — epoch features | `extractEpochFeatures()` per detection (line 423) | sensorRecords + nightMedianHR | in-memory `EpochFeature[]` | — |
| 6 — sleep staging | `classifySleepStages()` — "quantile-v1" (line 432) | epoch features + detections | `sleep_stages` (REM/Core/Deep/Awake mins + epochTimeline jsonb) | nightDate |
| 7 — night features | `buildNightFeatureSet()` + `effectiveSleepFeatureSet()` (lines 435-469) | samples + baseline + per-night detection | `night_features` (RMSSD, SDNN, pNN50, resp rate, RHR, continuity, regularity, sleepEstimateHours, sourceBlend, confidence) | nightDate |
| 8 — baseline recompute | `recomputeBaselineProfile()` (line 474) | per-night effectiveFeatures | `baseline_profiles` | — |
| 9 — daily scores | `computeDailyScore()` (line 480) | features + recomputedBaseline + targetSleepMinutes | `daily_scores` (`dailyBalance`, `loadPressure`, `sleepReserveHours`, `confidence`, `recommendation`, `detail`) | dayDate |
| 10 — sleep score | `computeSleepScoreForNight()` (line 491) | detection + stage + feature + baseline | inlined into `daily_scores.detail`, recomputed live on home/sleep views | — |
| 11 — derived metrics | `precomputeMetricSeries()` + `computeDerivedMetrics()` (lines 507-525) | sanitized + sensorRecords + features + detections + baseline | `daily_metrics` (stress, SpO2, skin temp, strain, consistency, LF/HF, recoveryIndex, trainingLoadRatio, trainingLoadRiskZone, spo2DipCount, odiPerHour, lowestSpo2, coreTemperatureEstimate, circadianNadir, sleepArchitectureScore) | dayDate |
| 12 — typical ranges | `computeTypicalRanges()` (line 527) | detections + stages | derived live, not persisted | — |
| 13 — journal correlations | `journalSleepCorrelations()` (line 528) | journal entries + stages + detections | derived live | — |
| 14 — prune + upsert + history | inside transaction (lines 544-673); pipeline-state watermark also written | each per-day output | watermark + `pipeline_runs` (append-only) | — |

`pipeline_runs` is append-only by design (see `apps/backend/src/pipeline/entities/pipeline-run.entity.ts`)
so the inspector's regression-watch chart (`apps/inspector/src/components/PipelineRunsChart.tsx`)
can plot per-stage timings vs. budget (default 45 s, `PIPELINE_BUDGET_MS` env).

Algorithm source files in `apps/backend/src/processing/`:

| File | LOC | Owns |
|---|---|---|
| `activity-detector.ts` | 379 | Walking/Running/Cycling/Sedentary detection (cadence-FFT) |
| `core-temperature.ts` | 48 | Estimates core T from skin T + HR |
| `derived-metrics.ts` | 541 | Per-day stress/SpO2/skin-temp/strain/recovery/training-load bundle |
| `epoch-features.ts` | 280 | 30-s epochs: HR mean+std, motion, IBI features, resp rate |
| `healthkit-workout-matcher.ts` | 103 | Apple-Workout match → override activity type |
| `healthspan.ts` | 293 | noop Age: per-metric hazard slopes + section aggregation + Pace |
| `hiking-detector.ts` | 65 | Reclassify long walking + flights climbed as Hiking |
| `hrv-frequency.ts` | 169 | FFT (Hann + radix-2) for HRV & cadence; LF/HF |
| `journal-correlations.ts` | 127 | Δ(deep/REM) per factor tag |
| `ppg-quality-gate.ts` | 21 | Drops low-quality samples |
| `recovery-index.ts` | 92 | Weighted index (40% HRV / 25% sleep / 15% strain / 10% SpO2 / 10% temp) |
| `respiratory-sinus-arrhythmia.ts` | 109 | RSA proxy |
| `sleep-architecture.ts` | 122 | Per-night architecture score |
| `sleep-event-engine.ts` | 403 | Gravity-delta still-time → sleep periods + interruptions + continuity |
| `sleep-need.ts` | 90 | Strain-modifier + debt accumulator |
| `sleep-score.ts` | 57 | Composite sleep score per night |
| `sleep-stage-classifier.ts` | 318 | "quantile-v1" 4-class stager (rank-allocate to priors) |
| `sleep-stage-engine.ts` | 382 | Older RF v1 (sleep-rf-v1.json) classifier — kept as fallback |
| `spo2-events.ts` | 117 | Desat events / ODI |
| `stair-detector.ts` | 140 | Z-axis impact + flights signature |
| `training-load.ts` | 50 | ACWR (7-day vs 28-day EWMA) |
| `typical-ranges.ts` | 95 | Per-user typical sleep stage/duration ranges |
| `utils.ts` | 41 | percentile, average, std, clamp |
| `vo2max.ts` | 26 | Uth-Sørensen passive estimate |
| `wellness-scoring.ts` | 489 | `buildNightFeatureSet` + `computeDailyScore` + baseline recompute |

---

## 3. Feature matrix

Legend: ✅ = working code on disk; 🟡 = partial / placeholder; ❌ = absent; n/a = doesn't apply.

### 3.1 Protocol / transport

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| GATT service `61080001…` | ✅ | ✅ `openwhoop-codec` | ✅ `protocol/constants.py` | ✅ `whoomp.js:6` | ✅ `packet-types.ts:1-7` | All four implementations agree on UUIDs |
| SOF/CRC8/CRC32 framing | ✅ | ✅ `packet.rs` | ✅ `protocol/packet.py` + `crc.py` | ✅ `packet.js` | ✅ `packet-codec.ts` | |
| Multi-fragment reassembly | ✅ | ✅ | ✅ `protocol/assembler.py` | ✅ inline | ✅ `packet-assembler.ts` | |
| Bonding / pairing | ✅ | ✅ via OS | ✅ via bleak/OS | 🟡 Web-Bluetooth pair only | ✅ via `react-native-ble-plx` OS-level | |
| MTU negotiation | ✅ | ✅ | ✅ | ✅ | ✅ `ble-manager.ts` | |
| autoConnect / reconnect | ✅ | ✅ | ✅ | ❌ | ✅ `BleContext.tsx:573` | |
| High-freq sync (cmd 96/97) | ✅ | ✅ | ✅ | ❌ | ✅ `command-service.ts:116-122`, used in `history-downloader.ts:60` | OW-Rust originated the 90× speedup pattern |
| MEMFAULT char (`…0007`) | ✅ | 🟡 doc'd | 🟡 doc'd | ❌ | ❌ documented in `docs/whoop-ble-protocol-reference.md:25` only | We never subscribe |
| Heart Rate Service 0x180D | ✅ | n/a | n/a | n/a | ✅ enabled via cmd 14 `command-service.ts:47-51` | |

### 3.2 Decoded signals

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| V12/V24 sensor packet (77+B) | ✅ | ✅ `whoop_data.rs` | ✅ `protocol/decoder.py` | ❌ couldn't crack it | ✅ `history-parser.ts:94-127` | OW-Rust's V12/V24 discriminator was the unlock |
| Generic HR-only packet | ✅ | ✅ | ✅ | ✅ basic | ✅ `history-parser.ts:129-165` | Generic packets carry HR+RR only; merged via COALESCE upsert |
| HR (live, cmd 3 → `RealtimeData` 40) | ✅ | ✅ | ✅ | ✅ | ✅ `BleContext.tsx:241-245, 719` | byte [5] = HR |
| HR (historical, V12/V24 byte 14) | ✅ | ✅ | ✅ | ✅ | ✅ | |
| RR intervals (u16 LE × ≤4) | ✅ | ✅ | ✅ | ✅ | ✅ `history-parser.ts:46-52` | |
| Gravity (f32 LE × 3, offset 33/37/41) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:54-56` | |
| Skin contact (byte 48) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:57` | |
| SpO2 raw red+IR (offset 61/63) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:58-59` | |
| Skin temp raw (offset 65) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:60` | |
| PPG green + red/IR ADCs (26/28) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:62-63` | |
| Ambient light (67), LED drive 1/2 (69/71) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:64-66` | |
| Signal quality (75) | ✅ | ✅ | ✅ | ❌ | ✅ `history-parser.ts:67` | |
| `resp_rate_raw` (offset 73) | ✅ | ✅ decoded, unused | ✅ decoded, unused | ❌ | ✅ decoded **and used** — `epoch-features.ts` averages → `night_features.respiratoryRate` | We surface what the others leave on the floor |
| IMU stream (PacketType 51/52) | ✅ | ✅ | ✅ | ❌ | ✅ `imu-parser.ts:46-89` (52 Hz, ÷1875 g, ÷15 °/s) | Decoded but only logged today — `BleContext.tsx:735-741` |
| Console logs (PacketType 50) | ✅ | ✅ | ✅ | ❌ | ✅ + structured parsing — `console-log-parser.ts:9-66` (firmwareVersion, branch, serialNumber, nordicVersion, AFE ID, accelerometer, `FG SOC (tenths)`, advertising name, flash chip, "Historical Dump Complete", high-freq duration) | Backend parser stores structured metadata |

### 3.3 Battery (this turn's focus)

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| Battery SOC (cmd 26 response) | ✅ | ✅ | ✅ | ✅ | ✅ `BleContext.tsx:159-164`, polled every 30 s line 791 | |
| Battery event 3 (`BatteryLevel`) SOC | ✅ | 🟡 doc'd | 🟡 doc'd | 🟡 fired but not parsed | ✅ **today's change** — `BleContext.tsx:167-177` parses SOC tenths @[10..11] + voltage mV @[14..15] | We're first to decode the event-3 voltage |
| Battery event 63 (`ExtendedBatteryInformation`) | ✅ | ❌ | ❌ | ❌ | ✅ **today's change** — `BleContext.tsx:185-199` parses voltage @[14..15], temp ×10°C @[16..17], icon level @[21], SOC tenths @[25..26] | Differentiator: temp + icon level + cross-checked SOC |
| RE script for arbitrary event byte stats | n/a | n/a | n/a | n/a | ✅ `apps/backend/src/scripts/dump-event-payloads.ts` (parameterised), specialised version `dump-battery-payloads.ts` with charging-transition validation | Lets us crack any new event in minutes |
| Charging on/off (events 7/8) | ✅ | ✅ | ✅ | ✅ | ✅ `BleContext.tsx:684-687` | |
| Console-log `FG SOC (tenths)` fuel-gauge | ✅ | ❌ | ❌ | ❌ | ✅ `console-log-parser.ts:46-49` + cross-correlated against events in `dump-battery-payloads.ts:182-227` | We're the only stack that triangulates battery vs the fuel-gauge ground truth |

### 3.4 Algorithm features

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| Sleep detection (wake/sleep) | ✅ | ✅ gravity-delta `sleep.rs` | ✅ same `algos/sleep.py` | ❌ | ✅ `sleep-event-engine.ts` (gravity-delta + interruption + continuity) | |
| 4-class sleep staging (W/Light/Deep/REM) | ✅ | ❌ | ❌ | ❌ | ✅ "quantile-v1" `sleep-stage-classifier.ts` + RF v1 fallback `sleep-stage-engine.ts` | We're the only RE-class stack with stages |
| Smart-wake (REM/light window before alarm) | ✅ | ❌ | ❌ | ❌ | 🟡 schema + flag only — `sleep-plans.smartWakeEnabled`; live calc in `views.service.ts:1368-1377` | Mobile UI doesn't trigger silent alarm yet |
| HRV — RMSSD time-domain | ✅ | ✅ rolling-300 `sleep.rs:75` | ✅ `algos/hrv.py` | ✅ `whoomp.js` HRV ext | ✅ `wellness-scoring.ts:59` | |
| HRV — SDNN | ✅ | ✅ | ✅ | ✅ | ✅ `wellness-scoring.ts:62` | |
| HRV — pNN50 | ✅ | ❌ | ❌ | ❌ | ✅ `wellness-scoring.ts:65` | |
| HRV — frequency-domain (LF/HF Welch) | ✅ | ❌ | ❌ | 🟡 partial | ✅ `hrv-frequency.ts` + `daily_metrics.lfHfRatioAverage` | |
| HRV — Poincaré SD1/SD2 | ✅ | ❌ | ❌ | ❌ | ✅ derived live in `views.service.ts:1272-1290` from RMSSD + SDNN | |
| HRV-CV (7-day stdev/mean) | ✅ 2025 publication | ❌ | ❌ | ❌ | ✅ `views.service.ts:1411-1433` | |
| Stress index (Baevsky / similar) | ✅ Stress Monitor | ✅ `stress.rs` | ✅ `stress.py` | ❌ | ✅ via `daily_metrics.stressAverage` (precomputed in `derived-metrics.ts`) | |
| SpO2 (ratio-of-ratios) | ✅ | ✅ `spo2.rs` | ✅ `spo2.py` | ❌ | ✅ in derived-metrics + `daily_metrics.spo2Average` | |
| SpO2 dip count + ODI/hr | ❌ (WHOOP shows nightly average only) | ❌ | ❌ | ❌ | ✅ `spo2-events.ts:detectDesaturationEvents` + `daily_metrics.spo2DipCount`, `odiPerHour`, `lowestSpo2` | Differentiator |
| Skin temp °C + delta from baseline | ✅ | ✅ `temperature.rs` | ✅ `temperature.py` | ❌ | ✅ `daily_metrics.skinTempAvgCelsius`, `skinTempDeltaCelsius` | |
| Core temp estimate | 🟡 not WHOOP product | ❌ | ❌ | ❌ | ✅ `core-temperature.ts` + `daily_metrics.coreTemperatureEstimate` | |
| Circadian nadir | ✅ feature of healthspan | ❌ | ❌ | ❌ | ✅ `daily_metrics.circadianNadir` | |
| Strain (Edwards TRIMP 0–21) | ✅ (with muscular fusion) | ✅ `strain.rs` | ✅ `strain.py` | ❌ | ✅ `daily_metrics.strainScore` | We're HR-only — no muscular fusion |
| Training load ratio (ACWR) | 🟡 implicit | ❌ | ❌ | ❌ | ✅ `training-load.ts` + `daily_metrics.trainingLoadRatio`, `trainingLoadRiskZone` | Differentiator |
| Recovery score (0–100) | ✅ | ❌ | ❌ | ❌ | ✅ `wellness-scoring.computeDailyScore` (dailyBalance) + composite `recovery-index.ts` | Two paths — dailyBalance is shipped, `recoveryIndex` is composite stored field |
| Sleep score (0–100) | ✅ | 🟡 raw "score" field in `SleepCycle` | ❌ | ❌ | ✅ `sleep-score.ts` (uses target, stage breakdown, baseline) | |
| Sleep need / debt | ✅ | ❌ | ❌ | ❌ | ✅ `sleep-need.ts` (strain modifier + debt accumulator) — surfaced live `views.service.ts:1235-1262` | |
| Sleep consistency | ✅ | ✅ `sleep_consistency.rs` | ✅ `sleep_consistency.py` | ❌ | ✅ `daily_metrics.sleepConsistencyScore` | |
| Sleep architecture score | ✅ | ❌ | ❌ | ❌ | ✅ `sleep-architecture.ts` + `daily_metrics.sleepArchitectureScore` | |
| Strain Coach (target band from recovery) | ✅ | ❌ | ❌ | ❌ | ✅ derived live in `views.service.ts:1208-1219` | |
| Activity classification (walk / run / cycle) | ✅ (many types + ML) | ✅ cadence-FFT `activity.rs` | ✅ `activity.py` | ❌ | ✅ `activity-detector.ts` — 12 types incl. Stair Climb, Hiking, HIIT, Strength | Strength is a label only — no rep detection |
| Stair climbing detection | ✅ (uses HK flights) | ❌ | ❌ | ❌ | ✅ `stair-detector.ts` (Z-axis impact + flightsClimbed cross-check) | |
| Hiking detection | ✅ | ❌ | ❌ | ❌ | ✅ `hiking-detector.ts` (duration ≥ 20 min + flightsClimbed + HR) | |
| HealthKit workout cross-match | ✅ (Apple Watch ingest) | ❌ | ❌ | ❌ | ✅ `healthkit-workout-matcher.ts` (Apple workout overrides our heuristic label) | |
| VO2 max (passive Uth) | ✅ (3-tier) | ❌ | ❌ | ❌ | ✅ `vo2max.ts:computeVo2MaxUth` — surfaced in `views.service.ts:1193-1202` | Uth ratio only; not the 3-tier WHOOP model |
| Healthspan / noop Age / Pace | ✅ flagship | ❌ | ❌ | ❌ | ✅ `healthspan.ts` (293 LOC) + `health/health-assessment.service.ts` | 9 of 9 WHOOP factors stubbed; slopes tuned to public hazard ratios |
| Journal entries + factor correlations | ✅ (monthly behavior report) | ❌ | ❌ | ❌ | ✅ `journal/` module + `journal-correlations.ts` (Δ deep/REM per factor) | |

### 3.5 Device-control features

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| Set / get device clock | ✅ | ✅ | ✅ | ✅ | ✅ `command-service.ts:35-78` | |
| Get firmware version (Harvard / Boylston) | ✅ | ✅ | ✅ | ✅ | ✅ `BleContext.tsx:201-213` | |
| GetHelloHarvard (charging + wrist at fixed offsets) | ✅ | ✅ | ✅ | ✅ | ✅ `BleContext.tsx:630-661` | We parse charging @[7] + wrist @[116] |
| Strap-driven (silent) alarm | ✅ | ✅ command decoded | ✅ command decoded | ✅ button in UI | ✅ `command-service.ts:80-102`, `BleContext.tsx:489-542` (arm / disarm / test) | Mobile UI complete |
| Haptics pattern fire | ✅ | ✅ command decoded | ✅ command decoded | ✅ button | 🟡 enum present (`CommandNumber.RunHapticsPattern=79` in `packet-types.ts:43`) but no builder, no UI | Easy add |
| Real-time HR toggle (cmd 3) | ✅ | ✅ | ✅ | ✅ | ✅ `command-service.ts:43-45` + UI toggle | |
| Generic HR profile toggle (cmd 14) | ✅ | ✅ | ✅ | ✅ | ✅ `command-service.ts:47-52` + UI toggle |  |
| Raw data start/stop (cmds 81/82) | ✅ | ✅ | ✅ | ✅ | ✅ + UI toggle | |
| IMU mode toggle (cmd 106) | ✅ | ✅ | ✅ | ❌ | ✅ `command-service.ts:124-126` — no UI yet | |
| Optical data enable (cmd 107) | ✅ | ✅ | ✅ | ❌ | ✅ `command-service.ts:128-130` — no UI yet | |
| Reboot strap (cmd 29) | ✅ | ✅ | ✅ | ✅ | ✅ `command-service.ts:104-106` — no UI surface yet | |
| Firmware update (cmds 36/37/38/45/142–144) | ✅ | 🟡 commands listed | 🟡 commands listed | ❌ | ❌ — protocol-doc'd, no builders | Large effort |
| ForceTrim (erase device memory, cmd 25) | ✅ | ✅ documented | ✅ documented | ❌ | ❌ | Intentional — destructive |
| Reset fuel gauge (cmd 99) | ✅ | 🟡 | 🟡 | ❌ | ❌ | |
| SelectWrist L/R (cmd 123) | ✅ | 🟡 | 🟡 | ❌ | ❌ | |

### 3.6 Storage / data plane

| Feature | WHOOP official | OpenWhoop (Rust) | OpenWhoop-2 (Python) | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| Local DB | cloud | SQLite | SQLite via SQLAlchemy | local file | expo-sqlite on device (`apps/app/app/services/db/`) + Postgres backend | |
| Cloud sync | ✅ | ❌ | ❌ | ❌ | ✅ mobile→backend uplinkDrainer + downlinkPuller | |
| Pipeline incremental watermark | n/a | ❌ | ❌ | ❌ | ✅ `PipelineState.lastInputMaxUpdatedAt` short-circuit (`pipeline.service.ts:266-302`) | Differentiator |
| Pipeline run history | n/a | ❌ | ❌ | ❌ | ✅ append-only `pipeline_runs` w/ per-stage `stages` jsonb | |
| Calendar-day timezone-aware key-grouping | ✅ | partial | partial | ❌ | ✅ `apps/backend/src/common/calendar.ts` | |
| Self-healing duplicate-row delete | n/a | ❌ | ❌ | ❌ | ✅ `findOneByCalendarDay` in `pipeline.service.ts:871-895` | |
| COALESCE upsert on raw_sensor_records | n/a | basic upsert | basic upsert | n/a | ✅ `upsertRawSensorRows` `pipeline.service.ts:1386-1447` (HR=0 sentinel handling) | |
| Per-user baseline (auto warm-up at 5 nights) | ✅ | ❌ | ❌ | ❌ | ✅ `baseline_profile.isWarmedUp = nightsUsed ≥ 5` | Gates HRV/RHR penalties |

### 3.7 UI / product

| Feature | WHOOP official | OpenWhoop | OpenWhoop-2 | whoomp.js | Our app | Notes |
|---|---|---|---|---|---|---|
| Home dashboard w/ rings | ✅ | ❌ | ❌ | ❌ | ✅ `HomeScreen.tsx` + `/views/home` | |
| Hypnogram chart | ✅ | ❌ | ❌ | ❌ | ✅ `SleepDetailScreen.tsx` + `HypnogramChart` (epochMinutes-aware) | |
| Trends multi-metric | ✅ | ❌ | ❌ | 🟡 single chart | ✅ `TrendsScreen.tsx` + `/views/trends` | |
| Journal w/ factor tags | ✅ | ❌ | ❌ | ❌ | ✅ `JournalEntryScreen.tsx`, `JournalHistoryScreen.tsx`, factor correlations | |
| Sleep planner (target + alarm + smart-wake) | ✅ | ❌ | ❌ | ❌ | ✅ `SleepPlannerScreen.tsx` + `sleep_plans` table | |
| Strain coach band | ✅ | ❌ | ❌ | ❌ | ✅ live in `views.service.ts:1209-1219` | |
| Healthspan screen | ✅ | ❌ | ❌ | ❌ | ✅ `HealthScreen.tsx` | |
| Inspector / debug UI | n/a | n/a | n/a | minimal web debug | ✅ separate `apps/inspector` web app | Differentiator |

---

## 4. Gaps — what WHOOP / RE community has that we don't

Each row: gap location, effort, value.

### 4.1 Tier 0 — small leaks

| Gap | Location | Effort | Value |
|---|---|---|---|
| Haptics fire builder + UI button | mobile (`command-service.ts`) | small | medium — confirms strap is paired/responsive |
| Reboot strap UI button (builder exists, no caller) | mobile (`DeviceSettingsScreen.tsx`) | small | low |
| MEMFAULT subscription | mobile (`ble-manager.ts`) | small | medium — would surface firmware crashes |
| IMU mode + Optical data toggles in settings UI | mobile | small | low |
| Surface respiratoryRate trend on Trends (data exists; chart slot may be missing) | mobile / view | small | medium |

### 4.2 Tier 1 — protocol decoding

| Gap | Location | Effort | Value |
|---|---|---|---|
| Firmware update flow (cmds 36/37/38/45/142–144) | codec + mobile | large | medium — only matters if we deploy custom firmware |
| Reset fuel gauge (cmd 99) | codec + UI | small | low |
| SelectWrist L/R (cmd 123) — could improve activity heuristics | codec + UI + activity-detector | small | low–medium |
| Body location & status (cmd 84) | codec | small | low |
| LED drive / TIA gain / bias offset config commands (cmds 39–44) — for PPG quality experiments | codec | medium | low (research-only) |
| ForceTrim (cmd 25) | codec + safety wrapper | small | low — intentional gap |

### 4.3 Tier 2 — algorithms / scoring

| Gap | Location | Effort | Value |
|---|---|---|---|
| **Muscular load fusion for strain** (IMU rep-count + intensity × volume) | backend `processing/`, requires IMU persistence | large | high — closes the biggest strain-score gap vs WHOOP |
| **IMU persistence + downstream features** — today `imu-parser.ts` decodes IMU but only `console.log`s it (`BleContext.tsx:735-741`); `imu-record.entity.ts` exists but isn't ingested | mobile ingestion → backend `pipeline.service.ts` ingest path | medium | high — gates rep-count, swim, stair-quality, fall-risk |
| **Sleep apnea / breathing-disturbance screen** (ODI heuristic exists; no AHI estimate or notification) | backend `processing/spo2-events.ts` + `daily_metrics`; would lean on existing `spo2DipCount`/`odiPerHour` | medium | high |
| **Irregular Heart Rhythm Notifications (PPG-AF)** | backend (new module) | large | high — but FDA-cleared territory, regulatory caveat |
| **Sleep PPG-Net** SOTA 4-class stager | backend (heavy ML) | large | medium — current quantile-v1 is "good enough" until we have labels |
| **Stress Monitor (0–3) live real-time** — we have a daily average only | mobile real-time | medium | high — matches WHOOP Stress Monitor |
| **Health Monitor "5 vitals" panel vs baseline** — data exists (RHR / HRV / RR / SpO2 / skinTemp) but no single dedicated screen | mobile + view | small | medium |
| **Menstrual Cycle Insights** (phase classifier, Cardiovascular Amplitude) | backend new module + user-input UI | large | high |
| **Pregnancy Coach** | backend new module | large | medium (audience-dependent) |
| **VO2 max 3-tier** — we only have Uth | backend + activity ingestion | medium | medium |
| **WHOOP Coach LLM** — we have none | backend new module (Claude/Sonnet) | large | high |
| **Daily Outlook narrative** | backend | small | high — easy LLM-bolted-on win |
| **Recovery activity classification** (cold plunge / sauna / meditation) | backend activity detector | medium | low |
| **Auto-detected workouts >15 min, strain >8** firing logic | backend pipeline + push notifs | medium | medium |
| **Sleep stage ground-truth labels** — no PSG dataset wired; classifier is unvalidated | data, not code | large | high (validation, not feature) |
| **HealthKit step / kcal / exercise-minutes ingestion into Home** — entities exist but Home tile may not surface them | mobile screen wiring | small | medium |

### 4.4 Tier 3 — RE-community parity

| Gap | Location | Effort | Value |
|---|---|---|---|
| Lomb-Scargle PSD (vs current Welch) — open in OW-Rust too | backend `hrv-frequency.ts` | small | low (academic) |
| Banister Fitness-Fatigue model | backend new file | medium | low (niche athlete users) |
| Particle-filter circadian phase (Hannay model) | backend new file | large | low–medium |
| Smart-wake silent alarm — schema exists, the actual "fire alarm within REM/light window before alarmMinutes" logic isn't on the strap | mobile timer + strap alarm command | medium | high — flagship sleep feature |

---

## 5. Things we have that the references don't

These are differentiators backed by real code.

| Differentiator | Code | Why it matters |
|---|---|---|
| **Backend pipeline with incremental watermark** | `apps/backend/src/pipeline/pipeline.service.ts:266-302` (skip-if-clean) + `entities/pipeline-state.entity.ts` | None of the RE projects have a cloud pipeline; they all run offline batch. |
| **Per-stage timing + budget alerts** | `mark()` (line 309) + `PIPELINE_BUDGET_MS` log (line 704-718) + `pipeline_runs.stages` jsonb | Operational visibility |
| **Inspector dashboard** | `apps/inspector/` (7 tabs) | RE projects ship CLIs at best |
| **Append-only pipeline_runs regression watch** | `entities/pipeline-run.entity.ts` + `inspector/src/components/PipelineRunsChart.tsx` | Catches perf regressions between commits |
| **Targeted reruns (day / range / force)** | `pipeline.service.ts:247-258` + `apps/inspector` UI controls | The latest commits on `main` (`a21b6bd3`, `ac7678ee`) |
| **Self-heal duplicate calendar-day rows** | `findOneByCalendarDay` (line 871) | Survives bad-state migrations gracefully |
| **Journal entries + factor correlations on stages** | `journal/` module + `processing/journal-correlations.ts` | Behavioral coaching layer |
| **Sleep plan + smart-wake schema + alarm fire** | `plans/sleep-plan.entity.ts` + `command-service.ts:80-102` + `BleContext.tsx:489-542` | We actually drive the strap alarm; whoomp shows a button but doesn't sync with a user-set plan |
| **noop Age / Pace of Aging** | `processing/healthspan.ts` (293 LOC) + `health/health-assessment.service.ts` | Closes WHOOP's flagship 2025 longevity gap; RE projects don't have it |
| **Quantile-v1 sleep stager (4 classes)** | `processing/sleep-stage-classifier.ts` (318 LOC) | Only RE-class stack with non-trivial staging |
| **Recovery formula warmup-gate** | `wellness-scoring.ts` (gates RHR/HRV penalties on `baseline.isWarmedUp`) | Fixes the 9 → 79 recovery bug; RE projects ignore warm-up |
| **HRV-CV 7-day rolling** | `views.service.ts:1411-1433` | Published 2025; none of the RE projects added it |
| **SpO2 desaturation events / ODI** | `processing/spo2-events.ts` + `daily_metrics.spo2DipCount`, `odiPerHour`, `lowestSpo2` | Beyond what even WHOOP surfaces |
| **Strain Coach optimal band live derivation** | `views.service.ts:1208-1219` | |
| **Sleep need with strain modifier + debt** | `processing/sleep-need.ts` (90 LOC) | |
| **Training Load ACWR + risk zone** | `processing/training-load.ts` + `daily_metrics.trainingLoadRiskZone` | |
| **Core temperature estimate** | `processing/core-temperature.ts` + `daily_metrics.coreTemperatureEstimate` | |
| **Circadian nadir tracking** | `daily_metrics.circadianNadir` | |
| **Hiking + stairs detection w/ HealthKit cross-check** | `processing/hiking-detector.ts`, `stair-detector.ts`, `healthkit-workout-matcher.ts` | |
| **Console-log structured metadata parser** | `apps/backend/src/telemetry/console-log-parser.ts:9-66` | Extracts firmware version, AFE ID, accelerometer model, fuel-gauge SOC, "Historical Dump Complete", advertising name, flash chip — surfaced in inspector and used to validate event-3/63 battery decoding |
| **Today's battery event-3 + event-63 decoding** | `BleContext.tsx:167-199` (this turn) + `dump-battery-payloads.ts` (RE harness) + `dump-event-payloads.ts` (generic RE harness) | First implementation to surface voltage + temp + icon level from event-63 |
| **Better-Auth + user-demographics path for Healthspan** | `apps/backend/src/auth/` + `health/health-assessment.service.ts:26-31` (reads `dateOfBirth`, `heightCm`, `weightKg`, `biologicalSex` via raw SQL) | Full personalisation surface |
| **iOS HealthKit ingest (workouts + daily summaries + barometer + motion)** | `apps/backend/src/activity/entities/*` + mobile `services/healthkit/` | Multi-source fusion; the RE projects are strap-only |
| **Calendar-day timezone-aware grouping** | `apps/backend/src/common/calendar.ts` | Avoids the off-by-one-day class of bugs the RE projects haven't faced (they aggregate naively UTC) |
| **Per-user baseline auto-warmup at 5 nights** | `baseline_profile.entity.ts` + `pipeline.service.ts:373-375` | Avoids the cold-start "59 bpm = 88-point penalty" bug fixed 2026-05-11 |

---

## 6. State of our protocol parsers

### 6.1 What we decode today

Header & framing — fully decoded in `apps/app/app/services/ble/packet-codec.ts:51-124` and `packet-assembler.ts`. Identical to OW-Rust / OW-2 / whoomp.js.

Packet types (`apps/app/app/services/ble/packet-types.ts:14-25`): 35 / 36 / 40 / 43 / 47 / 48 / 49 / 50 / 51 / 52 — every observed type.

Commands we **issue** (`command-service.ts`, 23 builders): 3, 7, 10, 11, 14, 22, 23, 26, 29, 35, 66, 67, 68, 69, 81, 82, 96, 97, 98, 106, 107. (Cmd 79 RunHapticsPattern is in the enum but has no builder.)

Command **responses** we parse (`BleContext.tsx`):

| Command | Parser | Output |
|---|---|---|
| 7 ReportVersionInfo | `parseVersionInfo` line 201 | Harvard + Boylston version strings |
| 11 GetClock | `parseDeviceClock` line 215 | `deviceClock: Date` |
| 26 GetBatteryLevel | `parseBatteryLevel` line 159 | SOC % (raw/10) |
| 35 GetHelloHarvard | inline line 630-661 | `isCharging` @[7], `isWorn` @[116] |
| 67 GetScheduledAlarm | `parseScheduledAlarm` line 222 | `strapAlarmAt: ISO string` |

Events we route (`BleContext.tsx:664-707`):

| Event # | Name | Handling |
|---|---|---|
| 3 | BatteryLevel | **NEW**: parses SOC tenths @[10..11] + voltage mV @[14..15] (`parseBatteryLevelEvent` line 167) |
| 7 / 8 | ChargingOn/Off | `isCharging` toggle |
| 9 / 10 | WristOn/Off | `isWorn` toggle |
| 33 / 34 | BleRealtimeHROn/Off | mirror toggle |
| 46 / 47 | RawDataCollectionOn/Off | mirror toggle |
| 51 | StrapDrivenAlarmSet | `strapAlarmArmed = true` |
| 63 | ExtendedBatteryInformation | **NEW**: voltage @[14..15], temp ×10 °C @[16..17], iconLevel @[21], SOC tenths @[25..26] (`parseExtendedBatteryEvent` line 185) |

All other events: forwarded to backend as base64 `device_events.rawPayload`
(`BleContext.tsx:709-716`). Backend stores in `device_events` table for later RE.

Historical sensor records: `history-parser.ts` decodes all 18 V12/V24 fields
(see §3.2 row by row). Generic packets carry HR+RR only; merged on backend
via COALESCE upsert (`pipeline.service.ts:1386-1447`).

IMU stream: `imu-parser.ts` produces `IMUSample[]` with `{accelX/Y/Z g, gyroX/Y/Z °/s}`
at ~52 Hz. Currently the result is only logged (`BleContext.tsx:739-741`)
— **the data is not yet persisted**. The `imu-record.entity.ts` schema is
ready and waiting.

Console logs: pipeline is mobile-extract → forwarder → backend
`console-log-parser.ts:71-92`. Captures 13 patterns including the
fuel-gauge "FG SOC (tenths)" reading, which `dump-battery-payloads.ts`
cross-correlates against device-event payloads.

### 6.2 What we just added today

Two new parsers + one new RE-script:

1. **`parseBatteryLevelEvent`** in `BleContext.tsx:167-177` for **Event 3**.
   Range-validated: SOC ≤ 110.0 %, voltage 2500–4500 mV.
2. **`parseExtendedBatteryEvent`** in `BleContext.tsx:185-199` for **Event 63**.
   Adds temperature (range 5.0–70.0 °C), icon level (0–7), and a
   redundant SOC field.
3. **`apps/backend/src/scripts/dump-event-payloads.ts`** — a generalised
   RE script that takes `--eventNumbers=N,M` and dumps per-byte stats,
   u16/i16/u32 LE interpretations with distinct-value filters, into
   `.fixtures/event-re/evt-N/report.md` + `hex-samples.txt`. Built so
   we can crack any other unknown event in minutes.
4. **`dump-battery-payloads.ts`** — the original specialised tool, now
   improved with charging-on/off transition deltas (line 231-306) that
   confirm voltage increases with charging and SOC tenths track the
   fuel-gauge.

These connect through the existing `device_events` capture path so
historical data already collected can be reanalysed retroactively.

---

## 7. Open questions / inconsistencies

Caught during this audit.

1. **IMU is decoded but not persisted.** `imu-parser.ts` produces samples
   on every `PacketType 51`/`52`, but `BleContext.tsx:735-741` only
   logs them. The backend has a ready `imu_record` entity. Missing wire.
   Likely intentional pending the bulk-ingest design, but blocks every
   IMU-based feature (rep detection, swim, stair-quality).

2. **MEMFAULT (`…0007`) characteristic never subscribed.** Documented
   in `docs/whoop-ble-protocol-reference.md:25` but no `bleManager`
   subscription. We'd see firmware crash dumps if we did.

3. **`CommandNumber.RunHapticsPattern = 79`** declared in `packet-types.ts:43`
   but no builder in `command-service.ts`. Dead-pointer enum value — easy
   add.

4. **Two sleep stagers shipped side-by-side.** `sleep-stage-engine.ts` (the
   older RF v1) is 382 LOC, `sleep-stage-classifier.ts` (the quantile-v1
   winner) is 318 LOC. `pipeline.service.ts:432` only calls `classifySleepStages()`
   (the new one); the older `sleep-stage-engine.ts` looks orphaned.
   Need to confirm whether any spec or fallback path still references it
   (`sleep-stage-engine.spec.ts` is 59 LOC).

5. **Two recovery numbers.** `daily_scores.dailyBalance` (computed by
   `wellness-scoring.computeDailyScore`) is the home-ring recovery. But
   `daily_metrics.recoveryIndex` (computed by `recovery-index.ts`,
   40/25/15/10/10 weighted) is a different composite stored on the same
   day. The mobile Home view uses `dailyBalance`; nothing clearly uses
   `recoveryIndex`. Need to either retire `recoveryIndex` or move
   `dailyBalance` over to it.

6. **`saveable detail` field overload.** `pipeline.service.ts:1067` does
   `detail: score.detail + ', Sleep score N'`. Sleep score is therefore
   embedded as a substring in a free-text field rather than its own
   column. The home view recomputes it live (`views.service.ts:123-155`).
   Worth a dedicated `daily_scores.sleepScore` int column.

7. **`SleepPlan.alarmEnabled` vs strap-driven alarm.** The `armAlarm()` in
   `BleContext.tsx:489-509` doesn't read `sleepPlan.alarmEnabled` — it
   relies on the UI button being shown. Setting alarmEnabled=false in
   storage but pressing Arm still arms it. Inconsistency, not a bug
   today.

8. **`maxHeartRate` plumbing.** `BaselineProfile.maxHeartRate` is read in
   `pipeline.service.ts:373` and `views.service.ts:153`, but how it's
   populated is unclear — `recomputeBaselineProfile()` doesn't pull
   from activity bouts' `heartRateMax`. Either it's set elsewhere or it
   sits at null and `computeVo2MaxUth` falls through.

9. **`activeMinutes` + `activityCount` columns added to `daily_metric.entity.ts`**
   but `derived-metrics.ts` doesn't appear to populate them. Possible
   half-shipped feature.

10. **`Battery icon level 0..7`** — `parseExtendedBatteryEvent` accepts
    `0..7`, but I couldn't find a use-site that surfaces it in the UI
    yet. Schema is present (`batteryIconLevel: number | null`).

11. **`SleepStage.epochMinutes`** defaults to `1` in the entity
    (`sleep-stage.entity.ts:39-40`), but the inspector / mobile pass
    `0.5` for half-minute epochs. Pre-existing rows may carry stale
    values that cause Hypnogram doubling — was fixed in mobile per
    `RESEARCH_KNOWLEDGE_BASE.md:734`, but worth confirming all callers
    consume the column rather than assuming 1.

12. **`whoomp.js` is 507 LOC but ships **no** sensor decoding** beyond HR.
    It's a UI demo; not a usable reference for V12/V24 work.
    `RESEARCH_KNOWLEDGE_BASE.md:20` already calls this out. The Rust
    crate is the only mature open codec.

13. **OW-Rust and OW-2 both decode `resp_rate_raw` but never surface it.**
    We surface it through `epoch-features.respiratoryRate` →
    `night_features.respiratoryRate` → `views.service.ts:1294-1296`.
    Worth a follow-up calibration pass (is the raw value already in
    breaths/min, or does it need a scaling factor like skin temp
    `× 0.04`?).

14. **No firmware-update path** anywhere in the codebase. Documented in
    `docs/whoop-ble-protocol-reference.md:166-187` (cmds 36/37/38/45/142-144)
    but no consumer. Acceptable: we ride WHOOP's OTA via their app.

15. **`apps/backend/src/scripts/`** lives outside `src/` per the build
    config (`RESEARCH_KNOWLEDGE_BASE.md:736-739`) — confirm the
    tsconfig-build exclusion is still in place after recent commits.

16. **`maxHeartRate` and Healthspan inputs**: `health-assessment.service.ts`
    reads `dateOfBirth`, `biologicalSex`, `heightCm`, `weightKg` via raw
    SQL from Better-Auth's `user` table — coupling to a foreign schema.
    Should probably be a `user_profile` view or a typed read.

---

## 8. Quick deltas vs the Research-Knowledge-Base's expected stance

`RESEARCH_KNOWLEDGE_BASE.md:642-669` had a checklist. Updates:

| Capability | RKB status | Actual today | Delta |
|---|---|---|---|
| Sleep stages 4-class | Working (`quantile-v1`) | Same | ✅ |
| Recovery score | Working but unvalidated | Same; two-track (dailyBalance + recoveryIndex) — see Q5 | ⚠️ |
| Sleep apnea screen | Missing | Partial — ODI/dip-count fields populated, no AHI/notification | 🟡 upgrade |
| Respiratory rate | Decoded but unused | **Used now** — flows through `night_features.respiratoryRate` and is on the sleep detail page | ✅ closed |
| Activity types beyond walk/run | Missing | Now: Walking, Running, Cycling, Hiking, Stair Up/Down, Strength (label), HIIT, General Exercise, Light Activity, Rest, Sedentary | ✅ closed (labels only — no muscular fusion) |
| Hill / barometer | Missing | Partial — `barometer-sample.entity.ts` exists, HK barometer ingest path exists; not used by activity-detector yet | 🟡 |
| VO2max | Missing | Present (Uth) | ✅ closed |
| Biological age / longevity | Missing | Present (noop Age / Pace of Aging / Healthspan) | ✅ closed |

---

## 9. Suggested next actions (informed by the audit)

These follow from §4 and §7 but stay one-step concrete.

1. **Wire IMU persistence** (Q1). Adds a queue from `imu-parser.ts` →
   local SQLite → backend `imu_records` → next pipeline runs gain raw
   accel/gyro. Unlocks rep-counting + swim detection.
2. **Add haptics builder + a "buzz strap" UI button** in DeviceSettings
   (Q3 / §4.1). 5-minute change, makes the device feel alive.
3. **Decide on recovery duality** (Q5). Either: (a) drop
   `recoveryIndex` from `daily_metrics` and rename `dailyBalance` for
   clarity, or (b) start surfacing `recoveryIndex` in a dedicated tile.
4. **Subscribe to MEMFAULT** (Q2). 10-line ble-manager change — gives
   us firmware-crash visibility we don't have anywhere else.
5. **Promote sleep score to its own column** (Q6) — back-fill from the
   `detail` string substring or recompute on next pipeline run.
6. **Investigate `resp_rate_raw` scaling** (Q13) — comparison run
   against a NeuroKit2 baseline on a few overnight files.
7. **Retire `sleep-stage-engine.ts`** (Q4) if it's truly dead, or wire
   it as a labeled fallback if it's a real fallback.
8. **Build a "5 vitals" screen** (§4.3) — data is already in
   `night_features` + `daily_metrics`, this is purely a view.
9. **Add daily-outlook LLM narrative** (§4.3) — wraps the existing
   `dailyBalance` + `sleepReserveHours` + recent journal entries into
   a Claude-generated summary. Smallest WHOOP-Coach analog.
10. **Take a real sleep-PSG night** to validate quantile-v1. The
    classifier has zero ground truth (`RESEARCH_KNOWLEDGE_BASE.md:744`).

---

*End of audit.*
