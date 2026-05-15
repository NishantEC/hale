# Home — Health Monitor & Stress Monitor redesign

**Date:** 2026-05-16
**Status:** Spec, awaiting user review
**Scope:** noop Home screen, two new monitor cards + two new detail screens

---

## Goal

Bring noop's Home screen in line with WHOOP / Oura / Ultrahuman / Garmin convention: home shows glance-only verdicts; details live on dedicated screens. Replace today's `StatsHealthSwitcher` (Apple Health toggle, which research showed is on-pattern for aggregator apps but off-pattern for device-first apps) with two compact monitor cards: **Health Monitor** and **Stress Monitor**.

The current Home is unchanged above the monitor row: date strip, three rings (Sleep / Recovery / Strain), and below the monitors stay the Daily Outlook card and Today's Activities timeline.

## Non-goals

- Re-ringing or re-skinning the existing three-ring row (Sleep / Recovery / Strain).
- Building the customizable "My Dashboard" trend-tile grid from WHOOP. Deferred.
- Onboarding the new Stress score signal (assumed: backend already produces a 0–3 score; if not, fallback to "--").
- Replacing the bottom tab bar.

---

## Information architecture

Home, top to bottom:

1. Top strip (date pill + device pill) — **unchanged**
2. Three rings: Sleep / Recovery / Strain — **unchanged**
3. **Two monitor cards side-by-side: Health + Stress** — *new component, replaces `StatsHealthSwitcher`*
4. Daily Outlook (single-line tappable card) — already exists in spirit; tightened copy
5. Today's Activities timeline — **unchanged** (`TodayCard`)

Tapping either monitor card pushes a new screen:
- **HealthMonitorScreen** — list of 4 vital rows with mini-sparklines, each tappable for its own detail (HRV, RHR, RR, SpO₂).
- **StressMonitorScreen** — big number hero + intraday color strip + time-in-zone breakdown.

The Apple Health (HealthKit) data does not live on Home anymore. HealthKit workouts merge into `TodayCard` events (already supported by `buildTodayTape` via `activities.activityFeed`); HealthKit aggregates (steps, kcal) are dropped from Home for now and can be revisited in a Health tab.

---

## Visual primitives

### Home monitor card (`MonitorCard`)

A compact card that takes the same width as half the home content row. Internally:

```
┌────────────────────────────────┐
│  [icon] HEALTH              ›  │   ← header: phosphor icon + caps title + chevron
│                                │
│  ┌──┐                          │
│  │✓ │  Within range           │   ← icon-tile (32×32 rounded square) + verdict line
│  └──┘  4/4 metrics             │   ← + sub-line (count)
└────────────────────────────────┘
```

**Props:**
- `icon`: PhosphorIconName for the section glyph (e.g. `"heartbeat"` / `"brain"`)
- `title`: short uppercase label (e.g. `"HEALTH"`, `"STRESS"`)
- `tileIcon`: optional PhosphorIconName rendered inside the tile (e.g. `"check"`)
- `tileText`: optional short string rendered inside the tile (e.g. `"0.8"`) — mutually exclusive with `tileIcon`
- `tileTint`: status color (green/amber/red/stale)
- `verdict`: line 1 string (e.g. `"Within range"`, `"Calm"`, `"RHR elevated"`, `"Stale"`)
- `subline`: line 2 string (e.g. `"4/4 metrics"`, `"5:21 PM"`)
- `onPress`: navigation handler

**States** (the same component handles all four):
- *ok*: tint green, icon `check`
- *warn*: tint amber, icon `warning`
- *alert*: tint red, icon `warning-octagon`
- *stale*: tint gray, icon `clock-countdown`

This component is the minimal home surface. All four states share the same shape, only icon + color + copy change.

### Health Monitor screen (`HealthMonitorScreen`)

A new stack screen pushed from the Home `HealthMonitorCard`. Structure:

1. Nav bar: `‹ Health Monitor` left, info icon right
2. Hero card: big icon-tile (56×56) + verdict + sub-line ("4 of 4 metrics · last updated 5:21 PM"). Same tone as the monitor card but scaled up.
3. List of 4 vital rows (one card containing four `VitalRow`s separated by dividers):
   - Each row: tinted icon tile + label caps + full name + mini sparkline (60×22pt) + big numeric value + unit + chevron
   - Tap → push existing per-vital detail screen (`HrvDetail`, etc.)
