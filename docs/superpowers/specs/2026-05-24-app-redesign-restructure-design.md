# noop — app redesign & restructure (2026-05-24)

## Problem

Today noop has 4 bottom tabs (Home, Health, Inspector, Settings) and 13 stack routes. Three issues:

1. **Inspector occupies a primary tab.** BLE diagnostics is a power/dev tool. A first-class tab is too expensive for it.
2. **Health/HRV/Stress/Healthspan are siloed.** They live across `(tabs)/health`, `hrv-detail`, `stress-monitor`, `health-monitor`. Users have to bounce between routes to read related signals.
3. **No coaching surface.** Journal, sleep planner, alarm, and recommendations are scattered as drill-ins. Nothing answers "what should I do today?" — which is the question a recovery-based wearable should answer first.

The existing Spotify-inspired design system (`apps/app/DESIGN.md`) is solid and stays. The change is to information architecture and per-metric colour, not to type, surface scale, or pill geometry.

## Goals

- Collapse 13 routes → 8.
- Replace Health + Inspector + Settings tabs with **Sleep**, **Body**, **Coach**.
- Move Inspector + Device + account settings under a single Profile sheet reachable from any tab.
- Introduce one daily "prescription" surface (Coach) that wraps journal, sleep planner, and recommendations.
- Re-assign the existing single-brand-accent slot in `DESIGN.md` to a per-metric semantic palette.

## Non-goals

- No rewrite of the BLE stack, sync engine, or persistence layer.
- No new metrics. Only restructure of what's already collected.
- No light theme work in this pass.
- No backend API changes.

## Information architecture

### Current

```
Tabs:    Home    Health    Inspector    Settings
Routes:  home, home-metric, home-details
         sleep-detail, sleep-planner
         hrv-detail, stress-monitor, health-monitor
         strain-activity, bout-detail
         journal-entry, journal-history
         device-settings, dev-activity-strip
```

### Proposed

```
Tabs:    Today    Sleep    Body    Coach
Profile sheet (modal from any tab): Account, Device, Inspector, Developer
```

Route mapping:

| Today route        | Source                                          |
| ------------------ | ----------------------------------------------- |
| `/today`           | current `home`                                  |
| `/today/activity/:id` | current `strain-activity` + `bout-detail`    |
| `/today/metric/:id` | current `home-metric` + `home-details`         |

| Sleep route        | Source                                          |
| ------------------ | ----------------------------------------------- |
| `/sleep`           | current `sleep-detail` (default = last night)   |
| `/sleep/planner`   | current `sleep-planner`                         |

| Body route         | Source                                          |
| ------------------ | ----------------------------------------------- |
| `/body`            | new — overview of HRV, RHR, stress, healthspan  |
| `/body/hrv`        | current `hrv-detail`                            |
| `/body/stress`     | current `stress-monitor`                        |
| `/body/healthspan` | current `health-monitor`                        |

| Coach route        | Source                                          |
| ------------------ | ----------------------------------------------- |
| `/coach`           | new — daily prescription + plan + journal entry |
| `/coach/journal`   | current `journal-history` + `journal-entry`     |

| Profile sheet      | Source                                          |
| ------------------ | ----------------------------------------------- |
| `/profile`         | current `settings`                              |
| `/profile/device`  | current `device-settings`                       |
| `/profile/inspector` | current `inspector` tab                       |
| `/profile/dev-strip` | current `dev-activity-strip`                  |

## Design system delta

Existing `DESIGN.md` keeps:

- Dark charcoal surface scale (`#0A0A0B` → `#26272C` — five stops, narrow).
- Bold/regular binary type with `-0.03em` letter-tightening on display sizes.
- Pill controls (radius 999) for primary actions; 14–20 radius for cards.

Changes:

- **Drop singular brand accent.** Replace Spotify Green slot with a metric palette:
  - Recovery: `#FFD449` (yellow), with `#FF6B6B` for low / `#4CD964` for high
  - Strain: `#3FA9F5` (blue)
  - Sleep: `#B084EB` (purple)
  - HRV: `#5DD5C4` (teal)
  - Stress: `#F37272` (red)
