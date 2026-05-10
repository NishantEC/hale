# Sleep Detail Screen — V1.5 Redesign

Date: 2026-05-10
Status: Approved (user)

## Goal

Replace the current Sleep Detail screen, which over-renders 14+ metrics in a layout-broken grid, with a screen that leads with the app's wedge: journal-correlation insights ("your sleep, explained by your inputs"), built on data already in the schema.

## North star

Within 5 seconds of opening the screen the user knows: how long they slept, how their score compares to their week, and *why* it landed where it did. Everything else is a drill-down.

## Information architecture

Top to bottom:

1. **Header** — back, date with prev/next chevrons + horizontal swipe (mirror `HomeScreen.DateSwitcher`), alarm pill (or "Set alarm" CTA if none).
2. **Hero** — duration (largest), bedtime range subtitle, score chip with delta-vs-week, one-line plain-language detail.
3. **Stages** — hypnogram (no left label column), colored stage pills below.
4. **Why** — top-3 journal-correlation factors. Empty-state CTA when no journal entries.
5. **Vitals** — 2×2 cards: Efficiency, RHR, HRV (RMSSD), Skin Temp Δ. Each shows delta-vs-week.
6. **Trends** — two inline sparklines (duration · score), always visible, current-night dot highlighted, point-tap navigates to that night.
7. **Labs ▾** — collapsed accordion with SpO₂, SpO₂ Dips, Resp Rate, Blood Oxygen.

Cuts: LF/HF Ratio, Architecture Score, Core Temp, Recovery (lives on Home), Sleep Reserve (belongs on planner). The "More Details" expander as a gate is removed; nothing primary lives behind it.

## Components

| Component | New / Refactored | Responsibility |
|---|---|---|
| `SleepHero` | new | Duration + range + score chip + delta + 1-line detail. Pure presentation. |
| `HypnogramChart` | refactor | Remove `LABEL_COLUMN_WIDTH` left-side labels; render chart only. Keep tap/drag cursor. |
| `StagePills` | new | Horizontal pills, colors match stage palette (`SleepStage` config in HypnogramChart). |
| `VitalCard` | new | Label + value + optional delta-vs-week chip. |
| `WhyPanel` | new | Top-3 factor rows. Three states: populated, no-journal CTA, no-correlations fallback (backend-derived). |
| `TrendSparkline` | new | One row: label, weekly avg, SVG line, current-night dot, tappable point → night detail. |
| `LabsAccordion` | new | Tappable header, `LayoutAnimation` open/close, 2-column list inside. |
| `DateSwitcher` | extract from `HomeScreen.tsx:422` | Currently an inline function inside HomeScreen — lift to `components/DateSwitcher.tsx` and reuse on both screens. Prev/next chevrons + horizontal swipe gesture. |

## Backend / view-model changes

The mobile screen reads from `sleepView` (already wired via `/views/sleep`). Three additions to that controller's response shape:

| Field | Source | Purpose |
|---|---|---|
| `score.deltaVsWeek` | `dailyScores.dailyBalance` − rolling 7-night average | Score chip "+4 vs week" |
| `vitals[k].deltaVsWeek` for each of `efficiency`, `rhr`, `hrv`, `skinTempDelta` | per-metric 7-night rolling mean diff | VitalCard delta chip |
| `score.detail` | `dailyScores.detail` (already in DB) | Hero one-line explanation |

`factorInsights` already exists in `sleepView`; relabel keys (`deepDelta` → `deepMin`, `remDelta` → `remMin`) so the mobile renders plain English without re-mapping.

No schema changes required. All deltas are computed at request time from existing tables.

## Data states

