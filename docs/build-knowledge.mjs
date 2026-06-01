#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Tiny, scannable cards for the "At a glance" pane at the top of the
// dashboard. Each card is one bite-sized fact / decision / number /
// open question — designed to be readable in 5 seconds. Tag-grouped.
// Anchor points to the long-form section below for the full detail.
//
// Tags (each gets its own color):
//   shipped — concrete code we shipped
//   number — quantitative finding
//   decision — choice we made + why
//   open — known limitation / unresolved
//   research — community / web finding
//   next — recommended next step
const GLANCE = [
  // ── Re-audit + data-support pass (2026-05-31) ───────────────
  { tag: "decision", title: "Secondary screens re-audit (05-31)", body: "Ground-truth re-audit vs §4 targets. Plan ~70% shipped; structural+data layer done (every screen exists, reachable, data-backed). Remaining = §3 design-depth (gauges, dual-baseline lists, day-picker on detail screens) + product-gated (Inspector demote, AI-coach CTAs, Share-PDF, Journal model). The 05-28 'duplicate charts on HRV/Strain' finding is already resolved. Full punch-list: docs/secondary-screens-status-2026-05-31.md.", anchor: "secondary-screens-status" },
  { tag: "shipped", title: "Backend data-support pass (05-31)", body: "timeInZone now in minutes (was per-sample, ~60× inflated). activityFeed exposes id/startTime/endTime/durationMinutes/heartRateAvg/source; pending cards expose heartRateMax. New GET /activities/:id (hrCurve + 5-zone time + motion) makes BoutDetailScreen fully work. HealthMonitor RR reads activities.respiratoryRate. 6 new backend tests; 113 pass.", anchor: "secondary-screens-status" },
  // ── Shipped (2026-05-30 home + health + tabs session) ───────
  { tag: "shipped", title: "Home tab redesign", body: "Rings drop `%` suffix and gain numericValue + sevenDayAverage for ▲/▼ delta captions. Monitor cards carry freshness (`Xm ago`). Recovery ring → new RecoveryDetailScreen. Floating + → native ActionSheet quick-log. Spec: docs/superpowers/specs/2026-05-28-home-tab-redesign-design.md.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Health tab rewrite", body: "Aurora backdrop (Skia, monitor-state tinted) + unified HealthMonitorCard (hero + collapsible vitals table merged). 8 vitals (RHR/HRV/RR/SpO₂/Skin Temp/Sleep/Recovery 7d/Stress) with personal-range bars + ▲/▼ vs 7d. Healthspan demoted to a sub-card → /healthspan. Spec: docs/superpowers/specs/2026-05-29-health-tab-rewrite-design.md.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Backend monitors contract", body: "views.service builds real monitors.stress (24h todayStrip, timeInZone, score, zone) + monitors.health (lastReadingAt, inRangeCount). respiratoryRate exposed on activities. maxHR falls back to max(180, RHR×2.5) so stress works without an explicit baseline maxHeartRate. Deployed to Cloud Run.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Detail screens polish", body: "HRV / Strain drop duplicate charts. Stress Monitor fixed to 0-100 scale (was '/3'). Sleep Planner surfaces estimatedSleepHours / sleepReserveText / smartWakeStatusText. Health Monitor dead-nav to HrvDetail fixed.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Sleep detail decoupled + factor tags humanised", body: "Route date / dashboard date desync fixed (route date pushed to dashboard on mount). WhyPanel translates CAFFEINE_LATE → 'Caffeine after 2pm' and 19 other tags. Journal CTA links to /journal-entry.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Journal library 12 → 41 factors", body: "Nine categories (Substances / Food / Activity / Wellness / Sleep / Circadian / Health / Social / Context) per master plan §4.9. Entry screen rebuilt with category sections + 'Logged today' chip strip + LOCAL_THEME (was hardcoded light-only).", anchor: "secondary-screens" },
  { tag: "shipped", title: "Journal entries on Home tape", body: "HomeScreen now fetches /journal?date=... and feeds the array into buildTodayTape, which already supported a 'journal' event type. Tap a journal entry in the tape → opens /journal-history. Drops the wrong-home Settings → Journal-history shortcut.", anchor: "secondary-screens" },
  { tag: "shipped", title: "Insights placeholder", body: "New /insights route with calibration empty-state ('Log entries for N more nights'). Real correlator backend deferred until journal data accrues. Reachable from Settings → Insights.", anchor: "secondary-screens" },
  { tag: "shipped", title: "AuroraBackdrop crash fix", body: "withRepeat animation was kicked off inside useMemo with no teardown — tab switches leaked the loop onto a discarded shared value and crashed intermittently. Moved to useEffect + cancelAnimation on cleanup.", anchor: "secondary-screens" },

  // ── Shipped (this session) ────────────────────────────────
  { tag: "shipped", title: "Battery 26% bug fixed", body: "Parser was reading a header byte (0x1A=26) as the value. Now uint16_le(data, 2) / 10, matching whoomp.js + OpenWhoop-2.", anchor: "current-state" },
  { tag: "shipped", title: "Battery event 3 + 63 parsed live", body: "Sub-second SOC + voltage + temp + icon level via unsolicited event push. No more 30s poll lag.", anchor: "current-state" },
  { tag: "shipped", title: "Inspector battery section", body: "4 latest-value cells + 3 sparklines (SOC, voltage, temp). Firmware FG-SOC drift indicator turns yellow when |Δ| > 2%.", anchor: "current-state" },
  { tag: "shipped", title: "5-vitals Health Monitor card", body: "RHR / HRV / RR / SpO₂ / Skin Temp on HomeDetailsScreen, pulled from sleepView.metrics. No backend change needed.", anchor: "current-state" },
  { tag: "shipped", title: "Breathing-disturbance card", body: "ODI/hr with 4 zones (Normal/Mild/Moderate/Elevated, standard sleep-medicine bands). Disclaimer: screening signal, not diagnosis.", anchor: "current-state" },
  { tag: "shipped", title: "Live Stress 0-3", body: "Rolling-mean HR vs 60-bpm baseline. Surfaced on DeviceScreen. Baseline hardcoded for v1 — see 'open'.", anchor: "current-state" },
  { tag: "shipped", title: "Smart-wake alarm", body: "1-min foreground polling in the 30-min window before alarm. Fires early on >10 bpm HR uptick (light/REM proxy).", anchor: "current-state" },
  { tag: "shipped", title: "IMU persistence wired", body: "parseIMUPacket → POST /telemetry/imu → imu_records. Unlocks muscular-load fusion, rep count, swim, fall risk downstream.", anchor: "current-state" },
  { tag: "shipped", title: "CommandResponse forwarder", body: "Every cmd response now persisted with raw bytes. Closes the bug class that produced the 26% stuck issue.", anchor: "current-state" },
  { tag: "shipped", title: "MEMFAULT subscription", body: "BLE characteristic 0x0007 subscribed; chunks routed as [MEMFAULT base64=…] to console_logs. Firmware crash dumps now captured.", anchor: "current-state" },
  { tag: "shipped", title: "Dual recovery numbers resolved", body: "dailyBalance is the sole user-facing recovery surface. recoveryIndex removed from API + 4 screens.", anchor: "current-state" },
  { tag: "shipped", title: "Sleep score → typed column", body: "Out of the free-text 'detail' substring, into daily_scores.sleepScore int. Migration 1779500000000.", anchor: "current-state" },
  { tag: "shipped", title: "Orphan stager retired", body: "Deleted 382-LOC sleep-stage-engine.ts + 59-LOC spec. Pipeline only calls the newer classifier.", anchor: "current-state" },
  { tag: "shipped", title: "Phosphor icon swap", body: "phosphor-react-native replaces Ionicons across 17 screens + components. Adapter accepts both naming styles.", anchor: "current-state" },
  { tag: "shipped", title: "Unknown event correlation script", body: "correlate-unknown-events.ts ran on prod. Found evt 102/103 are high-freq sync sub-events; 67/61/62 are boot-init sequence.", anchor: "current-state" },
  { tag: "shipped", title: "Sleep stage validation harness", body: "validate-sleep-stager.ts wired: confusion matrix + Cohen's kappa + per-stage recall. Needs PSG labels to run.", anchor: "current-state" },
  { tag: "shipped", title: "Knowledge dashboard built", body: "Single self-contained docs/knowledge.html with sidebar TOC, search, dark theme, embedded research markdowns.", anchor: "current-state" },
  { tag: "shipped", title: "iOS background BLE wired", body: "AppState awareness in BleManager: setTimeout reconnect skipped while suspended (iOS state-preservation handles it), foreground-resume re-arms auto-connect.", anchor: "current-state" },
  { tag: "shipped", title: "Code review pass (602 lines)", body: "Independent agent surveyed every change. Top 5 fixes shipped: MEMFAULT line-buffer, telemetry firehose feature-flags, sleepScore backfill, Phosphor adapter hardening, smart-wake closures.", anchor: "code-review" },
  { tag: "shipped", title: "MEMFAULT line-buffer fix", body: "ConsoleLogLineForwarder.pushLine() bypasses the \\n-only line buffer. Memfault chunks (no newlines) now actually flush instead of accumulating forever in RAM.", anchor: "code-review" },
  { tag: "shipped", title: "IMU + cmd-resp ingest feature-flagged", body: "Disabled by default until consumers exist. Set EXPO_PUBLIC_ENABLE_IMU_INGEST=1 or _CMD_RESP_INGEST=1 to opt back in. Prevents the ~45M-rows/day firehose with no reader.", anchor: "code-review" },
  { tag: "shipped", title: "sleepScore migration backfill", body: "Migration up() body now lifts ', Sleep score N' substring from detail into the typed column for pre-migration rows.", anchor: "code-review" },
  { tag: "shipped", title: "Phosphor adapter hardened", body: "Added missing aliases (sync, chevron-up, chevron-down, refresh, reload). __DEV__ warning when an icon name is unknown — no more silent blank icons.", anchor: "code-review" },
  { tag: "shipped", title: "Smart-wake stale-closure fixed", body: "Interval reads samples through a ref; no longer captures stale state. Cleanup useEffect handles unmount. armAlarm deps no longer include the realtime array (which was rebuilding it every second).", anchor: "code-review" },
  { tag: "shipped", title: "HRV tile shows real value", body: "Backend exposes night_features.rmssd via homeView.activities.hrv; Home HRV tile no longer hardcoded to a dash.", anchor: "code-review" },
  { tag: "shipped", title: "HRV trend is real, not synthesized", body: "New sleepView.hrvTrend from last-7-night rmssd values. HrvDetailScreen's 7-night chart now plots actual variability instead of a flat line.", anchor: "code-review" },
  { tag: "shipped", title: "Live stress uses per-user RHR baseline", body: "Surfaced baselineRhr from BaselineProfile through homeView.activities; deriveLiveStressLevel reads it (defaults to 60 only if no baseline yet).", anchor: "code-review" },
  { tag: "shipped", title: "BatteryPanel extracted", body: "Shared 3-cell strip in components/BatteryPanel.tsx; DeviceScreen + DeviceSettingsScreen now consume the single source of truth for V/T/level formatting.", anchor: "code-review" },
  { tag: "shipped", title: "ODI is now numeric", body: "homeView.activities.odiPerHour: number | null. HomeDetailsScreen drops the regex round-trip through display text — direct binding, locale-safe.", anchor: "code-review" },
  { tag: "shipped", title: "Battery parser unit tests", body: "16 tests in battery-parsers.test.ts: parseBatteryLevel (incl. the 26%-bug regression), parseBatteryLevelEvent, parseExtendedBatteryEvent, plus boundary/sentinel coverage. All passing.", anchor: "code-review" },
  { tag: "shipped", title: "Backend typecheck clean", body: "Pre-existing debug.service.ts:372 type error fixed (SleepDetection.nightDate is Date, swapped Equal(string) → Between(start, end)).", anchor: "code-review" },

  // ── Numbers (the facts to remember) ───────────────────────
  { tag: "number", title: "Strap = WHOOP 4.0", body: "nRF52840 + LSM6DSO (IMU) + MAX86171 (PPG AFE) + MAX77818 (PMIC). Confirmed via console-log chip mentions.", anchor: "current-state" },
  { tag: "number", title: "Nordic firmware 17.2.2.0", body: "Boylston side. NCS 2.7.x / 2.8.x range, late-2024 / early-2025 build. Harvard side requires fresh sync to land in command_responses.", anchor: "current-state" },
  { tag: "number", title: "1,422 evt 3 samples in prod", body: "BatteryLevel event, paired ~4 min cadence with evt 63 (same count). 5 days of accumulated data.", anchor: "current-state" },
  { tag: "number", title: "r=0.95 SOC correlation", body: "Event-3 byte[10..11] u16_le/10 vs firmware FG SOC tenths. n=23 paired samples. Voltage r=0.84, icon level r=0.97.", anchor: "current-state" },
  { tag: "number", title: "Universal event framing decoded", body: "[flag(1) | unix(4) | counter(2) | payload-len(2) | subtype(1) | payload(N)]. Verified across 10 event types.", anchor: "current-state" },
  { tag: "number", title: "evt 102 ×413 every 11 min", body: "Most-frequent unknown event. Tightly co-occurs with HighFreqSync (97/98). Likely sync-session sub-event.", anchor: "current-state" },

  // ── Decisions (choices we made + why) ─────────────────────
  { tag: "decision", title: "dailyBalance is THE recovery", body: "Picked over recoveryIndex because z-score-personalized methodology matches WHOOP-style relative recovery better.", anchor: "current-state" },
  { tag: "decision", title: "Phosphor over Lucide / others", body: "phosphor-react-native is mature, 1,200+ icons × 6 weights, react-native-svg already installed. Adapter pattern keeps swap-out cheap.", anchor: "current-state" },
  { tag: "decision", title: "Skip cmd 98 polling", body: "Event 63 push gives us the same fields unprompted (voltage, temp, icon level). Polling is redundant.", anchor: "phase-6" },
  { tag: "decision", title: "Keep recoveryIndex computation", body: "Stop surfacing in UI but keep the algorithm in derived-metrics.ts. Could become a 'Recovery Components' transparency view.", anchor: "current-state" },
  { tag: "decision", title: "No firmware OTA writes", body: "Read-only firmware regression watch only — version interrogation + image hashing, no writes. Brick risk + signed images.", anchor: "phase-6" },
  { tag: "decision", title: "Don't bypass cloud pairing", body: "Use a whoop-simulator honeypot to map BLE state machine. Account-token bypass would need Frida-fragile MITM.", anchor: "phase-6" },

  // ── Open / blockers (known limitations) ───────────────────
  { tag: "open", title: "iOS background BLE — needs device verification", body: "Plumbing now in place (state-preservation, AppState awareness, BG task). Real-world background reliability needs an on-device test pass.", anchor: "current-state" },
  { tag: "open", title: "Live stress baseline hardcoded", body: "Using 60 bpm constant for the RHR baseline. Should read per-user baseline from night_features.restingHeartRate.", anchor: "current-state" },
  { tag: "open", title: "Sleep stager unvalidated", body: "classifySleepStages() ships a number we can't defend. Validation harness is in place but needs PSG / reference-wearable labels.", anchor: "current-state" },
  { tag: "open", title: "Harvard MCU version unknown", body: "Goes via cmd-7 response; only just started forwarding to backend today. Will land in command_responses after next sync.", anchor: "current-state" },
  { tag: "open", title: "8 unknown events un-named", body: "evt 102/103/68/69/56/67/61/62 characterized structurally but not labelled in EventNumber enum. Need action-correlation to name.", anchor: "current-state" },
  { tag: "open", title: "Memfault field names need symbols", body: "Coredumps + CBOR chunks decodable from format spec, but event field names require Whoop's firmware symbol files (not public).", anchor: "phase-6" },

  // ── Research / community findings ─────────────────────────
  { tag: "research", title: "No public Whoop OTA exists", body: "openwhoop's download-firmware fetches Whoop's CDN, not the strap. No project writes to flash. Open research problem.", anchor: "phase-6" },
  { tag: "research", title: "WHOOP 5.0 = Ambiq + ECG AFE", body: "Major silicon swap: nRF52840 → Ambiq Apollo4-class; MAX86171 → MAX86178-class (adds ECG). FCC IDs filed May 2025.", anchor: "phase-6" },
  { tag: "research", title: "Harvard / Boylston = Boston codenames", body: "Whoop HQ is 1325 Boylston St. Harvard ≈ app MCU 'Strap Firmware', Boylston ≈ BLE radio MCU 'Bluetooth Firmware'.", anchor: "phase-6" },
  { tag: "research", title: "Pairing blocked by cloud, not BLE", body: "BLE crypto is Just-Works (textbook crackable). Real blocker is Whoop's account service minting a device-binding token.", anchor: "phase-6" },
  { tag: "research", title: "RE community = 3 people", body: "jogolden (whoomp.js, dormant), bWanShiTong (openwhoop, active), christianmeurer (Python reader). Zero DEF CON / Black Hat talks on Whoop, ever.", anchor: "community" },
  { tag: "research", title: "Whoop sued Bevel March 2026", body: "UI / patents. Implication: copy protocol, NOT UI. Plus FDA warning letter on Whoop's BP claims — avoid medical-device framing.", anchor: "community" },

  // ── Next steps (ranked) ───────────────────────────────────
  { tag: "next", title: "1. Memfault chunk decoder", body: "1-2 days. BLE channel already wired. Captures firmware crashes/asserts. Highest ROI per day.", anchor: "phase-6" },
  { tag: "next", title: "2. Firmware regression watch", body: "2 weeks. Read cmd-7 version + hash the OpenWhoop image. Alert on unrecognised pushes. Defensive safety net.", anchor: "phase-6" },
  { tag: "next", title: "3. HRV plumb to home tile", body: "Backend exposes rmssd via sleep view; HomeScreen 'HRV' tile currently shows '--'. One backend addition + screen wire.", anchor: "current-state" },
  { tag: "next", title: "4. iOS background BLE device test", body: "Plumbing wired this session. Verify on a real iPhone: background app for 30 min, confirm strap notifications still arrive on resume.", anchor: "current-state" },
  { tag: "next", title: "5. Buy WHOOP 5.0 + 1-wk diff sprint", body: "$239. Base 5.0 has higher info-per-dollar than MG. Crucial for not-shipping-a-dead-protocol future-proofing.", anchor: "phase-6" },
  { tag: "next", title: "6. Muscular-load fusion for strain", body: "IMU now persists (gap #6 shipped). Next is the strain pipeline stage consuming imu_records for rep count + intensity.", anchor: "feature-matrix" },
]

