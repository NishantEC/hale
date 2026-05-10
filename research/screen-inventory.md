# Screen Inventory — what's currently on each page

A grounded inventory of every screen in the noop mobile app, used as the "where could this Reacticx component go?" target for the design system. Paired with `reacticx-component-catalog.md`.

**Last walked:** 2026-05-11 (after the HealthScreen rebuild, datetimepicker swap, and worklet-pressure rollback).

---

## Bottom-nav tabs (5)

| Tab | Route | Screen file |
|---|---|---|
| Home | `(tabs)/index` | `HomeScreen.tsx` |
| Health | `(tabs)/health` | `HealthScreen.tsx` |
| Sleep | `(tabs)/sleep` | `SleepDetailScreen.tsx` (via the floating +) |
| Log (FAB) | not a tab — floating action button on Home | `JournalEntryScreen.tsx` |
| Settings | `(tabs)/settings` | `SettingsScreen.tsx` |

Tab bar implementation: `AppTabBar.tsx` (custom JS) + `_layout.native.tsx` (native iOS tabs when available, fallback to JS bar). Native tab uses `heart.text.square` SF Symbol for Health.

---

## Home (`HomeScreen.tsx`, 540 lines)

Top-to-bottom:

1. **Top strip** — date pill (yesterday / today selector) + device pill (BLE status: Connected / Pairing / Offline + battery %)
2. **Recovery hero** — big ring (`MetricRing` component) showing recovery %, verdict label (e.g. "Easy training day."), verdict detail. Tappable → HomeMetric.
3. **STATS section header** + 4-tile `StatGrid`:
   - Sleep score (e.g. 71)
   - Strain (e.g. 0.5)
   - HRV (e.g. 58 ms)
   - Journal entries count
4. **APPLE HEALTH section** — feed of HK summaries (steps, kcal, exercise min, etc.)
5. **Loading state** — `HomeDaySkeleton` (custom skeleton)
6. **Floating + button** (bottom-right) → opens journal entry

Existing components used: `RecoveryHero`, `MetricRing`, `StatGrid`, `BlurHeader` (none currently), `Text`, `Pressable`.

**Reacticx upgrade candidates** (initial picks):
- `chroma-ring` / `circular-progress` → replace `MetricRing`
- `fade-text` → animate the recovery number when day changes
- `aurora` / `mesh-gradient` / `grainy-gradient` → atmospheric backdrop behind the hero
- `glow` → accent halo around the hero
- `rolling-counter` → animated stat-tile numbers ⚠️ worklet-blur, skip
- `pulsing-dots` → in the device pill while pairing
- `animated-chip` → small status chips ("BLE", "HK", "Synced")
- `shimmer` → underneath `HomeDaySkeleton`

---

## Sleep Detail (`SleepDetailScreen.tsx`)

Top-to-bottom:

1. **Custom sticky header** (`ScreenHeader`) — scroll-driven blur intensity, back chevron, date strip with chevrons, alarm time on the right
2. **SleepHero** — two-column: large duration ("5h 38m") + bedtime/wake range; right column has a score badge ("71 Fair")
3. **HypnogramChart** — labelled hypnogram with the 4 stages (Awake/REM/Core/Deep) and per-stage durations on the left. Drag-cursor reveals a tooltip card with current stage + duration + time range.
4. **WhyPanel** — explanation block with 3 visual states (factor insights, journal prompt, empty)
5. **VITALS section** — 6-stat grid (Resting HR, HRV, RR, SpO₂, Skin Temp, Sleep Need) — uses `VitalCard`
6. **TrendSparkline** — 14-day sparkline for the main score
7. **LabsAccordion** — expandable "Labs" section with pNN50, SD1/SD2, HRV-CV, raw numbers
8. **DateSwitcher** — bottom date strip (carried over from older layout)

