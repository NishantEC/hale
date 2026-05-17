# Noop Inspector Redesign — Design Spec

**Goal:** Rewrite the Noop Inspector from a tab-and-grid debug surface into a power-user-grade, command-driven, time-aware control room that is both faster to debug with and dramatically nicer to look at.

**Inputs:** Synthesis of nine independent reviews — 2 design engineers (visual/IA + content/UX writing), 4 senior engineers (React/state, data-viz, backend/API, performance), 1 accessibility auditor, and 3 user personas (Nish the founder, Priya the backend on-call engineer, Alex the curious early user).

**Non-goals:**
- Not a "lite mode" for non-engineers. The inspector stays a debugger — but the chrome around the data becomes legible to a curious wearer.
- Not a backend rewrite. New endpoints are scoped to thin shims unblocking the UI.
- Not a chart-library swap across the board. Recharts stays for sparse time-series; targeted upgrades only.

---

## 1. The verdict: what is wrong with the current inspector

Five themes converged across reviewers. Everything else in this spec is downstream of these:

1. **Status is invisible.** The Overview tab is "a pile of nouns, not a verdict" (Nish). A wall of identically-styled `Num` tiles and `Row` key-values renders zeroes and ones with no semantic weight. A power user cannot tell at a glance whether last night processed cleanly, whether the strap is silent, or whether the pipeline is dirty. The yellow dot on the Pipeline nav (`App.tsx:377-381`) is a symptom of this — it's a workaround for status being buried inside tab content rather than surfaced where actions live.

2. **The sidebar is doing four incompatible jobs.** Branding + nav + date picker + action cluster (Refresh / Run / Seed / Logout) stacked in 240px of vertical real estate, with the most-used controls below the fold. The 7-tab nav uses 192px wide-and-deep when icons + tooltips would do the same job in 48px. The `max-w-5xl` cap on `main` (`App.tsx:443`) then crushes wide charts on a 1920px display.

3. **Refresh is monolithic and lossy.** `refresh()` (`App.tsx:219`) fires 11 parallel fetches on every tab switch, every window focus, and every `trendsDays` change — including a 5000-row raw-records payload that only two tabs use. There is no per-tab cache, no abort, no per-source loading state, and five of eleven fetches are wrapped in `.catch(() => null)` which silently swallows real failures. Switching from Slack back to the inspector punishes a slow backend connection for no UX gain.

