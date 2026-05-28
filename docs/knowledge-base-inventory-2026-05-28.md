# Knowledge-base inventory (2026-05-28)

Snapshot of every long-form research/design document currently living under
`/Users/nish/Documents/noop/docs/` plus its sub-trees, so the next research
stream can decide what to update vs. supersede.

---

## 1. Top-level summary of each document

| Path | Last meaningful update | Lines | Topic | Claim of accuracy |
|---|---|---|---|---|
| `docs/feature-matrix-audit.md` | 2026-05-14 | 683 | Inventory of shipped code (BLE stack, sync, backend pipeline, screens, inspector) + matrix vs WHOOP / OpenWhoop / OpenWhoop-2 / whoomp.js + gap list. | "Internal audit … real code in the monorepo today." File-path references with line anchors. |
| `docs/phase-6-research.md` | 2026-05-14 | 474 | Three deferred RE topics: firmware OTA path, virgin-mode pairing, WHOOP 5.0 / MG protocol. 100+ external citations. | Web-survey style; assertions individually cited. TL;DR feasibility ratings per topic. |
| `docs/knowledge.html` | 2026-05-15 (built from `build-knowledge.mjs`) | 6,127 (generated) | Single-file dashboard concatenating `feature-matrix-audit.md`, `whoop-community-research.md`, `phase-6-research.md`, `code-review-session.md`, `whoop-ble-protocol-reference.md`, `ble-patterns-research.md`, `research/whoop-features-deep-dive.md`, `research/screen-inventory.md`, `RESEARCH_KNOWLEDGE_BASE.md`, plus a hand-curated **63-card "At a glance" pane**. | Generator script lives in repo; rerun to refresh. Cards encode "Shipped / Number / Decision / Open / Research / Next" tags. |
| `docs/build-knowledge.mjs` | 2026-05-15 | 720 | Node ESM build script. Defines `GLANCE` (63 cards) + `SECTIONS` (one inline `current-state` block + 8 file-loaded sections) + an embedded HTML+CSS template using `marked` from a CDN. | Runs `node docs/build-knowledge.mjs` to regenerate `knowledge.html`. |
| `docs/code-review-session.md` | 2026-05-15 | (referenced by knowledge.html) | Per-session code review notes. | — (not re-read this pass; referenced as source). |
| `docs/whoop-ble-protocol-reference.md` | 2026-04-07 | 27,849 chars | BLE protocol reference — UUIDs, framing, command IDs, event IDs (decompiled-app sourced). | The canonical local protocol doc. |
| `docs/ble-patterns-research.md` | 2026-05-14 | 39,078 chars | RN/Expo BLE patterns survey. | Background research. |
| `docs/whoop-community-research.md` | 2026-05-14 | 41,813 chars | Community RE projects survey. | Used by phase-6. |
| `docs/whoop-trim-ack-investigation.md` | 2026-05-23 | 6,077 chars | The 2026-05-23 investigation that produced the "legacy ack framing" + "stop pretending strap acks cmd 23" commits. | Current, post-dates everything else. |
| `docs/app-integrity-security-plan.md` | 2026-05-18 | 5,476 chars | Plan for app-integrity / security work. | — |
| `docs/runbooks/compute-engine.md` | 2026-05-19 | 4,410 chars | Ops runbook for the `noop-compute-engine` Rust service — error budget, kill switch, re-enable, fallback semantics. | Live (compute-engine is in production behind a feature flag). |
| `docs/superpowers/audits/2026-05-19-sync-architecture.md` | 2026-05-19 | 10,462 chars | "8 concurrent loops" audit of BLE + sync architecture that triggered the consolidated Rust-worker spec. | Diagnostic; calls out redundancy. |
| `docs/superpowers/specs/` | 30 files, 2026-04-05 → 2026-05-25 | — | One design spec per implementation plan. Latest two are 2026-05-24 (visual redesign) and 2026-05-25 (Rust pipeline worker). | Approval is tracked per-spec ("Status: approved"). |
| `docs/superpowers/plans/` | 26 files, 2026-04-05 → 2026-05-20 | — | One implementation plan per spec. Checkbox-tracked tasks for AFK / subagent execution. | Each plan pairs with a spec. |

---