**Reacticx upgrade candidates**:
- `accordion` → replace `LabsAccordion` ⚠️ worklet-blur, skip
- `disclosure-group` → same, also worklet-blur
- `animated-text` → fade the score badge between dates
- `spectral-wave` → could replace `SleepHeartRateChart` as a more decorative waveform
- `parallax-header` → atmospheric scroll header (replaces `ScreenHeader`)
- `lanyard` → decorative tag for "Fair / Good / Poor" verdict
- `stacked-chips` → factor-tags row in `WhyPanel`

---

## Health (`HealthScreen.tsx`, 600+ lines, just rebuilt)

Top-to-bottom:

1. **Header** — back chevron, "HEALTHSPAN" + "Next update in N days", info (i) button → plain RN Modal (was Reacticx Dialog, removed for stability)
2. **Week strip** — `‹ MAY 4 – MAY 10 ›` with paginating chevrons
3. **SVG radial-gradient orb** (replacement for `EnergyOrb` after worklet crash) — big noop Age + delta line ("4.7 years younger" / "10.0 years older")
4. **Pace of Aging slider** — -1x to 3x with animated marker via `useSharedValue + withSpring`
5. **Coaching block** — title + body + "VIEW YOUR PLAN →" link
6. **Sections** (Sleep / Strain / Fitness) — each contains `MetricCard`s with plain Pressable expand (was Reacticx DisclosureGroup, removed for stability)
7. **Metric bars** (inside expanded card) — orange→green `LinearGradient` with ▼ 6mo / ▲ 30d markers + impact-in-years readout
8. **Trend View** — Pace-of-Aging line chart (last 12 weeks)
9. **Footer** — "Estimated from your wearable data… Not a medical assessment."

**Reacticx upgrade candidates** (carefully — this screen just stabilized):
- `chroma-ring` → ring around the orb for tinted edge effect
- `glow` → accent glow around the orb
- `aurora` / `mesh-gradient` → distant background atmospherics (color-shifted by age delta)
- `fade-text` → noop Age number when week changes
- `animated-text` → coaching title

---

## Settings (`SettingsScreen.tsx`, 700+ lines)

Top-to-bottom:

1. **BlurHeader** — scroll-driven blur, "Settings"
2. **Account card** — initials avatar + name + email
3. **Health Profile** card → "Date of birth" row → opens `DateOfBirthSheet` (community datetimepicker spinner)
4. **Appearance** — Theme pills (System / Light / Dark)
5. **Device** — connection status + last sync
6. **Notifications** — placeholder
7. **About** — version + build

`DateOfBirthSheet.tsx` is a separate bottom-sheet component using slide-up Modal + `@react-native-community/datetimepicker`.

**Reacticx upgrade candidates**:
- `bottom-sheet` (template) → migrate `DateOfBirthSheet` to the standard sheet pattern
- `theme-switch` (organism) → replace the 3 theme pills with the animated `theme-switch`
- `gooey-switch` (micro-interaction) → fancy toggle for notification preferences
- `check-box` (organism) → checkboxes for notification opts

---

## Journal (entry + history)

`JournalEntryScreen.tsx` + `JournalHistoryScreen.tsx`.

Entry screen lets the user tag factors (caffeine, workout, stress, etc.) and write a note. History is a list.

**Reacticx upgrade candidates**:
- `stacked-chips` → factor tag row
- `animated-chip` → tappable factor pill with selected state
- `flexi-button` → submit button
- `timeline` (molecule) → journal history view
- `bottom-sheet` → factor selector

---

## Other screens

