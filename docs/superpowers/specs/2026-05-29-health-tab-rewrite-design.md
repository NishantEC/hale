# Health tab rewrite — 2026-05-29

A complete rewrite of the Health tab, pivoting from the "Healthspan / noopAge" hero to a vitals-first Health Monitor surface. Demotes the noopAge screen to a sub-route at `/healthspan`.

References:
- `docs/secondary-screens-master-plan-2026-05-28.md` §4.2 — target state
- `docs/competitor-screens-research-2026-05-28.md` — Whoop/Bevel/Ultrahuman patterns
- `docs/current-secondary-screens-audit-2026-05-28.md` — line-anchored audit of the current `HealthScreen.tsx`

## 1. Why now

The current Health tab is built around the "noopAge / Pace of Aging" mental model with a radial-gradient orb that:
- Doesn't match any other surface (the orb appears nowhere else)
- Shows a "Pace of Aging compares this week to last" caption that's hard to act on
- Renders a floating-dots "Trend View" with no axes, gridlines, or labels
- Has a `VIEW YOUR PLAN →` link that goes nowhere

Per master plan §1.2, the `HomeViewModel.monitors` field — the data backbone for a real Health Monitor — was missing from the backend. This session's earlier work populated it. The Health tab can now consume real monitor data.

Healthspan is a worthwhile concept but doesn't belong as the Health tab's primary hero. It moves to a sub-screen.

## 2. Target structure

New Health tab top-to-bottom:

1. **Day-picker strip** — same `DateSwitcher` used on Home (rule 3.5). Drives the data fetch by `selectedDate` from `DashboardContext`.
2. **Hero `GlowScoreCard`** — "Health Monitor" headline · "N of 5 vitals in range" hero number · verdict word (Optimal / Fair / Pay attention) · 1-2 sentence personalised explanation. Tap → `HealthMonitorScreen` (existing detail route, gets the deeper rebuild in a follow-up session).
3. **Vitals grid (`GlowTile` × 8)** — three-column grid. Each tile shows: metric label · today value with unit · sparkline · 7d delta arrow. Tap is a no-op for v1 (per-tile detail screens are a follow-up).
   - Row 1: RHR · HRV · RR
   - Row 2: SpO₂ · Skin Temp · Sleep
   - Row 3: Recovery 7d · Stress today · _(empty cell for grid balance)_