## 2. Entries still load-bearing (preserve when updating)

### Architecture-level invariants

- **TypeORM owns schema + migrations; Rust uses sqlx for compile-time-checked reads.**
  `specs/2026-05-25-rust-pipeline-worker-design.md` §3:
  > "Two invariants stay rigid: **TypeORM owns schema + migrations**, and **no cross-service callbacks** — the DB is the bus."
- **Pipeline triggering moves to the backend; mobile only consumes status.**
  Same spec §4 Phase D.5: "Backend-owned pipeline trigger live: post-ingest debounce (per-user, 10 s coalesce) + 15 min cron fallback."
- **Compute-engine has a JS fallback. It can go fully down without user-visible regression.**
  `docs/runbooks/compute-engine.md`:
  > "The JS path is the safety net — service can go fully down without user-visible regression."
- **Two binaries from one workspace.** `noop-compute-engine` (HTTP, no DB) and `noop-pipeline-worker` (Cloud Tasks consumer, sqlx, owns full DB).
- **`pipeline_runs` is append-only**, drives the inspector regression chart. (`feature-matrix-audit.md` §2.)

### BLE / protocol facts

- **GATT service `61080001…` + 5 characteristic UUIDs** including `61080007` MEMFAULT — agreed across all four implementations (Rust openwhoop, Python openWhoop-2, whoomp.js, ours).
- **SOF=0xAA framing, CRC-8 (poly 0x07) header, CRC-32 (refl. 0xEDB88320) payload** — `apps/app/app/services/ble/packet-codec.ts:6-46`. Identical across all implementations.
- **Universal event-payload framing** (decoded this period, verified across 10 event types):
  > `byte 0 status flag | bytes 1-4 unix u32 LE | bytes 5-6 counter u16 LE | bytes 7-8 payload-len u16 LE | byte 9 event subtype | bytes 10.. payload`
- **Battery event 3 + 63 decoding** (`feature-matrix-audit.md` §3.3, glance cards). r=0.95 SOC, r=0.97 icon level, r=0.84 voltage vs firmware FG ground truth, n=23.
- **Strap = WHOOP 4.0**: nRF52840 + LSM6DSO + MAX86171 + MAX77818. Nordic firmware `17.2.2.0` (Boylston side). Confirmed via console-log parsing.
- **Harvard / Boylston interpretation** (from `phase-6-research.md` §4.1): plausibly Harvard = app MCU ("Strap Firmware"), Boylston = BLE/radio MCU ("Bluetooth Firmware"). Both are Boston-neighbourhood codenames matching Whoop HQ at 1325 Boylston St.

### RE-project / community map

- **Three RE practitioners.** `jogolden` (whoomp.js, dormant), `bWanShiTong` (openwhoop, active, 43 commits to master), `christianmeurer` (Python reader, single-commit). Zero DEF CON / Black Hat / RECON talks on Whoop, ever.
- **No public WHOOP OTA write path exists.** OpenWhoop's `download-firmware` fetches from Whoop's cloud CDN, not the strap.
- **WHOOP 5.0 silicon swap**: nRF52840 → Ambiq Apollo4-class; MAX86171 → MAX86178-class (adds ECG). FCC IDs WS50/WG50/WD50/WB50 filed May 2025.
- **Pairing blocker is the cloud, not BLE.** Just-Works pairing is textbook crackable; real blocker is Whoop's account service minting a device-binding token consumed via `EventNumber.ExitVirginMode=31`.

### Algorithm / pipeline decisions

- **`dailyBalance` is the single user-facing recovery surface.** `recoveryIndex` algorithm preserved in `derived-metrics.ts` but unsurfaced. (Glance card; Q5 in feature-matrix audit.)
- **`sleep-stage-classifier.ts` (quantile-v1)** is the live stager; older RF `sleep-stage-engine.ts` retired (per glance cards "Orphan stager retired").
- **Per-user baseline auto-warmup at 5 nights.** Gates HRV / RHR penalties — fixed the cold-start "59 bpm = 88-point penalty" bug.
- **DMCA §1201(f) interop carve-out** is the legal framing the docs lean on. (`christianmeurer/whoop-reader` is cited as the model.)
- **Recovery formula warmup gate** + **HRV-CV 7-day rolling** + **SpO2 desaturation / ODI** are explicit differentiators vs WHOOP and vs every RE project.