| State | Behavior |
|---|---|
| < 7 nights of data | `deltaVsWeek` chips hidden everywhere; hero detail line shows "First night — building your baseline" |
| `dailyScores.confidence === 'Low'` | Hide score chip; show "Building baseline" pill instead |
| No journal entries | Why panel collapses to CTA: "Log how you slept (caffeine, workouts, stress) → unlock factor insights." Tappable → journal entry screen. |
| Journal entries but no significant correlations | Why panel falls back to backend-derived ("Your awake time was 2× your week's average") |
| No alarm configured | Header pill becomes "Set alarm" with same tap target → planner |
| Sparklines with < 3 nights | Render flat with "Need 3+ nights" overlay |

## Interactions

- **Date header** — `‹` / `›` chevrons + horizontal pan gesture. Reuse `HomeScreen` `DateSwitcher` component verbatim.
- **Hypnogram** — existing tap/drag cursor with themed tooltip (already themed in last fix).
- **Stage pills** — visual only in V1.5. Tap-to-scroll-cursor deferred to V2.
- **Why-panel rows** — tappable → journal screen filtered to that factor tag.
- **Trend point** — tappable individual night dot → navigates to that night's sleep detail.
- **Labs header** — tap to expand/collapse with `LayoutAnimation.configureNext`.

## Theming

All colors via `LOCAL_THEME.colors`. Stage colors from `SleepStage` config. Stage-pill backgrounds: stage color at 14–18% opacity. Why panel: subtle violet/amber gradient (`rgba(124,58,237,0.10) → rgba(255,164,43,0.05)`). Vital cards: `colors.surfaceCard` with no border. Hero duration: `colors.text` neutral, score chip: `colors.statusAmber`.

## Cuts and deferrals

Cut from screen entirely:
- LF/HF Ratio (opaque, immature algorithm)
- Architecture Score (always null in current build)
- Core Temp (estimate, not measured; near-duplicate of skin temp)
- Recovery (lives on Home; redundant)
- Sleep Reserve (forward-looking; belongs on planner)
- Duplicate "Sleep Score 66/100" cell (already the hero)

Deferred to V2:
- HealthKit-augmented insights (cross-device fusion narrative)
- Score-explainer modal (tap hero → component breakdown)
- Stage-pill tap-to-scroll-hypnogram interaction

## Implementation order

1. Backend: extend `/views/sleep` with `deltaVsWeek` rollups + `score.detail` + relabeled `factorInsights`. Deploy.
2. Mobile: refactor `HypnogramChart` to drop left label column. Add `StagePills` + `VitalCard` atoms.
3. Mobile: extract the inline `DateSwitcher` (currently `HomeScreen.tsx:422`) into `components/DateSwitcher.tsx` and import from both screens.
4. Mobile: build `SleepHero`, `WhyPanel`, `TrendSparkline`, `LabsAccordion`.
5. Mobile: replace `SleepDetailScreen.tsx` body with the new layout. Drop the broken metric grid.
6. Wire empty states; manually test Day-1, no-journal, no-alarm, Low-confidence-score.

## Files affected (estimated)

- `apps/backend/src/views/views.controller.ts` — `/views/sleep` lives here; extend response shape
- `apps/backend/src/views/views.service.ts` (if present) — compute deltas; otherwise add a helper module
- `apps/app/app/screens/SleepDetailScreen.tsx` — full body replacement
- `apps/app/app/components/HypnogramChart.tsx` — drop label column
- `apps/app/app/components/SleepHero.tsx` — new
- `apps/app/app/components/StagePills.tsx` — new
- `apps/app/app/components/VitalCard.tsx` — new
- `apps/app/app/components/WhyPanel.tsx` — new
- `apps/app/app/components/TrendSparkline.tsx` — new
- `apps/app/app/components/LabsAccordion.tsx` — new
- `apps/app/app/components/DateSwitcher.tsx` — extracted from HomeScreen, shared
- `apps/app/app/services/api/noopClient.ts` — extend `SleepView` type for new fields

## Acceptance

- All cuts removed from the screen
- Sparklines and Why panel always above the fold
- Date prev/next + swipe matches HomeScreen behavior
- Empty states render cleanly on a fresh install with no data
- Score chip hides on Low confidence
- Theme tokens drive all colors; no hardcoded rgba in component bodies
