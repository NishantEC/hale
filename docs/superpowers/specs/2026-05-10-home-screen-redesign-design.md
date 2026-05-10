# Home Screen Redesign — Ring · Stats · Tape

## Problem

The current HomeScreen has accumulated three competing visual systems and an unclear hierarchy:

- A `PrimaryMetricsList` row pairing a large Recovery ring with stacked Sleep / Strain glass pills.
- A "My Day" header + 64pt floating-orange `+` button + horizontal `JournalChips` scroll.
- A `HomeActionRow` list with three navigation entries ("Your day in review", "Today's activities", "Journal history").

The ring is the most useful element, but it gets diluted. Sleep and Strain are demoted to small pills. The action rows duplicate destinations already reachable from tabs/screens. Journal entries appear twice (chip scroll + journal-history row). There's no chronological view of the day's events even though the underlying data exists.

## Decision: F3 — Ring · Stats · Tape

The home screen becomes a single vertical scroll with three regions:

1. **Hero ring** — Recovery, large and centered. The first thing the eye lands on.
2. **2×2 stat grid** — Sleep, Strain, HRV, Journal as four color-tinted tiles. At-a-glance peer metrics.
3. **Today's Tape** — chronological list of today's events (sleep wake-up, recovery score, journal entries, workouts, vital checks). Past events only — no forecast row.

A single floating `+` button (FAB) in the bottom-right opens the journal entry modal.

## Visual Layout (top → bottom)

```
┌─────────────────────────────────────┐
│  ‹  Today  ›              ⌚ 87%    │  Top strip (existing DateSwitcher + DevicePill)
│                                     │
│            ╭─────────╮              │
│           │           │             │  Hero ring (160×160, 8pt stroke, green)
│           │   87%     │             │    "87%" 44pt 900, "RECOVERY" 8pt eyebrow
│           │ RECOVERY  │             │
│            ╰─────────╯              │
│                                     │
│           Push hard.                │  Verdict line (centered, 13pt 700)
│       HRV ↑ 8%. Sleep on target.    │  Sub (10pt textDim)
│                                     │
│  STATS                              │  Eyebrow (8pt 700 uppercase 1.4 tracking)
│  ┌──────────┐  ┌──────────┐         │
│  │ SLEEP    │  │ STRAIN   │         │  Stat tiles, each tinted with its
│  │ 7h 23m   │  │ 12.4     │         │  metric color via a 60×60 corner halo
│  │ ↑ 12m    │  │ build    │         │
│  └──────────┘  └──────────┘         │
│  ┌──────────┐  ┌──────────┐         │
│  │ HRV      │  │ JOURNAL  │         │
│  │ 58       │  │ 3        │         │
│  │ ms       │  │ entries  │         │
│  └──────────┘  └──────────┘         │
│                                     │
│  TODAY'S TAPE                       │  Eyebrow
│  06:18  •  Woke up · 7h 23m         │  Time + colored dot + title + desc
│  06:30  •  Recovery scored 87%      │
│  07:02  ●  Coffee                   │  (orange dot for journal coffee)
│  09:45  •  5K run · Strain 9.2      │  (green dot for workout)
│  12:30  •  Lunch logged             │
│  14:30  •  HRV check · 58 ms        │
│                                     │
│                                ╭──╮ │  FAB: 56×56 circular, brand-orange,
│                                │+ │ │  bottom-right, 16px from edges,
│                                ╰──╯ │  sits 88px above the tab bar
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Home    Trends    Settings │   │  Tab bar (existing)
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Components

### `RecoveryHero`
**Props**: `value: number` (0–1 progress), `label: string` (the percentage text), `verdict: string`, `verdictDetail: string`, `onPress?: () => void`.

Renders a 160×160 `CircularProgress` (existing component) with green stroke, the value as a 44pt-900 number centered inside, "RECOVERY" eyebrow below. Verdict + verdict-detail text follow under the ring, centered.

Tap → navigates to `home-metric` route with `{ metric: "recovery" }`.

#### Verdict line copy

The verdict and verdict-detail strings are computed in HomeScreen from the recovery score using deterministic buckets (no LLM, no remote call):

| Recovery % | Verdict (bold) | Verdict detail (dim) |
|------------|----------------|----------------------|
| ≥ 67 | "Push hard." | "Body is primed. HRV trending up." |
| 34–66 | "Train moderately." | "Yellow zone — listen to your body." |
| < 34 | "Take it easy." | "Recovery is low. Consider rest or active recovery." |
| no data | "Awaiting data." | "Sync your strap to see today's recovery." |

Detail strings are static per bucket in v1 — they do not splice in real HRV deltas or sleep numbers. A follow-up can make them data-driven.

### `StatGrid`
2×2 grid of `StatTile`. Renders four tiles with consistent prop shape. The grid is the only consumer.

### `StatTile`
**Props**: `label: string`, `value: string`, `desc?: string`, `tint: string` (hex), `onPress?: () => void`.

Flat surface (`surfaceCard` background), 12pt corner radius, 12px padding. A 60×60 radial-gradient `View` in the top-right corner fades from `tint @ 0.25 alpha` to transparent. The label is 7pt 700 uppercase 1.4 tracking; value is 20pt 900 letter-spacing -0.5 with `tabular-nums`; desc is 8pt textDim.

Each tile has its own tint:

| Tile | Tint | Source |
|------|------|--------|
| Sleep | `#A78BFA` (purple) | `LOCAL_THEME.colors.ringSleep` |
| Strain | `#ffa42b` (amber) | `LOCAL_THEME.colors.ringStrain` |
| HRV | `#539df5` (announcement blue) | new key `colors.ringHrv` |
| Journal | `#C76542` (brand orange) | `LOCAL_THEME.colors.tint` |