### Visual / IA decisions

- **4 tabs locked.** Home, Health, Inspector, Settings. `specs/2026-05-24-app-redesign-restructure-design.md`: "Pure visual redesign. **No information architecture changes.**"
- **Reference family** for visual language: Whoop, Oura, Ultrahuman.
- **Single design vocabulary**: `GlowScoreCard`, `GlowTile`, `NumBlock`, `ContributorList`, `StatusBadge`, `TrendCard`. Component contract is in the 2026-05-24 spec.
- **Inspector is a top-level tab** (not a debug overlay). Promoted on 2026-05-14 (`plans/2026-05-14-inspector-tab.md`).

---

## 3. Entries that are now stale or contradicted

### Pipeline / compute ownership

- **`feature-matrix-audit.md` §2 describes the pipeline as a single in-process `runPipeline()` on NestJS.** Superseded by `specs/2026-05-25-rust-pipeline-worker-design.md`, which moves stages into a Rust worker triggered by Cloud Tasks. The audit's pipeline-stage table (§2 stages 0-14, line numbers in `pipeline.service.ts`) is *still accurate as a description of what the JS path does* but should be re-framed as "in-process JS fallback" with the worker now owning the trunk. `pipeline.service.ts` is described in the consolidated spec as eventually shrinking to "enqueue + read views."
- **Stage 0 watermark, mark() timing, pipeline_runs append-only — all preserved.** Carry forward.

### Mobile sync stack

- **`feature-matrix-audit.md` §1.4** lists 11 sync files including `SyncService.ts`, `continuousSyncDaemon.ts`, `syncTimer`, `batteryPollTimer`, etc. The 2026-05-19 audit (`audits/2026-05-19-sync-architecture.md`) found **8 concurrent loops** of which at least two (`maybeAutoSync` + `continuousSyncDaemon`) are redundant. The audit's prescription — "Simplify to **one** sync orchestrator + one HTTP drainer" — is now policy. The "11-file inventory" view in the audit reads as bloat to be collapsed.

### Recovery duality (Q5 in feature-matrix-audit)

- **Resolved.** `dailyBalance` is canonical; `recoveryIndex` removed from UI and API but algorithm kept in `derived-metrics.ts`. The feature-matrix audit's open question Q5 ("Two recovery numbers … need to either retire `recoveryIndex` or move `dailyBalance` over to it") is closed.

### Sleep score column (Q6)

- **Resolved.** New `daily_scores.sleepScore` int column with migration `1779500000000`. The feature-matrix audit's complaint about "`detail` field overload" / "Sleep score N substring" is closed.

### Orphan stager (Q4)

- **Resolved.** `sleep-stage-engine.ts` (382 LOC) + 59-LOC spec deleted. Pipeline only calls `sleep-stage-classifier.ts`.

### IMU persistence (Q1)

- **Resolved.** `parseIMUPacket` wired to `POST /telemetry/imu` → `imu_records`. Feature-flagged via `EXPO_PUBLIC_ENABLE_IMU_INGEST` (off by default until consumers exist).

### MEMFAULT subscription (Q2)

- **Resolved.** `MEMFAULT_UUID` subscribed; chunks routed as `[MEMFAULT base64=…]` to `console_logs`.

### Haptics builder (Q3)

- **Still open as of last knowledge.html build.** No glance card claims it as shipped. Likely still a 5-minute add.

### Trends tab

- **Stale references.** `feature-matrix-audit.md` §1.3 lists `TrendsScreen.tsx` (345 LOC). `specs/2026-05-11-healthspan-design.md` already renamed `Trends` tab → `Health` tab and dropped the 8-chart TrendsScreen. `specs/2026-05-24-app-redesign-restructure-design.md` does **not** include a Trends tab — it's been absorbed into Health. The TrendsScreen file is presumably still on disk for legacy reasons, but it's no longer in the IA.

### Sleep Planner

- **Still listed in the 2026-05-24 spec table** as `sleep-planner.tsx` "Form rows reusing menu grammar; glow-card preview of next-night target." Smart-wake schema still in `sleep_plans` table.