const TAG_META = {
  shipped: { label: "Shipped", color: "#82c46d" },
  number: { label: "Number", color: "#5ec4e6" },
  decision: { label: "Decision", color: "#d68064" },
  open: { label: "Open", color: "#e3b34a" },
  research: { label: "Research", color: "#b09bf0" },
  next: { label: "Next", color: "#d96a55" },
}

const SECTIONS = [
  {
    id: "current-state",
    title: "Current state — this session",
    inline: `
### Gap-resolution log (running)

- ✅ **#1 — Dual recovery numbers**. \`dailyBalance\` (\`daily_scores\`) is now the sole user-facing recovery surface. \`recoveryIndex\` removed from \`HomeView.activities\` API response, from 4 user screens, and from \`DashboardContext\`. Legacy computation in \`derived-metrics.ts\` left in place (column still populated for historical compatibility, no UI consumer). Fixed adjacent bug: HomeScreen's "HRV" tile was using \`recoveryIndex\` as a faux HRV value with "ms" unit — now defaults to "--" pending proper HRV wiring.
- ✅ **#2 — Sleep score typed column**. New \`daily_scores.sleepScore\` int column (migration \`1779500000000-DailyScoreSleepScore.ts\`). Pipeline now writes to the column; the \`, Sleep score N\` substring suffix on \`detail\` is gone. Views still recompute live (untouched — that's correct behavior for fresh days).
- ✅ **#3 — Retired \`sleep-stage-engine.ts\`**. Deleted the 382-LOC RF stager and its 59-LOC spec. Pipeline always called the newer \`sleep-stage-classifier.ts\`. No callers, typecheck passes.
- ✅ **#4 — MEMFAULT subscription**. New \`MEMFAULT_UUID = '61080007-…'\` constant; \`BleManager.setupNotifications\` subscribes; \`onMemfault(cb)\` listener API added. \`BleContext\` routes incoming chunks to the existing console-log forwarder as \`[MEMFAULT base64=...]\` so firmware crash dumps land in \`console_logs\` for later inspection.
- ✅ **#5 — CommandResponse forwarder**. New \`command_responses\` table (migration \`1779600000000-CommandResponses.ts\`), entity, DTO, controller route (\`POST /telemetry/command-responses\`), service ingest method, and \`createCommandResponseForwarder()\` factory. Every \`PacketType.CommandResponse\` packet now ships base64 payload + cmd + sequence to the backend. This is the safety net that closes the bug class that produced the 26%-stuck issue — any future parser bug in a command response is now RE-able from historical bytes.
- ✅ **#6 — IMU persistence**. \`parseIMUPacket\` is now wired in \`BleContext\` (was \`console.log\`-only). New \`POST /telemetry/imu\` endpoint, \`createImuForwarder()\` factory with 10 s flush / 2,000-sample threshold appropriate for 52 Hz × 100-sample/packet streams, ingest service with 500-row chunking. \`ImuRecord\` entity (already existed in pipeline/entities with a baseline-migration table) registered in TelemetryModule. Each packet now produces ~100 rows in \`imu_records\` keyed by user + per-sample timestamp. This is the unlock for muscular-load fusion → strain, rep count, swim detection, fall risk — downstream pipelines can now query \`imu_records\` like any other signal table.
- ✅ **#7 — Unknown event correlation**. New \`correlate-unknown-events.ts\` script. Ran against prod (1,422+ events). Findings: evt 102 (×413, 2.4s median cadence) and evt 103 (×89, 3.4s) are high-freq sync sub-events — both fire tightly with HighFreqSyncEnabled/Disabled (#97/98), BleHrProfileEnabled (#24), BleRealtimeHROn (#33). evt 56 (×10, 17-byte payload with second timestamp) is a sync-session boundary event. evt 68/69 are wrist-interaction events tied to CaptouchAutothresholdAction (#32). evt 67/61/62 (×3 each, same boot timestamp 2026-05-13T21:54:47) are boot/init sequence events. None carry measurement data. Not naming in the enum yet — speculative without more evidence.
- ✅ **#8 — Stale dist untracked**. \`apps/app/dist\` was already untracked (likely via a prior commit). Confirmed \`git ls-files apps/app/dist | wc -l = 0\`. \`.gitignore\`'s \`dist\` / \`**/dist\` rules now own this path.
- ✅ **#9 — 5-vitals Health Monitor card**. New "Health Monitor · 5 Vitals" \`GlassCard\` in \`HomeDetailsScreen\` showing Resting HR, HRV (RMSSD), Respiratory Rate, Blood Oxygen, Skin Temp — pulled from \`sleepView.metrics\` (no backend change needed, the data was already there). Delta tags next to each value where available.
- ✅ **#10 — Breathing-disturbance card**. Surfaces \`spo2DipCount\` and ODI per hour from existing pipeline data with a 4-tier risk classification (Normal &lt; 5/hr, Mild 5-15, Moderate 15-30, Elevated &gt; 30) — matches standard sleep-medicine ODI bands. Explicit disclaimer that it's a screening signal, not a diagnosis.
- ✅ **#11 — Live Stress Monitor (0..3)**. New \`liveStressLevel\` derived field in \`BleContext\` from a rolling 15-sample mean of realtime HR vs a 60-bpm baseline (Calm &lt; +10, Low &lt; +25, Medium &lt; +50, High ≥ +50). Surfaced as a row on \`DeviceScreen\`. Baseline is hardcoded for v1 — refine later by reading per-user RHR from night features.
- ✅ **#12 — Smart-wake alarm**. \`armAlarm()\` now schedules a foreground 1-minute polling timer in the 30-min window before the target alarm. If recent HR samples show a &gt; 10 bpm uptick from the session minimum (proxy for light/REM stage), the strap alarm fires early via \`buildRunAlarm\`. Falls through to the strap's own scheduled fire if no uptick is observed. Cleared on \`disarmAlarm\`. iOS background BLE remains a limitation — strap must be connected and app foreground / Android FGS active for the early-fire path to work.
- ✅ **#13 — Sleep-stage validation harness**. New \`validate-sleep-stager.ts\` script defines the comparison protocol: aligns labels and predictions on a 30s grid, builds confusion matrix, computes overall accuracy + per-stage recall + Cohen's kappa, writes a markdown report. No PSG / reference data wired in yet — script prints acquisition options (PSG, reference wearable, manual scoring). Once a labels JSON is dropped at \`.fixtures/sleep-labels/&lt;night&gt;.json\`, evaluation runs end-to-end.

### Phase 6 deep-dive — research-only outputs (this session)

- 📄 **Phase 6 research** report at \`docs/phase-6-research.md\` (474 lines, 100+ cited sources). Key findings:
  - **Firmware OTA — open research problem.** No public project implements writes. The only existing tool (openwhoop's \`download-firmware\`) fetches from Whoop's *cloud* CDN, not the strap. Three compounding blockers: no extracted firmware blob, almost-certainly signed images (NSA SCIF clearance implies this), and account-bound delivery. *Recommend read-only "firmware regression watch" only* — interrogate cmd 142 for version, hash the binary, alert on unrecognised pushes.
  - **Pairing / virgin-mode — partially doable, blocked by app↔server account-binding semantics, not by BLE crypto.** The strap is in Just-Works pairing mode (textbook crackable). The real blocker is the Whoop account service that mints a device-binding token consumed via \`ExitVirginMode\`. *Recommend \`whoop-simulator\` honeypot* to enumerate the BLE state machine without bypassing the cloud. 4-8 weeks.
  - **WHOOP 5.0 / MG — partially doable, requires hardware.** Major silicon swap: Nordic nRF52840 → Ambiq Apollo4-class; MAX86171 PPG → MAX86178-class PPG+ECG. New FCC IDs WS50/WG50/WD50/WB50 filed May 2025. One \`openwhoop\` issue (#24) from a researcher with 5.0 hardware sat unanswered. *Recommend buying a 5.0 ($239) and doing a 1-week BLE-discovery sprint.* MG just adds ECG + BP on the same wire — base 5.0 has higher marginal info per dollar.
- **"Harvard / Boylston" decoded.** Both are Boston neighbourhood codenames (Whoop HQ is 1325 Boylston St). Plausible mapping: **Harvard = app MCU firmware (the "Strap Firmware")**, **Boylston = BLE/radio MCU firmware (the "Bluetooth Firmware")**. Matches Ambiq Apollo4 Blue's host+link-controller dual-core pattern.
- **Memfault format is decodable.** Coredumps use magic \`0x45524F43\` ("CORE") with documented TLV block headers; events are CBOR chunks. So our new \`[MEMFAULT base64=…]\` console-log capture path can be parsed without Whoop tooling — except event *field names* require Whoop's symbol files (not public) to map back to human-readable keys. Coredump → ELF → GDB path is viable.
- **Current strap firmware (from prod DB)**: Nordic side **\`17.2.2.0\`** (NCS 2.7.x / 2.8.x range, late 2024 / early 2025). Hardware confirmed WHOOP 4.0: nRF52840 + STMicro LSM6DSO + Maxim MAX86171 + Maxim MAX77818. Harvard MCU version isn't server-side yet — it goes via cmd-7 response, which will start landing in \`command_responses\` now that the forwarder (#5) is deployed.
- **Community map** (people doing *actual* RE, not API wrappers): \`jogolden\` (John Fitzgerald, whoomp.js, opened Jan 2025, dormant since mid-2025), \`bWanShiTong\` (the canonical \`openwhoop\` + simulator + protocol doc, 43 commits to master), \`christianmeurer\` (Python BLE reader). No DEF CON / Black Hat / RECON talks on Whoop, ever — small-N user base + subscription return model keeps units out of researcher hands.
- **WHOOP Body / Any-Wear Pod**: passive fabric pod, same protocol. The 2025 "new device architecture" is *server-side AI* (Coach LLM, Healthspan), not BLE-level changes.

### UI polish

- ✅ **Phosphor icon swap**. \`@expo/vector-icons\` Ionicons replaced everywhere active across 17 screens + components plus \`journalFactors\` constants. New \`apps/app/app/components/PhosphorIcon.tsx\` adapter accepts the legacy Ionicons-style names via an alias map and renders \`phosphor-react-native\` components under the hood. ~30 distinct icon names mapped (chevrons, close, heart, flash, watch, alarm, trash, sunny, moon, journal, info, checkmark, arrow, warning, add, ellipse, airplane, barbell, body, book, cafe, fitness, leaf, phone, restaurant, wine, pulse, calendar, battery-charging, water, cloud-download). The vendored \`reacticx\` UI kit (~30 unused stub components) left on Ionicons — they're not wired into the live app and the kit has its own icon-shape conventions. Future calls can use either Ionicons-compatible aliases (\`<PhosphorIcon name="chevron-forward" />\`) or canonical Phosphor names. Phosphor's six weights are accessible via the \`weight\` prop.

### Battery work (earlier in this session)

This session shipped fixes and infrastructure around battery telemetry on the Whoop strap. The headline items:

### Battery percentage
- **Root cause of 26%-stuck bug:** the old parser read \`uint16_le(packet.data, 0)\` as battery — which is actually a header byte (\`0x1A = 26 = command id for GetBatteryLevel\`). It also \`Math.min\`'d that against the real value at offset 2.
- **Fix:** replaced with the canonical \`uint16_le(data, 2) / 10\` matching whoomp.js and OpenWhoop-2.
- **Polling:** added 30 s cmd-26 polling while connected, matching the whoomp.js cadence.
- **Display:** all three battery renderers (\`DeviceScreen\`, \`DeviceSettingsScreen\`, \`HomeScreen\`) now show one decimal place.

### Event-driven battery parsing (sub-second reactivity)
Reverse-engineered the unsolicited event payloads sitting in \`device_events.rawPayload\` (1,422 samples each of evt 3 and evt 63 in prod over 5 days):

| Event | Field | Offset | Encoding |
|---|---|---|---|
| 3 — \`BatteryLevel\` | SOC tenths | bytes \`[10..11]\` | u16 LE / 10 → percentage |
| 3 — \`BatteryLevel\` | Voltage mV | bytes \`[14..15]\` | u16 LE |
| 63 — \`ExtendedBatteryInformation\` | Voltage mV | bytes \`[14..15]\` | u16 LE (same as evt 3) |
| 63 | Temperature ×10 °C | bytes \`[16..17]\` | u16 LE / 10 |
| 63 | Icon level | byte \`[21]\` | 0..7 |
| 63 | SOC tenths (secondary) | bytes \`[25..26]\` | u16 LE / 10 |

Statistical support: r=0.95 (SOC), r=0.84 (voltage), r=0.97 (icon level) against firmware fuel-gauge SOC, n=23 paired samples.

### Universal event-payload framing (confirmed across 10 event types)
\`\`\`
byte 0:       status flag (always 0x00)
bytes 1-4:    u32 LE unix timestamp
bytes 5-6:    u16 LE counter (likely millis-mod-65536 or sequence)
bytes 7-8:    u16 LE payload length (= total_len - 9)
byte 9:       event subtype byte
bytes 10..:   payload of length given by bytes[7..8]
\`\`\`
Verified on evt 3 (29 B, payload-len=0x0014=20), evt 63 (37 B, payload-len=0x001c=28), evt 102/103/68/69 (13 B, payload-len=4), evt 56 (17 B, payload-len=8).

### Inspector additions
- New \`GET /debug/battery-history?hours=24\` endpoint — decodes evt3+evt63 server-side, returns time series.
- Telemetry tab now shows a Battery section with:
  - 4 latest-value cells (SOC, Voltage, Temp, Icon level) with color-coded thresholds.
  - 3 sparkline charts over the last 24 h (SOC %, Voltage mV, Temp °C).
  - Firmware FG SOC sanity check with drift indicator — flags yellow if Δ > 2 % between BLE-derived and firmware-fuel-gauge SOC.
  - Unknown events panel with "needs RE" pill and decimal+hex listing, sorted by count.
- Fixed merge-direction bug in \`debug.service.ts\` that was showing the *oldest* metadata in the deviceInfo dict instead of the newest.

### Scripts shipped
- \`apps/backend/src/scripts/dump-battery-payloads.ts\` — runs per-byte stats + uint16/uint32 LE candidate enumeration + Pearson correlation against firmware FG SOC. Writes to \`.fixtures/battery-re/\`.
- \`apps/backend/src/scripts/dump-event-payloads.ts\` — generalized version taking \`--eventNumbers=N,M,...\`. Used to characterize evt 102/103/68/69/56 unknowns. Writes to \`.fixtures/event-re/evt-N/\`.

### Unknowns left to RE (low priority — all are state-change pings, not measurement events)
- evt 102 (×391) — likely \`HighFreqSyncStart\` (clusters with 96-98 enum block)
- evt 103 (×81) — likely \`HighFreqSyncEnd\`
- evt 69 (×15), evt 68 (×13) — alarm-cluster state changes
- evt 56 (×9) — 17-byte event with **second timestamp** at \`bytes[10..13]\`, plausibly an "alarm window report"
- evt 67/61/62 — 1 sample each, not enough data
`,
  },
  {
    id: "feature-matrix",
    title: "Feature matrix — ours vs RE projects vs WHOOP",
    path: "docs/feature-matrix-audit.md",
    fallback: "_Audit agent is still running — re-run `node docs/build-knowledge.mjs` after `docs/feature-matrix-audit.md` is written._",
  },
  {
    id: "community",
    title: "Whoop RE community state",
    path: "docs/whoop-community-research.md",
    fallback: "_Research agent is still running — re-run `node docs/build-knowledge.mjs` after `docs/whoop-community-research.md` is written._",
  },
  {
    id: "phase-6",
    title: "Phase 6 deep-dive (firmware / pairing / 5.0)",
    path: "docs/phase-6-research.md",
    fallback: "_Pending — `docs/phase-6-research.md` not yet written._",
  },
  {
    id: "code-review",
    title: "Session code review",
    path: "docs/code-review-session.md",
    fallback: "_Pending — code-reviewer agent output not yet written._",
  },
  { id: "secondary-screens", title: "Secondary screens master plan", path: "docs/secondary-screens-master-plan-2026-05-28.md" },
  { id: "competitor-screens", title: "Competitor patterns library", path: "docs/competitor-screens-research-2026-05-28.md" },
  { id: "current-screens-audit", title: "Current screens audit (2026-05-28)", path: "docs/current-secondary-screens-audit-2026-05-28.md" },
  { id: "secondary-screens-status", title: "Secondary screens status + punch-list (2026-05-31)", path: "docs/secondary-screens-status-2026-05-31.md" },
  { id: "user-journey", title: "User journey + feature graph", path: "docs/user-journey-and-feature-graph-2026-05-28.md" },
  { id: "home-tab-redesign-spec", title: "Spec: Home tab redesign (2026-05-28)", path: "docs/superpowers/specs/2026-05-28-home-tab-redesign-design.md" },
  { id: "health-tab-rewrite-spec", title: "Spec: Health tab rewrite (2026-05-29)", path: "docs/superpowers/specs/2026-05-29-health-tab-rewrite-design.md" },
  { id: "ble-protocol", title: "BLE protocol reference", path: "docs/whoop-ble-protocol-reference.md" },
  { id: "ble-patterns", title: "BLE patterns research (RN/Expo)", path: "docs/ble-patterns-research.md" },
  { id: "whoop-features", title: "WHOOP features deep dive", path: "research/whoop-features-deep-dive.md" },
  { id: "screens", title: "Screen inventory", path: "research/screen-inventory.md" },
  { id: "knowledge-base", title: "Research knowledge base", path: "RESEARCH_KNOWLEDGE_BASE.md" },
];