Tap routes:
- Sleep → `sleep-detail` with `{ date: selectedDate }`
- Strain → `strain-activity`
- HRV → `home-metric` with `{ metric: "recovery" }` (HRV history lives there for now)
- Journal → `journal-history`

### `TodayTape`
**Props**: `events: TapeEvent[]`.

Renders a `<View>` with one `TapeRow` per event, separated by hairline dividers (`StyleSheet.hairlineWidth`, `colors.divider`, indented past the dot column). No section header inside the component — the eyebrow "TODAY'S TAPE" is rendered by the home screen.

### `TapeRow`
**Props**: `time: string` (HH:MM), `dotColor: string`, `title: string`, `desc?: string`, `onPress?: () => void`.

```
┌─────────────────────────────────────┐
│ 06:18 │ ● │ Woke up                 │
│       │   │ 7h 23m · Restorative    │
└─────────────────────────────────────┘
```

- Time column: 38px wide, right-edge cleared, 9pt 700 letter-spacing 0.5 `textMuted`, `tabular-nums`.
- Dot column: 7×7 rounded square, color from `dotColor`.
- Body: title 12pt 600, desc 9pt textDim. `numberOfLines: 1` on title; `numberOfLines: 2` on desc.

Tap → routes per event type (defined in the combiner output).

### `HomeFab`
**Props**: `onPress: () => void`.

56×56 circular Pressable. Background `colors.tint`. Border radius 9999. Heavy shadow `rgba(0,0,0,0.5) 0 8 16` on iOS. White `+` icon at 24px. Positioned absolute, `right: 16, bottom: 88` (above tab bar).

Tap → `journal-entry` route (existing modal).

## Data Sources

All from existing `useDashboard()` + `fetchJournalEntries(selectedDate)`. No backend changes.

### Tape combiner — `app/utils/buildTodayTape.ts` (new)

```ts
export type TapeEvent = {
  time: string                  // "06:18"
  ts: number                    // ms epoch — for sorting only
  title: string
  desc?: string
  dotColor: string              // resolved from event type
  onPress?: () => void          // resolved by HomeScreen
  type: "sleep" | "recovery" | "journal" | "workout" | "vital"
}

export function buildTodayTape(input: {
  homeView: HomeView | null
  journalEntries: JournalEntryResponse[]
  liveDeviceState: LiveDeviceState
  now: number                   // for filtering: only events with ts <= now
  colors: typeof LOCAL_THEME.colors
}): TapeEvent[]
```

Sources:

| Event | Source | Title | Desc |
|-------|--------|-------|------|
| `sleep` (wake-up) | `homeView.cards.sleep.endTimestamp` | "Woke up" | `"{duration} · {quality}"` |
| `recovery` (score) | `homeView.cards.recovery.scoredAt` | `"Recovery scored {value}%"` | `"HRV {hrv} ms"` |
| `journal` | each entry in `journalEntries` | factor label | factor detail (intensity/quantity) |
| `workout` | `homeView.cards.workouts[]` | activity name | `"{duration} · Strain {value}"` |
| `vital` (HRV) | `homeView.cards.vitalChecks[]` (opt-in) | "HRV check" | `"{value} ms · {trend}"` |