### Two recovery / sleep stagers / sleep score plumbing — all entries Q4 / Q5 / Q6 in §7 of feature-matrix-audit are now closed.

### `RESEARCH_KNOWLEDGE_BASE.md`

- **The build script loads it as a section** (`SECTIONS[id=knowledge-base]`). The file path in the audit (`§8 cross-references RESEARCH_KNOWLEDGE_BASE.md:642-669`) suggests it was the prior knowledge base — but `knowledge.html` *consumes* it as one section among many. The newer source-of-truth is `knowledge.html` itself.

---

## 4. Structure of `knowledge.html`

### Layout

```
┌──────────────────┬──────────────────────────────────────────┐
│ Sidebar (260px)  │ Main content                              │
│ - "noop" h1      │ ┌─ Page header ─────────────────────────┐ │
│ - subtitle       │ │ noop · knowledge dashboard            │ │
│ - search box     │ │ Last built: <ISO timestamp>            │ │
│ - TOC list:      │ └────────────────────────────────────────┘ │
│   · At a glance  │ ┌─ Glance pane ─────────────────────────┐ │
│   · current-state│ │ filter pills [All · 63] [Shipped · 32]│ │
│   · feature-…    │ │ [Number · 6] [Decision · 6] [Open · 6]│ │
│   · community    │ │ [Research · 6] [Next · 6]              │ │
│   · phase-6      │ │ + free-text search                     │ │
│   · code-review  │ │ + responsive grid of pill-tagged cards │ │
│   · ble-protocol │ └────────────────────────────────────────┘ │
│   · ble-patterns │ ┌─ Section panels (one per SECTIONS[]): │ │
│   · whoop-features│ │ rendered from embedded markdown via    │ │
│   · screens      │ │ <script type="text/x-markdown"> blocks │ │
│   · knowledge-…  │ │ + marked.min.js (CDN) at runtime       │ │
│                  │ └────────────────────────────────────────┘ │
└──────────────────┴──────────────────────────────────────────┘
```

### Sidebar nav (`SECTIONS` ids, in order)

1. `glance` — At a glance (63 cards)
2. `current-state` — inline markdown in `build-knowledge.mjs` itself
3. `feature-matrix` — loads `docs/feature-matrix-audit.md`
4. `community` — loads `docs/whoop-community-research.md`
5. `phase-6` — loads `docs/phase-6-research.md`
6. `code-review` — loads `docs/code-review-session.md`
7. `ble-protocol` — loads `docs/whoop-ble-protocol-reference.md`
8. `ble-patterns` — loads `docs/ble-patterns-research.md`
9. `whoop-features` — loads `research/whoop-features-deep-dive.md`
10. `screens` — loads `research/screen-inventory.md`
11. `knowledge-base` — loads `RESEARCH_KNOWLEDGE_BASE.md`

### "At a glance" card taxonomy (63 cards)

Each card: `tag`, `title`, `body` (1-2 sentence), `anchor` → section.

| Tag | Color | Count | Meaning |
|---|---|---|---|
| `shipped` | `#82c46d` green | 32 | Code shipped this session |
| `number` | `#5ec4e6` blue | 6 | Quantitative finding (correlations, sample counts, firmware version) |
| `decision` | `#d68064` accent orange | 6 | Choice we made + why |
| `open` | `#e3b34a` yellow | 6 | Known limitation / unresolved |
| `research` | `#b09bf0` purple | 6 | Community / web finding |
| `next` | `#d96a55` red | 6 | Ranked next step |

### Tone & voice

- Pitch-black background (`--bg: #0b0b0d`), monospace-leaning sans (`-apple-system, Inter, SF Pro Text`).
- Card pills are uppercase, 10px, letter-spaced 0.08em.
- Section panel headers are uppercase, 11px, letter-spaced 0.12em — debugger-grade chrome.
- Card titles are 13.5px / 600; bodies 12.5px / 400.
- Color palette: green/blue/yellow/purple/red mapped to the six tag types; accent orange (`#d68064`) used for active sidebar item + anchor links + card left-border.
- Tone: telegraphic, no marketing. Facts + line refs. `feature-matrix-audit.md`'s "✅ / 🟡 / ❌" legend extends into the cards.

### Formatting conventions