| Screen | Purpose | Reacticx fit |
|---|---|---|
| `WelcomeScreen.tsx` | First-launch hero | `radial-intro` (organism) — radial reveal animation. `gooey-text` for the hero text. |
| `LoginScreen.tsx` | Email + password sign-in | `flexi-button` for submit; `animated-input-bar` for fields |
| `DeviceScreen.tsx` / `DeviceSettingsScreen.tsx` | BLE pairing flow | `circle-loader` while scanning; `chroma-ring` around the strap icon when paired; `pulsing-dots` for "looking…" state |
| `HrvDetailScreen.tsx` | Drill into HRV | `spectral-wave` as the HRV waveform; `circular-progress` for HRV-CV |
| `HomeMetricScreen.tsx` | Drill into a single home metric | `parallax-header`; section headers with `animated-text` |
| `HomeDetailsScreen.tsx` | Today summary | `disclosure-group` per-section (⚠️ worklet-blur, skip) |
| `SleepPlannerScreen.tsx` | Set bedtime / wake time | `vertical-wheel` time pickers (organism); `bottom-sheet` (template) |
| `StrainActivityScreen.tsx` | Activity bouts | `timeline` (molecule); `material-carousel` for activity icons |
| `DebugInspectorScreen.tsx` | Dev tooling | not a candidate — internal |

---

## Existing custom components (the ones to maybe replace)

| Custom component | What it does | Reacticx alternative |
|---|---|---|
| `MetricRing` | The home Recovery ring | `circular-progress` (organism) or `chroma-ring` (organism) |
| `MetricHero` | Generic hero with number + label | `radial-intro` for entry; `fade-text` for value |
| `SleepHero` | Sleep duration + score badge | Keep custom — too specific |
| `HypnogramChart` | Sleep stage timeline w/ cursor | Keep custom — domain-specific |
| `SleepHeartRateChart` | Overnight HR line | `spectral-wave` (organism) — for decorative variant |
| `BarSeriesChart` | Bar chart series | none — keep custom |
| `InlineLineChart` | Tiny inline line | `spectral-wave` (minimal mode) |
| `BlurHeader` | Sticky blur header | `animated-header-scrollview` (organism) ⚠️ needs `react-native-easing-gradient` dep |
| `ScreenHeader` | Detail-screen header with scroll-driven blur | same as BlurHeader |
| `DetailScreenHeader` | Variant of above | same |
| `DateSwitcher` | Date strip w/ chevrons | `morphing-tabbar` if redesigned as a tab strip |
| `VitalCard` | Single vital stat tile | `action-card` (base) ⚠️ needs NativeWind |
| `StagePills` | Sleep stage pills row | `stacked-chips` (micro-interaction) |
| `WhyPanel` | Insight block w/ states | none — keep custom |
| `LabsAccordion` | Expandable "labs" data | `accordion` (molecule) ⚠️ worklet-blur, skip |
| `GlassCard` | Frosted card | RN BlurView already does this |
| `StatusPill` | Status badge | `animated-chip` (molecule) |
| `Button` | App button | `flexi-button` (micro-interaction) for primary CTA |
| `TextField` | Text input | `animated-input-bar` (organism) |
| `Header` | Generic header | `animated-header-scrollview` |
| `AppTabBar` | Custom JS bottom tab bar | `morphing-tabbar` (molecule) |
| `Icon` | Icon wrapper | none |
| `AutoImage` | Image with auto-sizing | none |

---

## Risk-aware integration order

If we adopt Reacticx components, ship in this order (smallest blast radius first):

1. **Settings · theme-switch** (replaces theme pills, isolated to one screen)
2. **Home · chroma-ring** or **circular-progress** for Recovery
3. **Home · fade-text** for the recovery number
4. **WelcomeScreen · radial-intro / gooey-text** (one-time screen, low risk if it breaks)
5. **Sleep · stacked-chips** for `StagePills`
6. **Journal · animated-chip + stacked-chips** for factor tags
7. **HRV detail · spectral-wave**
8. **Home · aurora/mesh-gradient** atmospheric backdrop (deferred — Skia render is fine but adds GPU load)

**Permanent skip list** (worklet pressure during BLE bursts crashed us before):
- `accordion`, `dialog`, `disclosure-group`, `picker`, `rolling-counter`, `dynamic-island`, `morphing-tabbar` (if its indicator uses animated blur)
- `energy-orb` (frame callback)
- Anything with `useFrameCallback` or `AnimatedBlurView` + `useAnimatedProps`

Final selection happens after the full catalog lands.