Sort by `ts` ascending. Filter where `ts > now` (past-only per Q2/c).

If `homeView` is null OR all source arrays are empty for the selected date, return `[]`. The screen renders an empty state instead of `<TodayTape>`.

### Empty state

When `events.length === 0`:

```
TODAY'S TAPE
─────────────────────
Nothing logged yet today.
Tap + to log your first entry.
```

Single centered text block, 11pt textDim, with the `+` glyph styled as the brand-orange tint inline.

## Visual Rules (lifted from `apps/app/DESIGN.md` and `DESIGN.apple.md`)

- **Canvas**: `colors.background` (`#121212` dark / `#FFFFFF` light)
- **Card surface**: `colors.surfaceCard` (`#181818` dark / `#fafafc` light)
- **Hero ring**: 8pt stroke, `colors.ringRecovery` (`#1ed760` dark / `#16A34A` light)
- **Stat tile halos**: 60×60 radial-gradient `View`, top-right corner, fading from metric-tint `@ 0.22 alpha` to transparent. No SVG — a CSS-equivalent `View` with absolute positioning + `borderRadius: 30` + `backgroundColor: hexWithAlpha(tint, 0.18)` works as a soft glow when paired with `overflow: hidden` clip on the parent. (Acceptable trade — exact gradient feel is sacrificed for one-less-dependency simplicity.)
- **Typography**: stats use `tabular-nums`; eyebrows uppercase 1.4 tracking 700 weight; verdict line and section eyebrows are the only "voice" elements.
- **Geometry**: only the FAB and the tab bar are pill-shaped (per Spotify discipline). Tiles and tape rows are flat.
- **Shadows**: heavy shadow on FAB (`rgba(0,0,0,0.5) 0 8 16`); medium on tiles only when light mode (`rgba(0,0,0,0.08) 0 8 8`); none on tape rows.
- **Color rule**: brand orange `#C76542` reserved for the FAB and the Journal tile + journal tape dots. The hero ring and "Push hard" verdict use ring-recovery green. No other tint placement.

## Interactions

| Trigger | Action |
|---------|--------|
| Tap hero ring | Push `home-metric` with `{ metric: "recovery" }` |
| Tap Sleep tile | Push `sleep-detail` with `{ date: selectedDate }` |
| Tap Strain tile | Push `strain-activity` |
| Tap HRV tile | Push `home-metric` with `{ metric: "recovery" }` (HRV detail lives there for now) |
| Tap Journal tile | Push `journal-history` |
| Tap tape row | Per event type:<br>- `sleep` → `sleep-detail`<br>- `recovery` → `home-metric` recovery<br>- `journal` → `journal-entry` (edit existing)<br>- `workout` → `strain-activity`<br>- `vital` → `home-metric` recovery |
| Tap FAB | Push `journal-entry` (new modal) |
| Pull-to-refresh | `refreshDashboard()` (existing) |
| Horizontal swipe | Prev/next day (existing `PanGestureHandler` with `activeOffsetX={[-15,15]}` + `failOffsetY={[-15,15]}`) |
| Day swipe in progress | Disable vertical scroll while `isHorizontalDaySwipeActive` (existing pattern) |

## What Goes Away

From `app/screens/HomeScreen.tsx`:

- `PrimaryMetricsList` (the Recovery ring + Sleep/Strain pill stack component) — replaced by `RecoveryHero` + `StatGrid`
- `JournalChips` horizontal scroll — chips are folded into the Journal stat tile (count + tap → history) and individual entries appear in the Tape
- `HomeActionRow` list ("Your day in review" / "Today's activities" / "Journal history") — replaced by the Tape and the Journal stat tile. The "day in review" / "today's activities" routes remain reachable from `home-metric` and `strain-activity` tiles respectively
- "My Day" header text + the 64pt floating-orange `+` button next to it — replaced by `HomeFab` in the bottom-right
- The corresponding style helpers: `$myDayHeader`, `$myDayTitle`, `$plusButton`, `$myDayTitleSkeleton`, `$plusSkeleton`, `$chipScroll`, `$chipScrollContent`, `$chip`, `$actionList`, `$actionRow`, `$actionIconWrap`, `$actionTitle`