- All file paths are absolute (`apps/app/app/services/ble/packet-codec.ts:6-46` style).
- Numbers carry units (`r=0.95`, `n=23`, `1,422 evt 3 samples`).
- Tables ubiquitous — feature matrix, event framing, command list.
- Backticks for code/identifiers; bold for the load-bearing decision in a paragraph.
- Mermaid diagrams *not* used; ASCII tables and ASCII trees only.
- Smooth-scroll anchors throughout; cards link to section ids.

### Interactive features (client-side JS at bottom of HTML)

- Sidebar search (live filter on TOC list).
- Glance pane: tag filter (radio) + free-text search (AND).
- IntersectionObserver-driven active section highlighting in sidebar.

---

## 5. Map of secondary-screen documentation

### Home (HomeScreen / HomeMetricScreen / HomeDetailsScreen)

- `specs/2026-05-10-home-screen-redesign-design.md` — F3 layout: Recovery hero ring → 2×2 stat grid (Sleep/Strain/HRV/Journal) → Today's Tape → FAB.
- `specs/2026-05-16-home-monitors-redesign-design.md` — Health Monitor + Stress Monitor cards on Home.
- `specs/2026-05-19-home-date-calendar-design.md` — Date-pill expands to a full-month coverage calendar; backed by `/views/coverage`.
- `specs/2026-05-24-app-redesign-restructure-design.md` — Recovery glow card + Strain/Sleep tiles + today feed.
- Glance card: "5-vitals Health Monitor card" on HomeDetailsScreen (RHR / HRV / RR / SpO₂ / Skin Temp).

### Health (formerly Trends)

- `specs/2026-05-11-healthspan-design.md` — Renames Trends → Health. noop Age orb + Pace of Aging + Sleep/Strain/Fitness sections.
- `specs/2026-05-24-app-redesign-restructure-design.md` — "noop Age glow block + Pace of Aging trend + system contributors."
- Backend: `apps/backend/src/health/health.controller.ts`, `processing/healthspan.ts` (293 LOC). Per-metric hazard slopes + section aggregation.

### Sleep (SleepDetailScreen / SleepPlannerScreen)

- `specs/2026-04-07-sleep-detail-redesign.md` — Removed Sleep from the tab bar; became a push screen from Home with `{ date }` param.
- `specs/2026-05-10-sleep-detail-v1.5-design.md` — Insight-led: Hero → hypnogram + stage pills → journal-correlation Why panel → 2×2 vitals → 7-night sparklines → Labs accordion.
- Backend: `/views/sleep` extended with `score.detail`, `deltaVsWeek`, `factorInsights`.
- `specs/2026-05-24-app-redesign-restructure-design.md` — Sleep score glow card with hypnogram + stage contributors + why-panel.
- SleepPlanner: still listed as `sleep-planner.tsx` ("Form rows reusing menu grammar; glow-card preview").
- Validation harness: `validate-sleep-stager.ts` in place; needs PSG labels to run (glance card "Sleep stager unvalidated").

### Stress (StressMonitorScreen)

- `specs/2026-05-16-home-monitors-redesign-design.md` — Stress Monitor card + dedicated detail screen + `StressColorStrip` primitive.
- Algorithm: live `deriveLiveStressLevel` reads per-user `baselineRhr` (was hardcoded 60 bpm; fixed per glance card "Live stress uses per-user RHR baseline").
- Pipeline-side: `daily_metrics.stressAverage` precomputed in `derived-metrics.ts`.
- `specs/2026-05-24-app-redesign-restructure-design.md` — Stress color `#FF9F6B`.

### Strain (StrainActivityScreen / BoutDetailScreen)

- `specs/2026-05-19-activity-feed-frontend-revamp-design.md` — Rich-10 visual language: per-class icon + tint, single `BoutCard`, stacked `CandidateDeck`, `ClassPickerSheet` bottom sheet, new `BoutDetailScreen` + route.
- `specs/2026-05-19-activity-detector-redesign-design.md` — backend honesty audit; classifier was lying because historical packets lack the inputs.
- Algorithm: `activity-detector.ts` (379 LOC, 12 types). After 2026-05-25 spec: honest labels (Sedentary / Rest / Exercise / Light), cadence-gated dead branches dropped (commit `812b5dd2`).
- Backend: `daily_metrics.strainScore`, ACWR via `training-load.ts`.