4. Footer caption: "Each metric is within your personal 14-day baseline."

Vitals shown: HRV, RHR, RR, SpO₂. Order is fixed.

### Stress Monitor screen (`StressMonitorScreen`)

A new stack screen pushed from the Home `StressMonitorCard`. Structure:

1. Nav bar: `‹ Stress Monitor` left, info icon right
2. Hero card: big number (64pt, e.g. `0.8 / 3`) + zone label below (`CALM`) + sub ("avg today · last reading 5:21 PM"). Number and label both colored by zone.
3. **Today's color strip** card: "TODAY · 6 AM → NOW" label above, a horizontal 12-cell color strip below (each cell = ~1.5h of waking day at this density), small white "now" tick. Axis: 6 AM / 12 PM / 6 PM / 11 PM.
4. **Time in zone** card: three rows (Calm / Moderate / High), each with colored dot + zone name + range hint ("0 – 0.9") + total time spent.
5. Footer caption: "Based on HRV + heart rate against your 14-day baseline."

The compact color strip from Home (V13's recommendation) is the same primitive used at full width here; only `numCells` and `axisLabels` change.

---

## Color & status semantics

Reuse existing tokens (`LOCAL_THEME.colors`):

| Token | Use |
|---|---|
| `statusGreen` (`#1ed760` dark) | Health "Within range"; Calm in stress shown as `ringHrv` blue, not green, to avoid conflating "calm" with "healthy" |
| `statusAmber` (`#ffa42b` dark) | Health "Warning" + Stress "Moderate" |
| `statusRed` (`#f3727f` dark) | Health "Alert" + Stress "High" |
| `textDim` / a new `statusStale` (`#666`) | Stale data |
| `ringHrv` (`#539df5` dark) | Stress "Calm" (per industry pattern; calm reads as cool/blue, not green) |

Add one new token `statusStale: "#666"` (light + dark variants) for both `LIGHT_COLORS` and `DARK_COLORS` to handle the no-recent-data branch consistently.

## Icon vocabulary

Phosphor (via existing `PhosphorIcon` component). Add missing names to the `PhosphorIcon` ALIAS_MAP + COMPONENT_MAP:

| Slot | Phosphor name | Notes |
|---|---|---|
| Health section header | `heartbeat` | already in map |
| Stress section header | `brain` | add |
| OK tile | `check` (fill) | add |
| Warn tile | `warning` (fill) | add |
| Alert tile | `warning-octagon` (fill) | add |
| Stale tile | `clock-countdown` (fill) | add |
| HRV vital | `wave-sine` | add |
| RHR vital | `heartbeat` | reuse |
| RR vital | `wind` | add |
| SpO₂ vital | `drop` | add |
| Outlook accent | `sparkle` (fill) | add |
| Info on detail nav bar | `info` | add |

Verify each by running the app once after registering — Phosphor exports names map directly to the React component.

---

## Data model

### Home `HomeViewModel` additions

Two new optional fields on `HomeViewModel.activities` (or a sibling block `monitors`):

```ts
interface HealthMonitorSummary {
  state: "ok" | "warn" | "alert" | "stale"
  verdict: string         // "Within range" | "RHR elevated" | "2 alerts" | "Stale"
  inRangeCount: number    // 0–4
  totalMetrics: number    // always 4
  staleSinceMs?: number   // when state === "stale"
}

interface StressMonitorSummary {
  state: "ok" | "warn" | "alert" | "stale"
  score: number | null        // 0–3 (null if stale)
  zone: "Calm" | "Moderate" | "High" | null
  lastReadingAt: string | null  // ISO timestamp
  todayStrip: Array<number | null>  // 12 cells, each 0–3 or null for future
  timeInZone: { calm: number; moderate: number; high: number }  // minutes
}
```

Both summaries are computed server-side (preferred) and threaded through the existing `homeView` cache pipeline. If backend isn't ready in this iteration, compute on-device from existing `homeView.activities.{hrv, restingHr, spo2, stress}` + a stale-window heuristic.

### Component → data wiring

- `HealthMonitorCard` reads `homeView.monitors.health` (or falls back to derived view of HRV/RHR/RR/SpO₂ values + their 14-day baselines).
- `StressMonitorCard` reads `homeView.monitors.stress`; `score == null` → render `stale` state.
- `HealthMonitorScreen` reads the same summary plus the four vital values + sparkline series from existing trend endpoints (`hrvTrend`, etc.).
- `StressMonitorScreen` reads the same summary plus the strip + zone-time aggregates.

---

## Files to add / change

**Add:**
- `apps/app/app/components/home/MonitorCard.tsx` — shared minimal card (handles both Health and Stress)
- `apps/app/app/components/home/StressColorStrip.tsx` — reusable color-strip primitive (used compact in home and wide in detail)
- `apps/app/app/components/home/VitalRow.tsx` — row primitive for the Health detail list
- `apps/app/app/screens/HealthMonitorScreen.tsx` — new detail screen
- `apps/app/app/screens/StressMonitorScreen.tsx` — new detail screen
- `apps/app/src/app/(app)/health-monitor.tsx` — expo-router route stub
- `apps/app/src/app/(app)/stress-monitor.tsx` — expo-router route stub
- `apps/app/app/utils/stressZone.ts` — `scoreToZone(0..3) -> "Calm"|"Moderate"|"High"`, color mappers

**Change:**
- `apps/app/app/screens/HomeScreen.tsx` — replace `<StatsHealthSwitcher>` with `<View><MonitorCard health /><MonitorCard stress /></View>`. Wire `onPress` to push the two new screens via `navigateTo`.
- `apps/app/app/components/PhosphorIcon.tsx` — register the new icon names.
- `apps/app/app/utils/localTheme.ts` — add `statusStale`.
- `apps/app/(app)/_layout.tsx` (expo-router Stack) — register the two new routes.
- `apps/app/app/navigators/AppNavigator.tsx` (legacy) — register the two new routes (mirrors the existing pattern for `SleepDetail`, `HrvDetail`, etc.).
- `apps/app/app/services/api/noopClient.ts` — extend `HomeViewModel` interface with `monitors` shape.
- `apps/app/app/context/DashboardContext.tsx` — populate `monitors` from existing fields or backend response.

**Remove (eventually):**
- `apps/app/app/components/home/StatsHealthSwitcher.tsx` — no consumers after the change.
- `apps/app/app/components/home/MetricsBar.tsx` — no consumers (data moves into HealthMonitorScreen rows).

Keep `AppleHealthCard.tsx` for now — it can be reused on a future Health tab or settings page; just not on Home.

---

## Interaction & motion

- Monitor card press: subtle 0.95 scale on press, restore on release (existing `Pressable` style). 150ms.
- Card → detail screen push: native stack push (`react-navigation`), default slide animation.
- Color strip animates a left-to-right fill-in on first mount of the detail screen (200ms ease-out). On Home, render fully filled (compact, no entrance flourish).
- Time-in-zone numbers tick up using existing `react-native-reanimated` count-up if available; otherwise render statically.

## Accessibility

- Each monitor card: `accessibilityRole="button"`, `accessibilityLabel={`${title} monitor, ${verdict}, ${subline}`}`.
- Status color always paired with a different Phosphor icon (check / warning / warning-octagon / clock-countdown), so meaning survives color-blind perception.
- Tabular numerals (`fontVariant: ["tabular-nums"]`) on every metric to prevent jitter when values change.
- Respect `prefers-reduced-motion` — skip the strip fill-in animation when set.

## Testing

- Unit: `stressZone.ts` mapping function (small).
- Snapshot: `MonitorCard` in each of four states (ok / warn / alert / stale) — both Health and Stress variants.
- Snapshot: `HealthMonitorScreen` and `StressMonitorScreen` with mock summary data.
- No E2E; the screens are read-only and visual.

---

## Open questions

- (None blocking — all design choices are decided.) The score scale is **0–3** to match WHOOP because the user has been comparing to it consistently. If we later prefer 0–100 (Garmin/Fitbit/Ultrahuman), only the `score`/`unit` rendering changes; the zone bucketing and color strip stay.
- Backend may not produce a Stress score yet. If so, the home card and detail screen render in the `stale` state with `"--"` and a "Set up Stress Monitor" CTA on the detail screen.
- Whether to keep HealthKit Apple Health data on Home at all (currently planned to drop). Confirmed during brainstorm — drop it from Home; HealthKit workouts already merge into the `TodayCard` timeline via existing `activityFeed`.