4. **The data plane is information-rich but the chrome is information-poor.** The numbers behind `Detections: 1 · Stages: 940 · Scores: 1` describe the same night three ways but the UI treats them as equal. The Hypnogram (the strongest single visual in the app) is decoupled from the DayTimeline directly above it — hovering one does nothing to the other, even though they share a time domain. Stage colors `--color-stage-core` (#1B81FE) and `--color-stage-deep` (#403EA7) fail WCAG AA contrast against `--color-surface` (#09090b) at ~1.5:1 and ~1.4:1 respectively.

5. **Power-user moves are missing.** No command palette. No keyboard tab-switching. No URL state — you cannot link to "Overview at 2026-04-12." No way to copy a row as JSON. No filter on the 5000-row Raw table. No way to diff two pipeline runs. The inspector tells you what came out; it does not let you trace what went in, what broke, or which code touched it.

---

## 2. Information architecture

### 2.1 New shell

Replace the left sidebar with **top bar + icon rail + main canvas**.

- **Top bar (48px)** — persistent across all tabs:
  - **Left:** `Noop Inspector` wordmark + API host (32-char truncate, current behavior at `App.tsx:350`).
  - **Center:** Date picker with `←` / `→` day-step buttons + "Today" shortcut. Date is the primary context selector and belongs in the primary chrome, not a footer.
  - **Right cluster:** Pipeline status badge (DIRTY / CLEAN / NEVER RUN, tonal color, pulls from `state?.isDirty`) → "Last refreshed Xs ago" → Refresh button → Run split-button (the existing `RunPipelineMenu`).

- **Left icon rail (48px wide, icon-only)** — 7 tab icons + Seed + Logout. Active state is a 2px accent left-border. Tooltip on hover names the tab + its keyboard shortcut. Stolen from Datadog and Linear.

- **Main canvas** — no more `max-w-5xl`. Raise to `max-w-7xl` or remove the cap entirely on chart-heavy tabs (Sleep, Trends, Telemetry).

This recovers ~192px of horizontal content space and puts the three things you actually look at (date, pipeline status, refresh age) in front of you at all times.

### 2.2 Tab order and identity

Current: Overview → Trends → Insights → Sleep → Raw → Pipeline → Telemetry.

New order, mapping to the actual mental model of someone debugging a sleep night:

1. **Home** (was Overview, reshaped — see §3)
2. **Sleep** (the primary nightly debug target)
3. **Pipeline** (you run it after looking at sleep data)
4. **Raw** (raw records relate directly to overview counts)
5. **Trends**
6. **Insights**
7. **Telemetry** (stays last — hardware concern, different)

Overview is renamed **Home** because that is now what it is — the morning verdict page (§3), not a counts dump.

### 2.3 Command palette

`⌘K` / `Ctrl+K` opens a palette over the canvas. Entries:

- Refresh all data
- Run pipeline: today / last 7 days / last 30 days / full / selected date
- Seed demo data
- Jump to tab (Home, Sleep, Pipeline, Raw, Trends, Insights, Telemetry)
- Jump to date: `<input>` accepting `2026-05-15`, `yesterday`, `-7d`, etc.
- Copy current view as JSON
- Copy permalink to current state
- Toggle live tail
- Sign out

The palette is the truth source for these actions. The top-bar Refresh and Run buttons are convenience surfaces; the in-tab "Rerun this night" buttons that exist today in three places with three different preset sets (Nish's annoyance #4) get deleted in favor of the palette + top-bar.

### 2.4 Keyboard shortcuts

A single, compact set:

| Key | Action |
|---|---|
| `⌘K` | Command palette |
| `1`-`7` | Jump to tab N |
| `R` | Refresh |
| `P` | Open run-pipeline menu |
| `[` / `]` | Previous / next day |
| `T` | Jump to today |
| `D` | Open date picker |
| `L` | Toggle live tail (global, not just Telemetry) |
| `/` | Focus the search input on the current tab |
| `?` | Open keyboard-shortcut help |
| `Esc` | Close any modal/menu |

Discoverability: tooltips on top-bar buttons include their shortcut. `?` opens a help modal. Single-letter hints appear in command-palette item text.

---

## 3. The "first screen verdict" — new Home tab

The single biggest UX problem (per Nish, Alex, both design engineers, and the content audit) is that landing on the inspector should answer one question before anything else: **is the system healthy?**

Home becomes a single scrollable screen with this anatomy, top to bottom:

### 3.1 Hero status row (above the fold)

Three large status pills, full row width, color-coded:

- **Pipeline:** `CLEAN — last run 12m ago` (green) / `DIRTY — inputs changed since last run` (yellow + inline Run button) / `NEVER RUN` (red + inline Run button).
- **Strap signal:** `Active — latest record 4m ago` (green) / `Stale — 6h since last record` (yellow) / `Silent — no records in 24h` (red).
- **Selected night:** `2026-05-14 · 7h 32m · processed` (green) / `2026-05-14 · no detection` (yellow + inline "rerun" button) / no date picked yet (neutral).

If all three are green, the user immediately knows everything is fine and can move on. If any is yellow or red, the inline action button takes them to the fix.

### 3.2 Last-night card

Directly below the status row, the **headline chart**: a half-height Hypnogram for the selected night, with four stat chips below it (Duration · HRV (RMSSD) · RHR · Respiratory rate). Each chip shows: today's value, the 14-day average, and the baseline as three stacked dots (Alex's wish).

If a journal correlation exists for the deltas: one sentence in plain English. ("Your deep sleep was 22 minutes below baseline; the last time that happened you'd logged 'late workout'.") This is the journal-correlations data turned into a sentence — same data, dramatically more legible.

### 3.3 Counts strip (collapsed by default)

The current Overview counts (Raw rows, Detections, Stages, Scores) survive but live behind a `Details` disclosure. They're confirmatory data, not decision-relevant on first paint. When expanded they get the new `Num` semantics (§5.3) with status borders.

### 3.4 Sync trail

Replace the current "Sync state" / "App views" two-column dump. Render as a single timeline: `Strap → Backend (last raw record at T1) → Pipeline (last run at T2, status S) → App view (last update at T3)`. Each node shows its timestamp and a status dot. The trail makes "where in the chain is the staleness" answerable in one glance.

---

## 4. Per-tab specifics

### 4.1 Sleep tab

The standout chart in the app (Hypnogram) gets the following upgrades:

- **Cross-chart sync.** Hovering the Hypnogram highlights the same timestamp on the DayTimeline above it. Hovering DayTimeline reverse-highlights the corresponding Hypnogram epoch. Both share a single scrub controller hosted by the Sleep tab.
- **Tooltip precision.** Current Hypnogram tooltip snaps to the segment center (`Hypnogram.tsx:109-113`); it should follow the cursor and show the exact epoch timestamp + containing-segment metadata as secondary context. The `min` value at line 108 is already available, just discarded.
- **New chart: Stage × HR scatter.** X-axis mean HR per epoch, Y-axis stage (Awake / REM / Core / Deep ordinal), one dot per epoch, colored by stage. Overlay a box-and-whisker per stage row. Surfaces classifier-vs-biometric disagreement immediately — if Deep epochs show 72 bpm and Awake epochs show 68 bpm, the classifier is inverted. Join is `epochs[].stage` × `raw.rows[].heartRate` on timestamp.
- **Stage color contrast.** Bump `--color-stage-core` and `--color-stage-deep` luminance to pass AA against `--color-surface`. Specific tokens in §5.2.

### 4.2 Pipeline tab

- **Hero status row repeats the top bar's pipeline pill** but expanded: pipeline version pill (git SHA), last-run duration, stage timings, dirty inputs preview. Steal Linear's pattern — repeat the actionable state at the top of the view, not just in the nav.
- **Per-run row gets a version pill.** Today `PipelineRunRow` has `id, startedAt, durationMs, skipped, stages` and no version. Add `pipelineVersion` (git SHA short) server-side; surface as a colored pill on every bar in `PipelineRunsChart`. Lets Priya answer "did the code change move this number?" without leaving the tab.
- **Click a run bar → drill-in.** Currently `PipelineRunsChart` is display-only. Clicking a bar opens a side-panel: stage timings as a horizontal stacked bar, input/output row counts, any thrown exceptions, a "rerun this date" button.
- **Run-diff mode.** Select two runs (cmd-click) → side-by-side stage-timing + output-count delta. Backend shim: `GET /debug/pipeline-runs/:id/diff?compareId=`.
- **Static legend for stage colors.** Today `PipelineRunsChart.tsx:216` renders the stage legend only when `stageNames.length > 0`. Render from the `STAGE_COLORS` constant unconditionally.
- **Dry-run.** Add a "Dry-run" toggle on the Run menu: backend returns the plan (windows, partitions touched, expected row count) without executing. Lets Priya commit confidently to a force-recompute.

### 4.3 Raw tab

- **Time-range filter.** Add a time-range input above the table (placeholder `02:00–03:00`). The 5000-row table is unusable without it.
- **Virtualize.** `@tanstack/react-virtual` on the table. ~20 lines. Drops the DOM cost of 5000 `<tr>` to a fixed window.
- **Per-row copy-as-JSON.** Cmd+C on a focused row copies its JSON to clipboard. Visible "copy" icon in a hover state.
- **Signal-gap badge.** Above the table, a one-line summary: `4 gaps · longest 12m at 02:14 → 02:26`. Sourced from a new endpoint `GET /debug/signal-gap-report?date=` (the backend already computes `todayCoverageMinutes` in `getOverview` — extend it).

### 4.4 Trends tab

- **Brushing + shared crosshair.** The 10 `TrendChart` instances in `Trends.tsx:147-213` are independent. They should share a single domain controller — brushing one brushes all, hovering one shows a vertical crosshair on all. Recharts' `<Brush>` doesn't sync across charts, so domain state lifts to the Trends tab and is passed as a `domain` prop to each chart.
- **Compact mode.** Toggle that drops chart height from 200px to 90px so the full 10-chart grid fits above the fold.
- **Tooltip cleanup.** `TrendChart.tsx:128-132` shows the chart title as the series label inside the tooltip — redundant with the panel title 8px above. Series label slot becomes the unit or the Δ-from-mean.

### 4.5 Telemetry tab

- **Live mode goes global, not just this tab.** A persistent live indicator in the top bar with pause-on-hidden (`document.hidden` guard) and exponential backoff on failure (5s → 30s → 60s, reset on success).
- **Log search and level filter.** Console log table gets a text search input + level toggles (error / warn / info / debug). Pause-on-error toggle.
- **BLE event grouping by session.** Currently events are listed flat. Group by connection session: handshake → subscribe → first packet → gap → disconnect, with elapsed time between each.
- **Unknown event drill-in.** Today an unknown event row says "needs RE" and tells you to run a script. Make it clickable — open a side panel showing the raw hex payload distribution for that opcode across the last 24h. Backend shim: `GET /debug/unknown-events/:opcode/payloads`.
- **Three-chart battery section sync.** SOC, voltage, temperature share a time domain — share their crosshair.

### 4.6 Insights tab

- Promote journal correlations from a buried table to a **lead headline** ("On nights you go to bed within 30 minutes of your usual time, you get 41 more minutes of deep sleep"). Same data, sentence-form. The table stays below for power users.

---

## 5. Visual system

### 5.1 Surface layering with intent

Current tokens (`index.css`) are four near-identical blacks used inconsistently. Assign explicit roles:

| Token | Hex | Role |
|---|---|---|
| `--color-surface` | `#09090b` | Page background only |
| `--color-surface-1` | `#111113` | Chart/table card backgrounds |
| `--color-surface-raised` | `#1c1c1f` | **NEW.** Stat cards, hero status pills |
| `--color-surface-2` | `#18181b` | Hover states, active nav, tooltip backgrounds |
| `--color-surface-3` | `#222225` | Focused inputs, K-bar modal, command palette items |

Stat cards on Home + tile groups across tabs get `surface-raised` backgrounds instead of bare-text-on-surface. The `Num` grid stops reading as floating text.

### 5.2 Status colors with weight

| Token | Hex (current) | Hex (new) | Notes |
|---|---|---|---|
| `--color-text-2` | `#63636e` | `#7e7e8c` | Current fails AA (3.18:1 on `surface-1`). New passes (~4.6:1). |
| `--color-border` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.10)` | Invisible at most viewing angles today. |
| `--color-border-strong` | `rgba(255,255,255,0.14)` | `rgba(255,255,255,0.18)` | |
| `--color-stage-core` | `#1B81FE` | `#5BA8FF` | Current ~1.5:1 against `surface`; new passes 3:1 for graphical objects. |
| `--color-stage-deep` | `#403EA7` | `#7B78D6` | Current ~1.4:1; new passes 3:1. |