4. **Dual-baseline `ContributorList` × 2** — "VS LAST 7 DAYS" and "VS LAST 30 DAYS" sections. Each: 3-5 `NumBlock` rows (HRV, RHR, RR, Sleep, Recovery). Each row: label · today value · baseline value · delta arrow with sign. (Rule 3.3 — Whoop's strongest pattern.)
5. **Healthspan sub-card** — small horizontal card: "Healthspan · Noop age 27.1 · -0.4 yr". Taps into `/healthspan` (new route). Replaces the orb hero with a discoverable but secondary entry point.
6. **Trend cards** — point-labelled bar charts at the bottom:
   - Pace of Aging — current value + 4-week sparkline
   - Cardio Fitness (vo2Max) — current + 8-week sparkline
   - Each is a `TrendCard` from the locked design vocabulary

## 3. New `HealthspanDetailScreen` (sub-route)

At `/healthspan`. Receives the bulk of the **current** `HealthScreen.tsx` content, repackaged behind a screen header:
- The orb hero (re-themed against `LOCAL_THEME` only — no other change)
- `PaceBlock` — read-only marker against 1.0×
- `CoachingBlock` — the existing title/body (drop the dead `VIEW YOUR PLAN` link)
- `Sections` — contributor breakdown
- `TrendView` — keep as-is for now; the floating-dots problem is acknowledged but out of scope here (separate session)

## 4. Component touchpoints

### New components
- `apps/app/app/components/health/GlowScoreCard.tsx` — hero per master plan §2 vocabulary. Reused by future detail screens too.
- `apps/app/app/components/health/GlowTile.tsx` — square mini-card for the vitals grid.
- `apps/app/app/components/health/NumBlock.tsx` — single contributor row.
- `apps/app/app/components/health/ContributorList.tsx` — section with header + list of `NumBlock`s.
- `apps/app/app/components/health/TrendCard.tsx` — title + sparkline + caption + chevron.
- `apps/app/app/components/health/HealthspanCard.tsx` — the demoted Healthspan entry-point card.

### Edited
- `apps/app/app/screens/HealthScreen.tsx` — **full rewrite**. Drops orb, PaceBlock, CoachingBlock, Sections, TrendView from this file.
- `apps/app/app/screens/HealthspanDetailScreen.tsx` — **new file**, absorbs the old HealthScreen content.
- `apps/app/src/app/(app)/healthspan.tsx` — new route file.
- `apps/app/src/app/(app)/_layout.tsx` — register the new screen.
- `apps/backend/src/views/views.service.ts` — add `respiratoryRate` to the `activities` object in `getHomeView`.
- `apps/app/app/services/api/noopClient.ts` — add `respiratoryRate: number | null` to `HomeViewModel.activities`.

### Data flow
- Health tab reads from `useDashboard()` (the same `homeView` that Home uses). Drops `fetchHealthView` as the primary data source for the tab.
- `HealthspanDetailScreen` keeps using `fetchHealthView` (the existing endpoint stays — it powers the sub-screen).

## 5. Backend changes

Single backend change:

```ts
// apps/backend/src/views/views.service.ts — in getHomeView's activities block
respiratoryRate: selectedFeature?.respiratoryRate ?? null,
```

And the client type:

```ts
// apps/app/app/services/api/noopClient.ts — HomeViewModel.activities
respiratoryRate: number | null;
```

That's it. The `monitors` block from this session's earlier work covers Health Monitor; the rings cover Recovery / Sleep / Strain; daily metrics cover SpO₂ / Skin Temp.

## 6. Vitals tile data sources

| Tile | Field | Fallback when null |
|---|---|---|
| RHR | `activities.baselineRhr` (today's RHR) | `--` |
| HRV | `activities.hrvMs` | `--` |
| RR | `activities.respiratoryRate` (new) | `--` |
| SpO₂ | `activities.spo2` | `--` |
| Skin Temp | `activities.skinTemp` + `skinTempDelta` | `--` |
| Sleep | `rings.sleep.numericValue` (sleep score) | `--` |
| Recovery 7d | `rings.recovery.sevenDayAverage` | `--` |
| Stress today | `monitors.stress.score` | `--` |

Sparkline data for tiles is **not** wired in v1 — the sparkline visual is a 7-day trend, but no per-tile 7-day series exists on the home view-model. The tile shows the value + the 7d delta arrow only. Sparklines added in a follow-up that adds per-metric series to `HomeViewModel`.

## 7. Tests

- `apps/backend/src/views/views.service.spec.ts` — extend the "populated home view shape" test to assert `view.activities.respiratoryRate` is present (null or a number).
- App-side: snapshot test for the new `HealthScreen` rendering would be nice but is **out of scope** — the existing screen has no test either. Verify by running on device.

## 8. Rollout / rollback

- All changes land in one commit.
- Rollback = `git revert` of that commit. Old `HealthScreen.tsx` is preserved in git history; the new `HealthspanDetailScreen` becomes orphan after revert.
- No feature flag — the rewrite is the default Health tab on next launch.

## 9. Out of scope (deferred to follow-up sessions)

- Per-tile detail screens (8 new routes). Tile taps are no-ops in v1.
- "Ask about your health" chat CTA (rule 3.10 — AI coach phase per master plan §9).
- "What is Health Monitor?" explainer modal.
- Replacing the floating-dots TrendView inside `HealthspanDetailScreen` (separate session — it's not on the main Health tab anymore so it's lower priority).
- Sparkline series on vitals tiles (needs per-metric 7-day series on backend).
- Cardio Fitness / vo2Max trend card if no data path exists today.

## 10. Implementation order this session

1. Backend: add `respiratoryRate` to `activities` + extend the spec assertion.
2. App types: add `respiratoryRate` to `HomeViewModel.activities`.
3. New components: `GlowScoreCard`, `GlowTile`, `NumBlock`, `ContributorList`, `TrendCard`, `HealthspanCard`.
4. New screen: `HealthspanDetailScreen.tsx` + route file + layout registration.
5. Rewrite: `HealthScreen.tsx` using the new components.
6. Wire Day-picker strip from `DashboardContext`.
7. Smoke-test typecheck. Verify on device after install.