async function loadSection(s) {
  if (s.inline) return s.inline;
  const fullPath = resolve(repoRoot, s.path);
  if (!existsSync(fullPath)) return s.fallback ?? `_Missing: ${s.path}_`;
  return await readFile(fullPath, "utf8");
}

function escapeScriptClose(md) {
  return md.replace(/<\/script>/gi, "<\\/script>");
}

const HTML_TEMPLATE = (sections) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>noop · knowledge dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #0b0b0d;
    --bg-1: #131318;
    --bg-2: #1c1c24;
    --border: rgba(255,255,255,0.08);
    --border-2: rgba(255,255,255,0.14);
    --text: #f1efe9;
    --text-2: #a4a39b;
    --text-3: #6e6d68;
    --accent: #d68064;
    --green: #82c46d;
    --yellow: #e3b34a;
    --red: #d96a55;
    --code-bg: #1a1a22;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    display: grid;
    grid-template-columns: 260px 1fr;
  }
  aside.sidebar {
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    padding: 24px 18px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  aside.sidebar h1 {
    margin: 0 0 2px 0;
    font-size: 17px;
    letter-spacing: -0.01em;
  }
  aside.sidebar .subtitle {
    margin: 0 0 18px 0;
    font-size: 12px;
    color: var(--text-3);
  }
  aside.sidebar input.search {
    width: 100%;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    margin-bottom: 14px;
    outline: none;
  }
  aside.sidebar input.search:focus {
    border-color: var(--border-2);
  }
  aside.sidebar nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  aside.sidebar nav li {
    margin-bottom: 2px;
  }
  aside.sidebar nav a {
    display: block;
    color: var(--text-2);
    text-decoration: none;
    padding: 7px 10px;
    border-radius: 7px;
    font-size: 13px;
    transition: background 80ms, color 80ms;
  }
  aside.sidebar nav a:hover {
    background: var(--bg-2);
    color: var(--text);
  }
  aside.sidebar nav a.active {
    background: var(--bg-2);
    color: var(--accent);
  }
  main {
    padding: 32px 56px 96px;
    min-width: 0;
    overflow-x: hidden;
  }
  main > * {
    max-width: 1400px;
  }
  section.panel .content p,
  section.panel .content li {
    max-width: 78ch;
  }
  main > header.page {
    border-bottom: 1px solid var(--border);
    padding-bottom: 18px;
    margin-bottom: 28px;
  }
  main > header.page h1 {
    margin: 0 0 4px 0;
    font-size: 26px;
    letter-spacing: -0.02em;
  }
  main > header.page .meta {
    color: var(--text-3);
    font-size: 13px;
  }
  section.panel {
    margin-bottom: 48px;
    padding-top: 8px;
  }
  section.panel > h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin: 0 0 14px 0;
  }
  section.panel .content {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 24px 28px;
  }
  section.panel .content h1 {
    font-size: 22px;
    letter-spacing: -0.01em;
    margin: 4px 0 14px;
  }
  section.panel .content h2 {
    font-size: 18px;
    margin: 28px 0 10px;
    letter-spacing: -0.005em;
  }
  section.panel .content h3 {
    font-size: 15px;
    margin: 20px 0 6px;
    color: var(--text);
  }
  section.panel .content p {
    color: var(--text-2);
    margin: 10px 0;
  }
  section.panel .content li {
    color: var(--text-2);
    margin: 4px 0;
  }
  section.panel .content strong {
    color: var(--text);
  }
  section.panel .content code {
    background: var(--code-bg);
    color: var(--text);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12.5px;
    font-family: "SF Mono", "Menlo", "Monaco", monospace;
  }
  section.panel .content pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 12.5px;
    font-family: "SF Mono", "Menlo", "Monaco", monospace;
    color: var(--text);
    line-height: 1.5;
  }
  section.panel .content pre code {
    background: none;
    padding: 0;
    color: inherit;
  }
  section.panel .content blockquote {
    border-left: 3px solid var(--accent);
    margin: 10px 0;
    padding: 4px 14px;
    color: var(--text-2);
    background: var(--bg-2);
    border-radius: 0 8px 8px 0;
  }
  section.panel .content table {
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 13px;
    width: 100%;
  }
  section.panel .content th, section.panel .content td {
    border: 1px solid var(--border);
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  section.panel .content th {
    background: var(--bg-2);
    color: var(--text);
    font-weight: 600;
  }
  section.panel .content a {
    color: var(--accent);
    text-decoration: none;
  }
  section.panel .content a:hover {
    text-decoration: underline;
  }
  section.panel .content hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 22px 0;
  }
  /* Filtered-out items */
  aside.sidebar nav li.hidden { display: none; }
  /* Smooth-scroll for anchors */
  html { scroll-behavior: smooth; }

  /* At-a-glance pane */
  .glance {
    margin-bottom: 36px;
  }
  .glance .glance-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .glance h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin: 0;
  }
  .glance .filters {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .glance .filters button {
    background: var(--bg-2);
    color: var(--text-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11.5px;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: 0.02em;
  }
  .glance .filters button:hover { color: var(--text); border-color: var(--border-2); }
  .glance .filters button.on { color: var(--text); border-color: var(--accent); background: rgba(214,128,100,0.1); }
  .glance .glance-search {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12px;
    outline: none;
    min-width: 180px;
    font-family: inherit;
  }
  .glance .glance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 10px;
  }
  .glance .card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 12px;
    padding: 12px 14px;
    transition: transform 80ms ease, border-color 80ms ease, background 80ms ease;
    cursor: pointer;
    text-decoration: none;
    display: block;
    color: inherit;
  }
  .glance .card:hover {
    border-color: var(--border-2);
    background: var(--bg-2);
    transform: translateY(-1px);
  }
  .glance .card .pill {
    display: inline-block;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--bg);
    padding: 1px 7px;
    border-radius: 4px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .glance .card .title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 4px 0;
    letter-spacing: -0.005em;
  }
  .glance .card .body {
    font-size: 12.5px;
    color: var(--text-2);
    margin: 0;
    line-height: 1.45;
  }
  .glance .card.hidden { display: none; }
  @media (max-width: 900px) {
    body { grid-template-columns: 1fr; }
    aside.sidebar { position: static; height: auto; }
    main { padding: 24px 20px 80px; }
  }