The stage colors are also exported as `HYPNOGRAM_STAGES` from `Hypnogram.tsx:17-22` — they should read from CSS variables, not hex literals, so the mobile app and inspector share one source of truth.

### 5.3 Status semantics on primitives

`Num` accepts an optional `status` prop (`"ok" | "warn" | "error" | "stale"`). When set: 3px left border in the semantic color runs full tile height, value text takes the semantic color, sub-label adds the status word. Zero configuration for the common case (no status = default rendering).

`Row` accepts `highlight` (same tones). When the pipeline `currentMaxUpdatedAt` is more than 6h old, the row value renders in yellow. Stale data stops looking identical to fresh data.

`Pill` border-radius increases from `rounded-md` to `rounded-full`. Reads as system-status indicator rather than form-badge.

### 5.4 Type scale for density

Global base stays at 15px Inter for prose-weight UI. Add `--font-size-dense: 13px` for table rows. `Row` accepts a `dense` prop that drops to 13px with `py-1.5` padding. The Pipeline watermark section (`Pipeline.tsx:85-138`) currently truncates on column value width; dense mode fixes it.

Numeric columns get `font-variant-numeric: tabular-nums` and right-align. Stolen from Stripe Sigma — same data, dramatically more scannable.

---

## 6. Microcopy

