# Secondary screens — status & punch-list (2026-05-31)

Ground-truth re-audit of every current screen against the §4 targets in
`secondary-screens-master-plan-2026-05-28.md`. **This supersedes the status
columns in `current-secondary-screens-audit-2026-05-28.md` and the master
plan** — both were written before a large execution push and are now stale.
Everything below was verified against current code (file:line), not the older
docs.

## Headline

The plan is ~70% executed. The structural + data layer is done: every screen
exists, is reachable, and is backed by real backend data. **What remains is
mostly §3 design-depth polish** (gauges, dual-baseline contributor lists,
chart axes/selectors, GlowScoreCard heroes, day-picker on detail screens) plus
a handful of **product-decision-gated** items (Inspector demotion, AI-coach
CTAs, Share-PDF, Journal checklist model).

## Already shipped since 2026-05-28 (do NOT redo)

- **Navigation schism resolved** — `app/navigators/MainNavigator.tsx` +
  `AppNavigator.tsx` deleted; `TrendsScreen.tsx` deleted; no dead
  `navigation.navigate("Name")` targets remain in screens.
- **Backend `monitors` contract** — `views.service.ts::buildHomeMonitors`
  emits real `monitors.health` (inRangeCount vs baseline + clinical ranges,
  state, staleSinceMs) and `monitors.stress` (24-bucket `todayStrip`,
  `timeInZone`, zone). (Corrects the agents' stale "monitors empty" claim.)
- **`timeInZone` now in minutes** (was per-sample ~60×) — fixed 2026-05-31.
- **`activityFeed` items** carry `id/startTime/endTime/durationMinutes/heartRateAvg/source`; **pending cards** carry `heartRateMax` — fixed 2026-05-31.
- **`GET /activities/:id`** implemented (hrCurve, 5-zone time, motion) →
  **BoutDetailScreen fully works** (HrChart + ZoneStack + MotionBars render).
- **HealthMonitor RR** now reads `activities.respiratoryRate` (was `"--"`).
- **Health tab rebuilt** to the vitals-grid (status pills + range-fill +
  delta arrows); old orb / floating-dots / "VIEW YOUR PLAN" deadlink gone.
- **SleepDetail date-desync fixed** — `route.params.date` synced to
  `selectedDate` on mount.
- **SleepPlanner** renders backend planner strings (`estimatedSleepHours`,
  `sleepReserveText`, `smartWakeStatusText`, `alarmStatusText`) and disables
  Arm-alarm when the strap is offline.
- **Journal + Insights** screens exist, are backed by `/journal*` endpoints,
  and are reachable (FAB `+`, Settings → Insights, Sleep-detail CTAs).

## Per-screen status vs §4 target

| Screen | § | Status | Top gaps |
|---|---|---|---|
| Home | 4.1 | ✅ Shipped | FAB in tab bar only routes to journal (ComposeButton has full menu) |
| Health tab | 4.2 | 🟡 Partial | dual-baseline (7d/30d) ContributorLists; "What is Healthspan?" explainer + calibration; Cardio-Fitness/Body-Battery trend cards; 8th vital (Recovery 7d avg); chat CTA |
| Stress Monitor | 4.3 | 🟠 Thin | dead info-ⓘ; half-arc gauge; 24h line chart+scrubber; ContributorList; coaching card; vs-7d on time-in-zone |
| Health Monitor | 4.4 | 🟠 Thin | dead info-ⓘ; 5th vital (Skin Temp); GlowScoreCard+sentence; dual-baseline; calibration state; 24h composite |
| Sleep detail | 4.5 | 🟡 Partial | GlowScoreCard hero; sleep-needed-vs-got hatched bar; HR-over-night chart; RR chart; ContributorList 7d/30d; %impact bars in WhyPanel |
| Strain detail | 4.6 | 🟡 Partial | 0-21 zone gauge; ContributorList 7d/30d; HR-zone bars; coach card; Stress sparkline → single point-labelled strain TrendCard |
| HRV detail | 4.7 | 🟡 Partial | D/W/M/Y toggle; personal range bar; drivers list (replaces Recovery sparkline); vs-30d/personal-max |
| Sleep Planner | 4.8 | ✅ Mostly | wake-window slider (vs ± stepper); wind-down nudge |
| Bout detail | — | ✅ Shipped | none |
| Journal | 4.9 | 🟡 Partial | yes/no checklist model; tag search; library 40→~50-80; per-day metrics view |
| Insights | 4.10 | 🟡 Partial | 30/60/90 time selector; metric selector UI; plain-English impact sentences |
| Settings | 4.11 | 🟡 Partial | Coach/AI; Journal customisation; Hide-metrics; Share-PDF; Advanced→Inspector; sync indicator |
| Inspector | 4.12 | 🔴 Not started | still a top-level tab; not demoted to Settings→Advanced |

## Punch-list (prioritized)

> Correction to the 2026-05-28 audit: its "duplicate charts on HRV/Strain"
> finding is **already resolved** (verified in code). HRV renders HRV +
> Recovery sparklines; Strain renders Strain + Stress sparklines — different
> metrics, one chart each, not literal duplicates. Converting the off-topic
> secondary sparkline into the spec'd component is Wave-2 design (below), not
> a correctness bug.

### Wave 1 — cross-cutting correctness (no product decision; do first)
1. **Dead info-ⓘ CTAs** — `StressMonitorScreen.tsx`, `HealthMonitorScreen.tsx`: bare `Info` icon with no `onPress`. Wire to an explainer sheet (rule 3.17/3.11).
2. **Day-picker strip on detail screens** (rule 3.5) — reuse `DateSwitcher`; missing on Stress/Health/HRV/Sleep/Strain detail. (Care: respect each screen's route-param date so we don't reintroduce desync.)

### Wave 2 — per-screen content (data available, no product decision)
3. **Health Monitor**: add Skin Temp 5th vital (`activities.skinTemp`); GlowScoreCard + 1-sentence verdict; calibration state.
4. **Health tab**: dual-baseline 7d/30d ContributorLists; "What is Healthspan?" explainer + calibration; Recovery-7d-avg tile.
5. **Strain detail**: 0-21 zone gauge; ContributorList (avg/max HR, calories, active min); HR-zone bars; Stress sparkline → single point-labelled strain TrendCard.
6. **Sleep detail**: sleep-needed-vs-got hatched bar; HR-over-night chart; ContributorList 7d/30d; GlowScoreCard hero.
7. **HRV detail**: D/W/M/Y toggle; personal-range bar; drivers list (replaces Recovery sparkline); vs-30d/personal-max.
8. **Stress Monitor**: half-arc gauge; ContributorList; coaching card; vs-7d on time-in-zone.

### Wave 3 — product-decision-gated (confirm before building)
9. **Inspector demotion** (§4.12) — IA change. (Q2)
10. **AI-coach "Ask about this" CTAs** (rule 3.10) — across detail screens. (Q4)
11. **Share Health Report PDF** (§4.11). (Q5)
12. **Journal model** — yes/no checklist vs tag-pills, tag-library size. (Q3)
13. **Insights** time/metric selectors + plain-English sentences.

### Backend refinement (future)
14. **Personal ranges** for RR/SpO₂ in `monitors.health` (currently fixed
    clinical ranges 10–20 / ≥95) — §6.3. Not a bug; a precision upgrade.

## Notes for future audits

- The dated docs drift fast. Trust code over docs; re-verify file:line before
  acting.
- Design primitives exist and should be reused: `components/health/GlowScoreCard.tsx`,
  `ContributorList.tsx`, `HealthMonitorCard.tsx`, `HealthspanCard.tsx`,
  `components/home/DateSwitcher` (day-picker), `DayArcRibbon` (timeline).

## Execution progress (2026-05-31, Waves 1–2)

Shipped + verified this session (app `tsc` clean; backend 113 tests pass):
- **Wave 1** — dead info-ⓘ CTAs on Stress/Health Monitor → reusable `InfoSheet`.
- **Health Monitor (§4.4)** — `GlowScoreCard` hero + calibration body; 5th vital (Skin Temp); dual-baseline `ContributorList`s (vs 7d / vs 30d). Backend: skin-temp in the in-range count, `baselineReady` flag, per-vital `vitals[]` (today + trailing 7d/30d) via new `trailingAverageBefore`.
- **Stress Monitor (§4.3)** — `HalfArcGauge` (banded arc + needle) + `ContributorList` (Today avg vs 7d, peak, recovery, sleep) + tap-to-read 24h scrubber on the strip.
- **Strain detail (§4.6)** — 0-21 Borg zone-gauge hero (reuses `HalfArcGauge`) with named bands.
- **Health tab (§4.2)** — dual-baseline `ContributorList`s powered by the new backend `vitals` contract.
- **Sleep detail (§4.5)** — HR-over-night line chart (`hrChart`), needed-vs-got bar (`durationTrend.targetHours`), and sleep-architecture stacked bar (`stageRows`). Frontend-only; data was already supplied.
- Shared `utils/healthVitals.ts` (`buildVitalContributors`) reused by Health Monitor + Health tab.
- **Health tab explainer (§4.2)** — "What is Healthspan?" info-ⓘ → `InfoSheet`.
- **HRV detail (§4.7)** — 1W/1M/3M/1Y trend toggle (`InlineLineChart`), reference frames (vs 7-night / 30-night / personal best), drivers list from the Insights HRV correlations, "Why HRV matters" explainer. Reused `fetchTrendsView`/`fetchInsights`; only backend change was raising the `/views/trends` days cap 90→365. Extracted shared `utils/factorLabels.ts` (`humanizeFactorTag`); WhyPanel refactored onto it.

Still open in Wave 2: Health-tab extra trend cards (Cardio Fitness / Body Battery) and a Stress coaching card — both need NEW pipeline metrics that don't exist yet.

Wave 3 remains product-gated: Inspector demotion, AI-coach CTAs, Share-PDF, Journal model.