The skeleton state (`HomeDaySkeleton`) is rebuilt to mirror the new layout (one ring skeleton + four tile skeletons + four tape-row skeletons).

## What Stays

- `SafeAreaView edges={["top"]}` root
- `PanGestureHandler` with horizontal-only constraint (day-swipe)
- `Animated.ScrollView` with `onScroll` handler (for the BlurHeader fade)
- `RefreshControl` (pull-to-refresh)
- `BlurHeader` at the bottom of the JSX (fades in title on scroll)
- `DateSwitcher` + `DevicePill` `topStrip` row at the top of the scroll content
- `Toast` error display (existing `useEffect`)
- `useDashboard()` consumption shape

## File Plan

**New:**
- `app/components/home/RecoveryHero.tsx`
- `app/components/home/StatGrid.tsx`
- `app/components/home/StatTile.tsx`
- `app/components/home/TodayTape.tsx`
- `app/components/home/TapeRow.tsx`
- `app/components/home/HomeFab.tsx`
- `app/utils/buildTodayTape.ts`

**Modified:**
- `app/screens/HomeScreen.tsx` — body replaced; shell preserved
- `app/utils/localTheme.ts` — add `ringHrv: "#539df5"` (announcement-blue from Spotify DESIGN) to both palettes

**Deleted (within HomeScreen.tsx; no separate files exist for these):**
- `PrimaryMetricsList`, `JournalChips`, `HomeActionRow` local function components
- All style helpers listed in "What Goes Away"

## Out of Scope

- Forecast/upcoming events in the tape (chosen out per Q2/c — past only)
- Custom illustrations or hero photography on the home (Spotify "no decoration")
- A "story-style" swipeable detail card (rejected in F2/synthesis)
- HRV's own detail screen (still routes through `home-metric` recovery — separate work)
- Accessibility audit (separate pass)
- Analytics events for new tap targets (separate pass)
- Localization of new strings (these are English-only; existing `i18n` pattern unchanged)

## Risks & Trade-offs

- **Halo without SVG**: A `View` with `borderRadius` and `backgroundColor` is a flat circle, not a true radial gradient. It approximates the mockup's halo. If it reads too solid in real screens, fall back to a small `<Svg>` per tile (4 SVGs total) — acceptable cost.
- **HRV routing**: Tapping HRV jumps into the Recovery detail screen. Acceptable until we build a dedicated HRV history view.
- **Tape data completeness**: `homeView.cards` doesn't currently expose `endTimestamp` for sleep, `scoredAt` for recovery, or `vitalChecks[]`. v1 proceeds with these concrete fallbacks:
  - **Sleep wake-up**: derive from `sleep.endIso` if present; else fall back to `selectedDate + 06:30` as a placeholder time and tag the row with no `desc` time-relative claim.
  - **Recovery scored**: synthesize as `selectedDate + 06:35` (5 minutes after the sleep fallback). Only show this row if a recovery score exists for the day.
  - **Workouts**: use the workout's `startedAt` from `homeView.cards.strain.activities[]` (already exposed).
  - **Vitals**: omitted from v1 (no `vitalChecks[]` field exists yet). Add when the `HomeView` model exposes it.
  - **Journal entries**: use each entry's `createdAt` (already exposed).

  Follow-up: add precise `endTimestamp` / `scoredAt` to `HomeView` so wake-up and recovery times are real, not approximated. Non-blocking for shipping the layout.
- **Day-swipe vs scroll**: Existing constraint `activeOffsetX={[-15,15]}` + `failOffsetY={[-15,15]}` keeps vertical scroll uncontested. Verified during the SettingsScreen tab-collapse work.

## Done When

- Home screen renders the layout above on iOS dark + light, Android dark + light.
- All taps land on their target routes.
- FAB sits 16px from right and 88px from bottom (above tab bar) and survives keyboard avoidance.
- Tape shows past events only, sorted ascending; empty state shows the prompt.
- `pnpm exec tsc --noEmit -p .` clean for new/modified files.
- `pnpm exec eslint --fix` clean for new/modified files.
- Manual smoke pass on iOS simulator: mount → see ring → tap each tile → tap a tape row → tap FAB → swipe day → pull to refresh.