The eight worst labels and their rewrites (from the content review):

| Location | Current | New |
|---|---|---|
| `Overview.tsx:22` | "Raw rows" | "Sensor records (all time)" |
| `Overview.tsx:25` | "Detections" + sub: `auto`/`manual` | "Sleep detections" + sub: `mode: auto` |
| `Overview.tsx:28` | "Stages" + sub: `Epochs: N` | "Sleep stages" + sub: `N epoch windows` |
| `Overview.tsx:31` | "Scores" + sub: lastPipelineRunStatus | "Daily scores" + sub: `last run: {status}` |
| `Overview.tsx:46` | "Selection" / "Selection mode" | "Night selection mode" |
| `Overview.tsx:52` | "Plan updated" | "Sleep plan last updated" |
| `Overview.tsx:69` | "Sleep empty: Yes / No" | "App sleep view: populated / empty" |
| `Pipeline.tsx:95` | "Last input max" | "Input high-water mark (prev run)" |

Plus a unified glossary (terms used in copy across the app):

| Term | Meaning |
|---|---|
| Sleep detection | A candidate sleep window from raw sensor data; has bedtime, wake time, confidence. |
| Sleep stage | A 30-second epoch classified as Awake / REM / Core / Deep. |
| Epoch | A single 30-second window. The unit before stage labeling. |
| Hypnogram | Visual chart of stages across a night. Display artifact only. |
| Night features | Computed metrics for one detection (RHR, HRV, SDNN, respiratory rate). |
| Daily score | Composite quality/recovery score per calendar day. |
| Night selection mode | How the system chose which detection counts as "the" night: `auto` / `manual`. |