### Recovery

- Not a dedicated screen — surfaced as the Home hero ring (Recovery score from `daily_scores.dailyBalance`).
- Glance cards: "Dual recovery numbers resolved" (`dailyBalance` is canonical, `recoveryIndex` retired from UI).

### Journal (JournalEntryScreen / JournalHistoryScreen)

- `specs/2026-04-06-journal-logging-design.md` — Factor grid + intensity picker, plus correlation hooks.
- `specs/2026-05-24-app-redesign-restructure-design.md` — "Glow-less compose surface; uses BLE-purple accent for save."
- Backend: `apps/backend/src/journal/`, `processing/journal-correlations.ts` (127 LOC). Δ(deep/REM) per factor tag. Surfaced on Sleep detail Why panel.

### HRV (HrvDetailScreen)

- `specs/2026-05-24-app-redesign-restructure-design.md` — "HRV glow card + D/W/M/6M/Y segmented + distribution + last-night sparkline."
- Glance cards: "HRV tile shows real value" (backend exposes `night_features.rmssd` via `homeView.activities.hrv`) and "HRV trend is real, not synthesized" (`sleepView.hrvTrend` from last-7-night rmssd values).
- Algorithm: RMSSD, SDNN, pNN50 in `wellness-scoring.ts`; LF/HF in `hrv-frequency.ts`; HRV-CV in `views.service.ts:1411-1433`.

### Device / DeviceSettings / Inspector (debug)

- `specs/2026-05-14-inspector-tab-design.md` — Promoted Inspector to 4th bottom tab; LiveMonitor + Diagnostics + Actions cards.
- `specs/2026-05-15-inspector-redesign-design.md` + `specs/2026-05-20-inspector-redesign-design.md` — 4-chip health strip, merged Events card, daemon drilldown, Logs Copy/Export, Expert mode.
- `plans/2026-05-17-inspector-shadcn-phase-1.md` + phase-2 + phase-5 — shadcn/ui + Magic UI + DiceUI migration of `apps/inspector/`.
- `specs/2026-05-19-inspector-pulse-rebuild-design.md` — Delta+Trace glass-card aesthetic with per-metric accents.
- `specs/2026-05-19-inspector-layout-fixes-design.md` — 1200px clamp + MetricChip null branch.
- `specs/2026-05-24-app-redesign-restructure-design.md` — "Device glow card (BLE-purple) + live HR + toggle rows + console log."

### Settings / Login / Welcome

- Covered by the 2026-05-24 visual redesign at a high level; no dedicated spec.
- Auth audit: `specs/2026-05-17-better-auth-audit.md`. Better-Auth integration with planned JWT-refresh + drop the `Origin: http://localhost:3009` hack (Phase E.6 in the Rust worker spec).

---

## 6. Recommendation for the downstream synthesis agent

- **`knowledge.html` is the right home for ongoing knowledge.** Its structure (sidebar + glance + sectioned long-form) is the established pattern. Tagged-card "At a glance" pane is genuinely useful summary surface.
- **The build script is the editable surface.** Cards are inline in `build-knowledge.mjs` (`GLANCE` array); long-form sections are file paths in `SECTIONS`. To update, edit the array + add/update the underlying markdown files + run `node docs/build-knowledge.mjs`.
- **Open questions in `feature-matrix-audit.md` §7 are largely closed.** A refresh of that file's §7 + §8 alone would clear most of the staleness. Q3 (haptics builder) appears to be the last surviving open item from the original 16.
- **The big-impact gap is the "pipeline owns more, in-process" framing.** Replace `feature-matrix-audit.md` §2 + §3.6 ("Pipeline incremental watermark") narrative with a pointer to `specs/2026-05-25-rust-pipeline-worker-design.md`.
- **Trends is dead, Health absorbed it.** Any future "screen inventory" pass should drop TrendsScreen entirely from the IA narrative even if the file is still on disk.
- **Visual vocabulary is locked.** Any new screen documentation should describe surfaces in `GlowScoreCard` / `GlowTile` / `NumBlock` / `ContributorList` / `StatusBadge` / `TrendCard` terms, per the 2026-05-24 spec.