</style>
</head>
<body>
  <aside class="sidebar">
    <h1>noop</h1>
    <p class="subtitle">knowledge dashboard</p>
    <input class="search" id="search" type="search" placeholder="filter sections…">
    <nav>
      <ul id="toc">
        <li data-id="glance"><a href="#glance"><strong>At a glance</strong> · ${GLANCE.length} cards</a></li>
        ${sections.map((s) => `<li data-id="${s.id}"><a href="#${s.id}">${escapeHtml(s.title)}</a></li>`).join("\n        ")}
      </ul>
    </nav>
  </aside>
  <main>
    <header class="page">
      <h1>noop · knowledge dashboard</h1>
      <p class="meta">Last built: ${new Date().toISOString()} · single-file, open directly in any browser.</p>
    </header>

    <section class="glance" id="glance">
      <div class="glance-header">
        <h2>At a glance · ${GLANCE.length} bite-sized cards</h2>
        <input class="glance-search" id="glance-search" type="search" placeholder="filter cards…">
      </div>
      <div class="filters" id="glance-filters">
        <button data-tag="all" class="on">All · ${GLANCE.length}</button>
        ${Object.entries(TAG_META)
          .map(([tag, meta]) => {
            const count = GLANCE.filter((c) => c.tag === tag).length
            return `<button data-tag="${tag}">${meta.label} · ${count}</button>`
          })
          .join("\n        ")}
      </div>
      <div class="glance-grid" id="glance-grid">
        ${GLANCE.map((c) => {
          const meta = TAG_META[c.tag]
          const anchor = c.anchor ? `#${c.anchor}` : "#"
          return `<a href="${anchor}" class="card" data-tag="${c.tag}" style="border-left-color: ${meta.color}">
          <span class="pill" style="background: ${meta.color}">${meta.label}</span>
          <p class="title">${escapeHtml(c.title)}</p>
          <p class="body">${escapeHtml(c.body)}</p>
        </a>`
        }).join("\n        ")}
      </div>
    </section>

    ${sections
      .map(
        (s) => `
    <section id="${s.id}" class="panel">
      <h2>${escapeHtml(s.title)}</h2>
      <div class="content" id="content-${s.id}"></div>
      <script type="text/x-markdown" data-target="content-${s.id}">${escapeScriptClose(s.body)}</script>
    </section>`,
      )
      .join("\n")}
  </main>

  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
  <script>
    // Configure marked
    marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

    // Render every markdown block into its target
    document.querySelectorAll('script[type="text/x-markdown"]').forEach((el) => {
      const target = document.getElementById(el.dataset.target);
      if (!target) return;
      target.innerHTML = marked.parse(el.textContent || "");
    });

    // Sidebar search
    const search = document.getElementById("search");
    const items = Array.from(document.querySelectorAll("#toc li"));
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for (const li of items) {
        if (!q || li.textContent.toLowerCase().includes(q)) li.classList.remove("hidden");
        else li.classList.add("hidden");
      }
    });

    // Glance pane: tag filter + free-text search
    const glanceFilters = document.getElementById("glance-filters");
    const glanceSearch = document.getElementById("glance-search");
    const glanceCards = Array.from(document.querySelectorAll("#glance-grid .card"));
    let activeTag = "all";
    let activeQuery = "";
    function applyGlance() {
      for (const card of glanceCards) {
        const matchesTag = activeTag === "all" || card.dataset.tag === activeTag;
        const matchesQuery = !activeQuery || card.textContent.toLowerCase().includes(activeQuery);
        if (matchesTag && matchesQuery) card.classList.remove("hidden");
        else card.classList.add("hidden");
      }
    }
    glanceFilters.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLButtonElement)) return;
      activeTag = target.dataset.tag || "all";
      for (const btn of glanceFilters.querySelectorAll("button")) btn.classList.remove("on");
      target.classList.add("on");
      applyGlance();
    });
    glanceSearch.addEventListener("input", () => {
      activeQuery = glanceSearch.value.trim().toLowerCase();
      applyGlance();
    });

    // Active-section highlighting on scroll
    const sections = Array.from(document.querySelectorAll("section.panel"));
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id;
          for (const li of items) {
            const a = li.querySelector("a");
            if (!a) continue;
            if (li.dataset.id === id) a.classList.add("active");
            else a.classList.remove("active");
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => obs.observe(s));
  </script>
</body>
</html>
`;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sectionsWithBodies = await Promise.all(
  SECTIONS.map(async (s) => ({ ...s, body: await loadSection(s) })),
);

await writeFile(resolve(here, "knowledge.html"), HTML_TEMPLATE(sectionsWithBodies), "utf8");
console.log("Wrote", resolve(here, "knowledge.html"));
console.log(
  "Sections:",
  sectionsWithBodies.map((s) => `${s.id}=${s.body.length}B`).join(", "),
);