"sleep-night" never appears in UI copy (it's an API path leaking in). "Continuity / Coverage / Confidence" get tooltips explaining direction-of-better and unit.

### 6.1 Empty / error states

Catalog of missing states + proposed copy:

- **No data for selected date** — "No sensor records for {date}. The strap may not have been worn, or data has not synced yet."
- **Pipeline never run** — "Pipeline has not run. Scores and stages will be empty until you run it." + inline Run button.
- **BLE silent 24h** — "No device events in the last 24 hours. If the strap is being worn, check BLE connectivity and that the app is running in the background."
- **Raw tab empty** — "No sensor records for {date}. Select a different date or check that the strap synced."
- **Trends zero nights** — "No nights processed in this range. Run the pipeline to populate trends." + inline Run button.
- **Global fetch failure** — "Could not reach the backend ({url}). Check that the server is running." + Retry button. Currently `App.tsx:439` shows the raw thrown `Error.message`.
- **Insights no night** — "No night processed for {date}. Try selecting a date that has completed pipeline output, or run the pipeline for this date."

---

## 7. Data and state layer

### 7.1 Replace the monolithic refresh with React Query

Kill `refresh()` (`App.tsx:219`). Replace with `@tanstack/react-query`. One `useQuery` per endpoint, co-located with the tab that consumes it. The Home tab eagerly prefetches `overview` + `homeView` + `sleepView` + `pipelineState` on load (cheap, used immediately). Everything else fetches lazily on tab mount.

Cross-cutting state (`date`, `token`, `trendsDays`) lives in a small Context. A pipeline run triggers `queryClient.invalidateQueries(...)` for the affected keys — no manual `setX` chains.

Replaces the manual `visibilitychange` listener (`App.tsx:295-305`) with React Query's `refetchOnWindowFocus` per-query. Telemetry's live mode becomes `refetchInterval: 5000` with a `pause-on-hidden` guard.

### 7.2 Per-tab fetch contract

| Tab | Needs | Currently fetches |
|---|---|---|
| Home | `overview`, `homeView`, `sleepView`, `pipelineState` | All 11 |
| Sleep | `sleep`, `raw`, `sleepView` | All 11 |
| Pipeline | `state`, `results`, `runs` | All 11 |
| Raw | `raw` | All 11 |
| Trends | `trends` | All 11 |
| Insights | `sleep`, `results`, `trends` | All 11 |
| Telemetry | `telemetry`, `batteryHistory` | All 11 |

`trendsDays` change must only re-fetch `/views/trends`. Today it re-fetches all eleven endpoints (`App.tsx:272`).

### 7.3 URL state — no router needed

`URLSearchParams` directly. On `Inspector` mount, read `?tab=home&date=2026-05-14&trendsDays=30` to initialize state. On `setTab`, `setDate`, `setTrendsDays`: `history.replaceState` with updated params. ~15 lines, no new dependencies. The existing `localStorage` keys (`noop.tab`, `noop.trendsDays`) become fallbacks when no params are present.

This unlocks shareable permalinks ("Overview at 2026-04-12") at near-zero cost.

### 7.4 Error model

Replace `err: string | null` with `errors: Partial<Record<DataKey, ApiError>>`. In `parseJson` (`api.ts:18`), inspect `res.status`:
- 401 → typed `AuthError`, triggers logout
- 5xx → `ServerError`
- fetch rejection → `NetworkError`
- 2xx with malformed body → `ParseError`

Each tab receives its own error prop and renders inline rather than every failure stomping the top-of-page banner. The five `.catch(() => null)` in `App.tsx` (lines 245, 246, 251, 252, 253) are deleted.

Sign-in error gets `role="alert" aria-live="assertive"` so screen readers announce.

### 7.5 Auth

Token moves from `localStorage` → `sessionStorage` (`api.ts:80`). Dies with the tab. 401 interception forces a fresh login rather than leaving a stale token in place forever.

---

## 8. Performance

### 8.1 Lazy-load tabs (the highest-payoff single change)

`React.lazy()` + `<Suspense>` for every tab. Add a manual chunk for recharts in `vite.config.ts`:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: { recharts: ['recharts'] },
    },
  },
}
```

Recharts is ~200kb gzipped and ships in the critical bundle today even when landing on Home. Lazy-loading Sleep / Trends / Telemetry moves recharts off the cold-load path. ~150-200ms TTI win on first paint.

### 8.2 DayTimeline downsampling

`DayTimeline` passes 5000 raw samples directly to `<LineChart>` (`DayTimeline.tsx:37`). Recharts re-walks all 5000 points on every mousemove tick — 8-15fps during scrub.

Add LTTB downsampling to ~500 points in a `useMemo`. ~30 lines, no library. Restores 60fps without changing chart library. If 5000-point fidelity is later needed for diagnostics, add a `Full fidelity` toggle that swaps in uplot for the dense path.

### 8.3 Other targeted fixes

- `Hypnogram.tsx` SVG `<defs>` block (lines 212-385) gets memoized — keyed on `segments` and `containerWidth` — so cursor moves stop re-evaluating the mask.
- `batteryHistory` + `telemetry` state moves from `App.tsx` into the Telemetry tab. Removes two state slots from the shell.
- Live polling: pause when `document.hidden`. Exponential backoff (5s → 30s → 60s) on consecutive failures.

---

## 9. New backend shims

Five small endpoints unblock the UI. None require a backend redesign:

1. **`POST /debug/pipeline/run`** returns `{ runId }` synchronously, then runs in the background.
2. **`GET /debug/pipeline/run/:id/status`** returns `{ stage, elapsed, done, error? }` for progress UI. Polled at 500ms until `done: true`. Backend stores progress in an in-memory `Map<runId, progress>`.
3. **`GET /debug/pipeline-runs/:id/diff?compareId=`** returns stage-timing + output-count deltas between two runs.
4. **`GET /debug/raw-records/search?from=&to=&q=`** filters raw rows by time window and optional field threshold (e.g., `hr > 100`).
5. **`GET /debug/signal-gap-report?date=`** returns sorted list of gaps in `raw_sensor_records` for a day.

Three more nice-to-haves (cut if scope explodes):

- `GET /debug/export?from=&to=&format=csv|json` — streaming export.
- `GET /debug/epoch-jump?ts=` — epoch + neighbors + contributing raw rows.
- `GET /debug/unknown-events/:opcode/payloads` — hex payload distribution.

Pipeline runs gain a `pipelineVersion` column (git short SHA at run time) and a `failureKind` column for error classification.

---

## 10. Accessibility

The non-negotiable fixes (WCAG AA + power-user keyboard):

- `--color-text-2` lifted to pass AA (§5.2).
- Stage colors lifted to pass 3:1 graphical-objects contrast (§5.2).
- Sign-in error gets `role="alert" aria-live="assertive"`.
- `RunPipelineMenu`: Escape closes, focus restores to trigger, focus traps while open.
- Visible focus ring on all interactive elements. Currently `outline: none` with no replacement.
- Arrow-key traversal of the tab rail. Number-key shortcuts (`1`-`7`) for direct jump.
- Refresh / Run buttons get `aria-busy` during work.
- Help modal (`?`) lists all shortcuts.

---

## 11. Persona reconciliation

The user asked for an inspector that serves "user and debugger both." The three personas (Nish, Priya, Alex) collectively want this:

- **From Nish:** keyboard-first, command palette, kill Overview-as-counts, first-screen verdict, global live tail, single source of truth for "rerun".
- **From Priya:** pipeline version on every run, per-stage error rates, run-diff, log search + level filter, BLE session grouping, dry-run plan.
- **From Alex:** plain-language sentence on Home (journal correlation), tooltips that say what direction is good, day-of-week / weekday-vs-weekend cuts, single morning page.

The synthesis is **one inspector, not two modes**. The Home tab serves Alex's morning-page wish and Nish's first-screen-verdict wish at the same time — the same chart + chips + sentence works for both. The Pipeline and Telemetry tabs serve Priya. The command palette + keyboard nav serve Nish + Priya. Microcopy that explains direction-of-better serves Alex without dumbing anything down for the others.

No "lite mode" toggle. The data plane stays dense. The chrome stays explanatory.

---

## 12. What gets deleted

Day-one kills with prejudice:

1. The monolithic `refresh()` and the global `busy` state. Replaced by per-tab queries.
2. The `useMemo` for `epochs` (`App.tsx:342`). Provides zero referential stability. Inline `sleep?.epochTimeline ?? []` instead.
3. The `.catch(() => null)` swallowed-error pattern across five fetches.
4. The localStorage-only state for `tab` and `trendsDays`. Replaced by URL params.
5. The three different "rerun this night" buttons (sidebar, Sleep header, Trends header). Replaced by single source-of-truth in top bar + palette.
6. The Overview "App views" block (`Overview.tsx:60-82`). It's content QA for the mobile builder, not a backend signal. Moved behind a toggle on Home.
7. The 240px sidebar form factor entirely.
8. The `max-w-5xl` content cap.

---

## 13. Reference apps (steal list)

- **Linear** — repeat actionable status at the top of the tab content, not just in the nav badge. The Pipeline DIRTY pill should be the first thing on the Pipeline tab.
- **Datadog** — 48px icon rail with accent-left active state; tooltip on hover.
- **Stripe Sigma** — table density, semantic column types, `tabular-nums` on numeric columns.
- **Raycast / Linear K-bar** — command palette with fuzzy match, action descriptions, keyboard hints inline.
- **Vercel dashboard / Grafana Explore** — top bar with persistent context (env / time-range / refresh age) so the chrome never leaves view.

---

## 14. Open questions for the user

Three decisions to lock before plan stage:

1. **Routing.** Native `URLSearchParams` (recommended, ~15 LOC, no deps) vs. `wouter` (~2kb, hash routing) vs. `react-router` (likely overkill for 7 tabs). Lean: URLSearchParams.
2. **Chart library swap scope.** Recharts stays for Trend/PipelineRuns/Battery; Hypnogram stays custom SVG. Open: does `DayTimeline` get LTTB-downsampled-recharts (small, low-risk) or migrated to uplot now (larger, fully future-proof)?
3. **Backend shims.** Are the five must-have endpoints in §9 acceptable to land as part of this rewrite, or should the UI rewrite ship first against the existing API and the backend shims phase in after?

---

## 15. Out of scope (deferred)

- Multi-user / role-based views. Single-user tool today, stays single-user.
- A mobile-responsive inspector. Desktop-only.
- Server-side rendering. SPA stays.
- Telemetry-to-external-sinks (Grafana, Datadog forwarding). Local debug only.
- "Lite mode" or persona toggle. Single dense inspector serves all three personas via better chrome and microcopy.