- **Rule:** each card uses exactly one metric colour, drawn from the metric being measured. Cards do not mix accents.
- **Numbers are the brand.** 22–64 px display weights with `-0.03em`, no decoration.

## Screen-by-screen

### Today
Hero recovery gauge ring (Whoop pattern, 110 px). Below the ring: HRV / RHR / SpO₂ row with delta vs 7-day average. Two-up sparkline cards for Day Strain and Sleep. Activity list (replaces `strain-activity` tab). Floating `+` for new activity / journal.

### Sleep
Last night by default. Hypnogram (large) → score breakdown ("why you scored 82" with positive/negative attribution rows) → smart-wake config row. Planner accessible via clock icon (top-right). Replaces the current 2 routes (`sleep-detail` + `sleep-planner`).

### Body
Long-term trends home. Two large trend cards on top (HRV, RHR) with selectable D/W/M/6M/Y range (Apple Health pattern). Two-up small cards for Stress and Healthspan (noop Age). Below: timeline of notable events (HRV trending up, RHR plateau, etc.). Tapping a trend opens the existing detail screen.

### Coach
Prescription hero (purple) — single recommendation for today. Time-bucketed plan list (mobility, walk, wind-down). Journal CTA + recent journal entries. Replaces the journal flows as a daily surface, not a settings-y archive.

### Profile (sheet)
Modal sheet from avatar in top-right of any tab. Sections: identity, device card (live strap status), account settings, developer (Inspector + dev-activity-strip).

## Components to introduce / merge

- **`MetricGauge`** — replaces hand-rolled recovery ring on Home and the gauge in HRV detail.
- **`TrendCard`** — Apple Health–style chart card with range selector. Used in Body and Sleep.
- **`PrescriptionCard`** — purple coach hero, used only on Coach.
- **`PlanRow`** — time + activity + icon row.
- **`AttributionRow`** — `↑/↓` + label + delta. Used on Sleep ("why you scored X") and later on Today.

Removed/merged:

- `MonitorCard` (currently used for Stress/Health monitors on Home) — folded into Body two-up cards.
- `MetricRingsRow` — superseded by single `MetricGauge` (recovery only) + sparkline two-up.

## Migration strategy

Three slices that can ship independently:

1. **IA slice.** Add new `(tabs)` layout with Today / Sleep / Body / Coach; keep old routes as redirects. Inspector moves to Profile sheet. ~2 days.
2. **Body merge.** Build `/body` overview + retire `health-monitor` + `stress-monitor` + `hrv-detail` as standalone tabs (still reachable as detail screens). ~3 days.
3. **Coach surface.** Build prescription + plan + journal hub. ~3 days.

## Risks

- **Habit shock.** Users who navigate by muscle memory will reach for Health and find Body. Mitigation: keep route aliases for one release and show a one-time "we moved things" sheet.
- **Inspector regression.** Power users rely on Inspector being one tap away. Mitigation: avatar-tap → sheet → Inspector is 2 taps (was 1). Add a long-press shortcut on the avatar to jump straight to Inspector.
- **Per-metric colour drift.** Without discipline the palette will leak into decoration. Mitigation: add a lint rule (or PR-review checklist) for accent colours used outside their metric module.

## Open questions

(None — moving forward with the calls above. Adjust at review.)

## Acceptance

- Tabs render in this order: Today, Sleep, Body, Coach.
- `/inspector` no longer in `(tabs)`; reachable only through Profile sheet.
- `MetricGauge`, `TrendCard`, `PrescriptionCard`, `PlanRow`, `AttributionRow` exist in `apps/app/app/components/`.
- Old route paths return 301-equivalent redirects through `expo-router` for one release cycle.
- Mockups in `.superpowers/brainstorm/34457-1779567910/content/redesign-showcase.html` reflect the shipped layouts within reasonable fidelity.
