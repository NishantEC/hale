# noop Healthspan — Design Spec

**Status:** approved (visual mockup, structural layout, location)
**Roadmap:** Phase 5 #16 — noop Healthspan v0
**Reference:** [`research/whoop-features-deep-dive.md` §1](../../../research/whoop-features-deep-dive.md), reference screenshots from WHOOP Healthspan UI

## Goal

Compute and surface a "noop Age" + "Pace of Aging" with per-metric impact callouts so the user can see which behaviors are aging them faster or slower, modeled on WHOOP's published-but-not-formula-disclosed Healthspan feature. Ship in the rewritten **Health** tab (renamed from Trends).

## Non-goals (v0)

- The full nine WHOOP inputs (Lean Body Mass needs body composition we can't compute from strap alone).
- Marketing-grade orb animation. v0 uses a CSS radial gradient + static particle pattern; we can upgrade to a Skia/Canvas particle system later.
- Backwards-compat: the old TrendsScreen will be replaced wholesale.

## User-facing scope

### Tab rename

`Trends` tab → `Health` tab. The existing 8-chart TrendsScreen is dropped; its underlying view-model trends are still served by the API but presented inside the new HealthScreen sections.

### Health screen — top-to-bottom

1. **Header** — `HEALTHSPAN`, subtitle "Next update in N days" (weekly cadence; refreshes every Monday or first-day-of-week).
2. **Week range strip** — `‹  MAY 4 – MAY 10  ›` chevrons navigate prior weeks.
3. **Particle orb** — radial gradient + static dot pattern in CSS for v0. Color tokens:
   - **green** when `noopAge ≤ chronologicalAge` (younger)
   - **amber** when `noopAge > chronologicalAge` (older)
4. **Centered inside orb:** `noopAge` (one decimal) + `"NOOP AGE"` label + delta line ("4.7 years younger" / "10.0 years older") in matching color.
5. **Pace of Aging slider** — `-1.0x` to `3.0x` axis with `1.0x` center anchor. Marker shows current value (e.g. `0.8x`). "Slow ◯" and "Fast ◯" endcaps.
6. **Coaching tooltip** — title + 2-3 sentence body + `VIEW YOUR PLAN →` link. Title chosen by Pace bucket:
   - Pace ≤ 0.9 → "Steady and Healthy"
   - 0.9 < Pace ≤ 1.1 → "On Track"
   - 1.1 < Pace ≤ 1.5 → "Worth Watching"
   - Pace > 1.5 → "Small Steps, Big Impact"
7. **Sections** — Sleep / Strain / Fitness. Each section has a `▼ 6 Month avg.` / `▲ 30 Day avg.` toggle pair at the right.
8. **Metric cards** within each section — see "Metric card" structure below.
9. **Trend View section** at the bottom — line chart of Pace of Aging over the last 12 weeks.

### Metric card structure

```
LABEL                                                              ∧/∨
[ orange ─── yellow ─── green gradient bar ────── ]      −X.X
                ▼ 6mo                                     years
                       ▲ 30d
 axis-lo                                          axis-hi
```

- Bar gradient direction depends on metric: **sleep/fitness** (higher = better, green on the right); **resp/RHR** (lower = better, green on the left).
- Two markers: ▼ pointing down with the 6-month average, ▲ pointing up with the 30-day average.
- Right-side impact: signed delta-in-years, color-coded:
  - negative (younger) → green
  - positive (older) → amber
  - |value| < 0.1 → grey "neutral"
- Chevron `∧`/`∨` indicates the card's expanded/collapsed state. v0 ships everything expanded.

## Inputs we have & will ship

| Input | Section | Source today | Range we'll use | Direction |
|---|---|---|---|---|
| Sleep Consistency | Sleep | `daily_metrics.sleepConsistencyScore` | 40–100% | higher = better |
| Hours of Sleep | Sleep | `sleep_detections.durationHours` (30d mean) | 5–8h | higher = better |
| Time in HR Zones 1-3 (weekly) | Strain | derived from epoch HR + HR zones | 0–3h | higher = better |
| Time in HR Zones 4-5 (weekly) | Strain | derived from epoch HR | 0–1h | higher = better |
| Steps (daily 30d avg) | Strain | `healthkit_daily_summaries.steps` | 0–16k | higher = better |
| Strength Activity Time (weekly) | Strain | `activity_detections` filtered to strength | 0–5h | higher = better |
| VO₂ Max | Fitness | `computeVo2MaxUth(rhr, maxHR)` | 15–70 mL/kg/min | higher = better |
| RHR | Fitness | `night_features.restingHeartRate` (30d mean) | 40–80 bpm | lower = better |

**Deferred to v1:** Lean Body Mass (requires body comp), Time in HR Zones 1-3 (precise zone math needs maxHR which is still inferred), Strength Activity (needs the auto-detect upgrade in #11).

## Hazard model — how impacts are computed

For each metric we publish a piecewise-linear hazard curve mapping the metric value → impact-in-years, anchored on Gompertz-style mortality literature where possible:

```
impact_years = f(metric_value, chronological_age, sex)
```

For v0 we use a **simple linear** form with published per-metric slopes from the literature:

```
impact_years = slope_metric × (metric_value - reference_value) × age_factor
```

Reference values come from population norms (e.g. RHR reference = 65 bpm, VO₂ Max reference = `expected_vo2max_for_age(age, sex)`). Slopes are taken from peer-reviewed papers where available (e.g. each 5 bpm RHR drop ≈ 0.5 years of biological age reduction per Cooper Institute longitudinal cohort), otherwise calibrated against WHOOP's published worked examples in their blog.

**Aggregate:**
```
noopAge = chronologicalAge + sum(per-metric impacts)
paceOfAging = (noopAge_thisWeek - noopAge_priorWeek) / weeks  -- normalized to 1.0x = aging at chronological rate
```

Compute weekly (refresh on first day of each week).

### Required user input

We need **chronological age**. Add a `dateOfBirth` field to the user profile (settings screen entry), default null. When null, the Healthspan screen shows an empty state asking the user to set it.

## Data model

New table `health_assessments`:
```
id              uuid pk
userId          varchar
weekStart       date            -- Monday of the week
chronologicalAge float
noopAge         float
paceOfAging     float
contributors    jsonb           -- {metric → {value, impactYears, sixMoAvg, thirtyDayAvg}}
coachingTitle   varchar
coachingBody    text
generatedAt     timestamptz
```

Indexed `(userId, weekStart)` unique.

## Backend changes

1. New `health-assessment.entity.ts` (TypeORM).
2. New migration `1779000000000-HealthAssessments.ts`.
3. New `health-assessment.service.ts` with:
   - `computeWeeklyHealthAssessment(userId, weekStart)` — pulls 6-month + 30-day windows of features, computes impacts, persists.
   - `getHealthAssessment(userId, weekStart)` — read.
4. Hazard model in `apps/backend/src/processing/healthspan.ts`:
   - `referenceValueFor(metric, age, sex)` — population norms.
   - `impactYearsFor(metric, value, age, sex)` — piecewise-linear hazard.
   - `paceOfAgingFrom(weeklyAges)` — derivative.
5. `/views/health` endpoint that returns the weekly assessment for the selected week.
6. Triggered on each pipeline run if a week boundary has crossed; otherwise served from cache.
7. `dateOfBirth` added to the `users` table via migration.

## Mobile changes

1. Bottom-nav: rename `Trends` → `Health`. Tab icon stays similar.
2. New `HealthScreen.tsx` replaces `TrendsScreen.tsx`. Keep `TrendsScreen.tsx` file path for git history but rewrite its body.
3. New components:
   - `<HealthspanOrb age={…} state="younger|older|neutral" />` — CSS-only orb in v0.
   - `<PaceOfAgingSlider value={0.8} />` — horizontal slider with marker.
   - `<CoachingTooltip title body link />`.
   - `<HealthSection title items={…} />`.
   - `<HealthMetricBar label value sixMoAvg thirtyDayAvg axisLo axisHi impactYears direction />`.
   - `<HealthTrendChart points={…} />` — Pace over 12 weeks.
4. Date-of-birth entry in Settings (new row).
5. Reuse the `DateSwitcher` for the week-range navigation.

## Validation & accuracy

We **do not** claim medical accuracy. Cite WHOOP's own caveat language. Footer text: "Estimated from your wearable data using published longevity research. Not a medical assessment."

We should validate v0 by:
- Reproducing the Cooper Institute RHR-vs-mortality curves for two test users (synthetic profiles).
- Checking that `paceOfAging ≈ 1.0x` for a user matching population averages.
- Checking sign of impact moves correctly when we inject a fake change in each input.

## Phasing (each ~ 1 day)

- **A — Backend foundation:** entity + migration + minimal service that returns a stubbed assessment (chronological age only). `/views/health` ships.
- **B — Hazard model:** per-metric reference values + impact functions. Real assessments persisted.
- **C — Mobile shell:** rename tab, replace screen, ship orb + age number + Pace slider with **stubbed data** to verify wiring.
- **D — Mobile sections:** metric bars + section toggles + trend chart.
- **E — Birthdate input + empty state:** Settings entry, null-state handling.
- **F — Coaching copy + polish:** tone buckets, "next update in N days", animation polish.

Each phase is its own commit, each can deploy independently. v0 acceptable at end of E.

## Risks

- **Hazard slopes are educated guesses.** WHOOP doesn't publish them. We anchor to the Cooper / Topol literature where possible and add a "v0 — calibration ongoing" footer until we have at least 100 nights of self-collected data to back-test.
- **Pace of Aging on a fresh account** is undefined for the first 4 weeks. Show "—" until 4 weeks of history.
- **Date of birth is PII** — keep server-side only, never log, never include in error reports.
