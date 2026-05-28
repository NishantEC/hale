# Secondary Screens Audit — 2026-05-28

Comprehensive audit of every non-Home screen in the noop mobile app
(`apps/app/`) as it stands today. Source paths are absolute. The goal is to
make explicit what each screen renders, where its data comes from, what is
demonstrably broken or empty, and the 3–5 issues most likely to make a user
say "this is weird."

## Navigation reality check (read this first)

The app has **two coexisting navigation systems** and the React Navigation
one is essentially a dead stub. The live navigation is **expo-router** under
`apps/app/src/app/`.

- Active root layout: `/Users/nish/Documents/noop/apps/app/src/app/(app)/_layout.tsx`
- Active tab layout (NativeTabs):
  `/Users/nish/Documents/noop/apps/app/src/app/(app)/(tabs)/_layout.tsx`
- Stale RN-Navigation tab navigator (not wired into the running app):
  `/Users/nish/Documents/noop/apps/app/app/navigators/MainNavigator.tsx`
- Stale RN-Navigation stack (also not actually rendered):
  `/Users/nish/Documents/noop/apps/app/app/navigators/AppNavigator.tsx`

**Tabs the user actually sees (from `(tabs)/_layout.tsx`):**

1. Home (`index.tsx`)
2. Health (`health.tsx` → `HealthScreen`)
3. Inspector (`inspector.tsx` → `DebugInspectorScreen`)
4. Settings (`settings.tsx`)

**Concrete consequences:**

- **`TrendsScreen.tsx` (357 LOC) is orphaned.** It is only referenced from
  `MainNavigator.tsx`, which is the stale RN-Navigation tab navigator. There
  is no `trends.tsx` route under `src/app/(app)/(tabs)/`. Users have no way
  to reach the Trends screen in the running app.
- **Device tab is missing too.** `DeviceScreen.tsx` is wired into the stale
  MainNavigator but not into expo-router's tab layout. (`device-settings`
  exists as a stack screen but is configured to present as a modal from
  inside Home/Settings.)
- The stale `MainNavigator.tsx` still uses the old `tabBarIcon`/Ionicons
  config (Home/Trends/Device/Inspector) — none of which match the
  NativeTabs SF/Material setup the live layout uses (house, waveform,
  gauge, gearshape).
- `AppNavigator.tsx` registers `HrvDetail` as a `navigation.navigate("HrvDetail")`
  target — but the live expo-router has it at the path `/hrv-detail`. So
  the `VitalRow` "HRV" tap inside `HealthMonitorScreen` calls
  `navigation.navigate("HrvDetail" as never)` against a router that doesn't
  know the name. **This nav call is dead.**

That ambiguity colors every audit point below: any prior "fix" you read in
the older plans (`2026-04-07-sleep-detail-redesign.md`,
`2026-05-16-home-monitors-redesign.md`) is half-applied.

---

## 1. `HealthScreen.tsx` — 676 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/HealthScreen.tsx`

This is the **Health tab** (a top-level tab; not a detail screen despite
the name overlap with `HealthMonitorScreen`).

### 1.1 What it shows now

Top to bottom (`ScrollView`):

1. **Header band** — `HEALTHSPAN` eyebrow + a "Next update in N days"
   subtitle generated client-side from today's day-of-week
   (`nextUpdateLabel()` lines 563–568) + a back caret + an info button.
2. **Week strip** — `< MAY 19 – MAY 25 >` text with prev/next chevrons.
   `canGoForward` disables the right chevron at the current week.
3. **Orb hero** (280 px tall) — a radial-gradient SVG circle (green = younger,
   orange = older, slate = matching) with the noop Age number, the literal
   text `NOOP AGE`, and a delta line like `0.8 years younger`.
4. **Pace of Aging** — 41 vertical ticks (with every 10th major) on a
   `-1 → 3` axis, an animated marker positioned at `(value + 1) / 4`. Axis
   labels: `Slow · 1.0x · Fast` (lines 337–347). No tick numbers; just
   `Slow` and `Fast` words at the ends and `1.0x` in the middle.
5. **Coaching block** — title + body card from `current.coachingTitle/Body`
   with a "VIEW YOUR PLAN →" link that has **no onPress handler** (lines
   359–363).
6. **Sections (Sleep / Strain / Fitness)** — for each section, a list of
   `MetricCard`s. Each card collapsed shows: `LABEL`, value (formatted by
   units), and an impact-years number with a "years" suffix. Tap expands a
   gradient bar (length-normalised to the metric's `axisLo..axisHi`) with
   `▼` for the 6-month value (above) and `▲` for the 30-day value (below),
   plus axis-end labels. The gradient direction inverts based on
   `direction: 'higher' | 'lower'`.
7. **Trend View** — only renders if `history.length ≥ 2`. A 100-px-tall
   floating-dot scatter of `paceOfAging` over time, **no axes**, **no x
   ticks**, **no y ticks**, **no week labels**, **no line connecting
   dots**, last dot painted green and earlier dots tint-colored.
8. **Footer disclaimer** — "Estimated from your wearable data… Not a
   medical assessment."

DOB onboarding state (lines 95–111): if `needsDateOfBirth`, the whole screen
becomes a single centred CTA pushing `router.push("/settings")`. Settings is
expected to surface a DOB sheet — `DateOfBirthSheet.tsx` exists under
`components/`, but the integration is out of scope for this audit.

### 1.2 Data sources

- Endpoint: `fetchHealthView(weekStartIso?)` → `/views/health` (line 1196 in
  `noopClient.ts`), returns `HealthViewModel = { current: HealthAssessment | null,
  history: HealthAssessment[], profile: UserProfileData | null, needsDateOfBirth: boolean }`.
- Each `HealthAssessment`: chronologicalAge, noopAge, paceOfAging,
  contributors[], coachingTitle, coachingBody, weekStart, generatedAt.
- Each `HealthContributor`: key, label, section ("Sleep" | "Strain" |
  "Fitness"), thirtyDayValue, sixMonthValue, unitsLabel, axisLo, axisHi,
  direction, impactYears.
- No local cache layer; loads from network every time `weekOffset` changes
  (lines 56–70). No offline fallback.

### 1.3 What's broken / weak

- **`VIEW YOUR PLAN →` is a no-op.** Lines 359–363: no `onPress`, no
  `Pressable`. It's just `Text + ArrowRight` inside a static `View`. A
  user who taps it gets nothing.
- **Trend View has no axes, gridlines, or week labels.** Lines 504–544. It
  renders raw dots only. The user has no way to know when each dot was
  recorded, what 1.0x is on the y-axis, or which dot is "this week."
- **No retry/offline state on `fetchHealthView` failure.** Lines 84–92
  render `"No data"` + retry button using whatever last `error` was — and
  the error message itself is `e?.message ?? "Failed to load"`, which is
  the raw API error string (e.g. `"Request timed out after 45s: GET /views/health"`).
- **Week strip is reachable beyond available history.** `setWeekOffset((w) => w - 1)`
  is unbounded (line 134). If the user clicks left into a week with no
  assessment, `data.current` becomes `null`, all the values render as
  `"—"`, and the orb becomes a featureless slate gradient. There's no
  empty-week message.
- `nextUpdateLabel()` always says `"Next update in N days"` even on a past
  week where no update is coming. The footer line is computed from
  *today*, not from `weekOffset`.
- The **Pace of Aging axis maps `-1..3`** to `0..1` of strip width
  (line 305). For a healthy user with paceOfAging in 0.8–1.1, the marker
  spends its life in the middle 5% of the strip with the marker text
  "1.0x" floating over the same "1.0x" axis label. Visually noisy.

### 1.4 The 3–5 user-facing weirdnesses

1. **"VIEW YOUR PLAN" looks tappable but does nothing.** Dead CTA right
   under the headline insight.
2. **Trend chart is just floating dots with no time scale, no axis, no
   line.** The user can't tell whether they're 5 weeks or 30 weeks of
   history.
3. **Empty future/past weeks don't have an empty state.** The orb becomes
   blank slate with `"—"` and the pace marker disappears, but the rest of
   the chrome (header, week strip, contributor sections) renders empty.
4. **Pace-of-Aging strip uses a 4-wide axis (`-1..3`)** so the marker
   barely moves for normal users; the tick density (41 ticks) is
   overkill.
5. **The whole screen is loaded eagerly from network every week
   navigation**, with no spinner inside the orb — just a global
   ActivityIndicator that replaces the whole screen.

---

## 2. `TrendsScreen.tsx` — 357 LOC (ORPHANED)

`/Users/nish/Documents/noop/apps/app/app/screens/TrendsScreen.tsx`

**This screen is not reachable from the running app.** It is only wired
into `MainNavigator.tsx` (the stale RN-Navigation tab bar that the live
expo-router layout supersedes). Audit covers it as built; the dominant
"weirdness" is that it doesn't exist as a tab anymore.

### 2.1 What it shows now

1. `Trends` heading + subtitle `"N-day window · M nights"` (line 174–181).
2. **Summary row** — 3 stacked-text pills: HRV, RHR, Sleep — each showing
   `current`, `unit`, and a `↑`/`↓` trend icon. Direction-color is
   inverted for RHR (lower = green).
3. **8 trend cards** rendered in a `TREND_CARDS` const array, one per
   metric: HRV, RHR, Sleep Duration, Recovery, Training Load Ratio, Sleep
   Consistency, Respiratory Rate, SpO₂. Each card:
   - Header row: phosphor icon + title + subtitle + the latest value in
     the metric's tint color, top-right.
   - SwiftUI `Chart` (via `@expo/ui/swift-ui`) — line type, gridded,
     animated, 120 px tall, no titled axes, no x-tick labels, no
     numerically labelled y axis (it's a thin abstraction over Swift
     Charts and the configuration only sets line color/width/point size).
4. Empty state per card: a 120-px box with `"No <metric> data yet"`.

### 2.2 Data sources

- Endpoint: `fetchTrendsView(days = 30)` → `/views/trends` (line 1135 in
  `noopClient.ts`). Returns `TrendsViewModel` with 10 SeriesPoint[] series:
  `hrvTrend, restingHrTrend, sleepDurationTrend, recoveryTrend,
  trainingLoadTrend, consistencyTrend, strainTrend, stressTrend,
  respiratoryRateTrend, spo2Trend`, plus `summaries { hrv, restingHr,
  sleepDuration }`.
- Cached in local SQLite via `getViewCache(db, "trends", "30d")` / `setViewCache`.
- Render-from-cache-first pattern. On network failure, silently keeps the
  cached data (line 152).

### 2.3 What's broken / weak

- **Orphaned.** No tab, no `router.push("/trends")` call anywhere in
  `src/app`. Dead code in the live build.
- The card shows only **2 of the 10 backend series** (strain + stress are
  fetched but never rendered).
- The "summary row" only covers 3 of 10 metrics — there's no equivalent
  for Recovery, Training Load, Consistency, etc.
- The chart is a **SwiftUI native chart**, so on Android the cards fall
  back to nothing visible (the `<Host>` mounts but the chart itself is
  iOS-only). There's no Android branch.
- The "latest value" in the header (`data[data.length - 1].value.toFixed(...)`)
  doesn't show the date of that value. A user looking at a 30-day window
  has no idea if "67ms" is last night or three nights ago.
- The card subtitle copy is direction-loaded ("higher is better", "lower
  is better") but the chart itself doesn't visualise a target band or
  reference line — so the directional advice has no anchor.
- No period toggle: the screen is hard-coded to 30 days. There's no
  7-day/30-day/90-day chip.
- `invertTrend` flag exists in `TREND_CARDS` (RHR) but is **not consumed**
  inside the card render — only the summary pill uses it. So the chart's
  "latest value" color doesn't reflect direction.

### 2.4 User-facing weirdnesses

1. **The screen isn't reachable.** All of the below is moot until it's
   wired into the tab bar or a Home drill-in.
2. **Charts have no x-tick or y-tick labels.** "67 vs the last value" is
   the only readable number.
3. **No period toggle.** Hard-coded 30 days.
4. **Strain & Stress data are fetched but never rendered.** Dead bytes.
5. **iOS-only chart.** The screen is silently broken on Android.

---

## 3. `HealthMonitorScreen.tsx` — 159 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/HealthMonitorScreen.tsx`

Pushed from Home's `MonitorCard` for the "Health" monitor (linked via
expo-router `/health-monitor`).

### 3.1 What it shows now

1. **Nav bar** — back caret + "Health Monitor" + spacer + Info icon (which
   has no onPress handler).
2. **Hero card** — tint background tile with a state icon (Check / Warning
   / WarningOctagon / ClockCountdown), the verdict text (e.g. "Within
   range"), and a "N of 4 metrics" subtitle.
3. **Vitals list** — 4 `VitalRow`s for HRV, RHR, RR, SpO₂ with icons
   tinted by ring color (HRV blue, RHR strain-orange, RR sleep-violet,
   SpO₂ recovery-teal).
4. **Footer caption** — "Each metric is compared to your personal 14-day
   baseline."

### 3.2 Data sources

- All data reads from `useDashboard().homeView.monitors.health` and
  `homeView.activities.{hrv, restingHr, spo2}`.
- **`monitors.health` is NOT supplied by the backend** — see
  `apps/backend/src/views/views.service.ts` line 324, where the
  `HomeViewModel.activities` block is emitted, but there is no `monitors`
  field in the response. The mobile app derives a fallback in
  `DashboardContext.tsx:46-77` (`deriveMonitorsFallback`).
- The fallback sets `inRangeCount = (hrv != null) + (rhr != null) + 2`
  (RR + SpO₂ are always counted as "in range"), so the metric count is
  almost always "4 of 4" or "2 of 4" — never reflecting the actual
  in-range state of RR or SpO₂.
- `staleSinceMs` field is in the type but always `null`.

### 3.3 What's broken / weak

- **Respiratory rate is hard-coded `"--"`** in the vitals list (line 109).
  `homeView.activities` does not surface respiratoryRate (compare backend
  `views.service.ts:324-383`). To get RR you'd have to read
  `sleepView.metrics.find(label === "Respiratory Rate")`, but this screen
  doesn't consume sleepView.
- **The HRV row links to `navigation.navigate("HrvDetail" as never)`**
  (line 92) — but `HrvDetail` is registered in the stale
  `AppNavigator.tsx` only. In the live expo-router app this nav call
  no-ops or throws silently. The correct call would be
  `router.push("/hrv-detail")`. **The HRV row is dead.**
- **RHR/RR/SpO₂ rows are not pressable at all.** Only HRV has `onPress`.
- **The Info icon has no onPress.** No tooltip, no sheet.
- **The hero `inRangeCount` is fake.** Always assumes RR + SpO₂ are in
  range. So the verdict / count are meaningless.
- **Verdict text is just two strings** — "Within range" or "Check
  vitals". There's no rationale, no most-out-of-range metric called
  out.
- The HRV value is rendered as plain string from `activities.hrv`
  (e.g., "67") with unit "ms" — there's no trend, no baseline, no delta.

### 3.4 User-facing weirdnesses

1. **RR is always blank.** Hard-coded "--" because the backend HomeView
   doesn't include RR.
2. **Tapping HRV does nothing** (broken nav target).
3. **The "N of 4 metrics" count lies** — RR and SpO₂ are always counted
   as in-range regardless of value.
4. **Three of the four rows are non-interactive.** Only HRV pretends to
   drill in.
5. **No 14-day baseline visualisation** despite the caption claiming
   "compared to your personal 14-day baseline." Nothing on this screen
   shows the baseline or the user's distance from it.

---

## 4. `StressMonitorScreen.tsx` — 196 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/StressMonitorScreen.tsx`

Pushed from Home's stress `MonitorCard` (expo-router `/stress-monitor`).

### 4.1 What it shows now

1. **Nav bar** — back caret + "Stress Monitor" + Info icon (no onPress).
2. **Hero card** — big number `X.X / 3` (64 px font), zone label
   (CALM/MODERATE/HIGH in tinted uppercase), "last reading H:MM AM" or
   "no recent reading" line.
3. **Today strip** — `StressColorStrip` rendering 12 cells with a
   "now" marker, axis labels `6 AM · 12 PM · 6 PM · 11 PM`.
4. **Time-in-zone card** — three rows (Calm 0–0.9, Moderate 1.0–1.9,
   High 2.0–3.0) with a colored dot, range, and minutes formatted
   `Xh Ym`.
5. **Footer** — "Based on HRV + heart rate against your 14-day baseline."

### 4.2 Data sources

- `useDashboard().homeView.monitors.stress` (same fallback story as
  HealthMonitor).
- Fallback (`DashboardContext.tsx:64-74`):
  - `score` parsed from `activities.stress` string.
  - `zone` from `scoreToZone(score)`.
  - **`lastReadingAt: null`**.
  - **`todayStrip: new Array(12).fill(null)`** — all nulls.
  - **`timeInZone: { calm: 0, moderate: 0, high: 0 }`** — all zero.
- The backend has no `monitors.stress` block (no references in
  `apps/backend/src/views/`), so the screen will only ever see the
  fallback values.

### 4.3 What's broken / weak

- **`todayStrip` is always 12 nulls.** The hourly color band exists as a
  primitive but has no data feed. Whatever the strip renders is just
  empty grey cells.
- **`timeInZone` is always all zeros.** The Calm / Moderate / High row
  always shows `0m` per zone.
- **`lastReadingAt` is always null.** So the hero shows "no recent
  reading" indefinitely.
- The hero `X.X / 3` reads the same `activities.stress` string as the
  Home stress card — there's no drill-down data; just a bigger font.
- The Info icon is decorative (no onPress).
- `computeNowPercent()` (lines 130–138) maps "now" into a 6 AM → 11 PM
  range. If the user opens the screen before 6 AM or after 11 PM the
  marker pins to the edge; there's no overnight extension.
- The strip axis labels are hard-coded to `6 AM, 12 PM, 6 PM, 11 PM` and
  not parameterised even though the cell count is 12.

### 4.4 User-facing weirdnesses

1. **The hourly stress strip is permanently empty.** Just a row of
   slate placeholder cells with a "now" marker.
2. **Time-in-zone is always 0m / 0m / 0m.** The whole card is a
   tombstone.
3. **"last reading" never appears** because `lastReadingAt` is never
   populated; replaced by "no recent reading" permanently.
4. **Score / 3 hero** is the same value as the Home card just at a
   bigger font — no new information vs Home.
5. **Info icon and the footer text both reference a 14-day baseline**
   that the user can't actually see anywhere on this screen.

---

## 5. `StrainActivityScreen.tsx` — 322 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/StrainActivityScreen.tsx`

Pushed from Home's strain ring / activity card (`/strain-activity`).

### 5.1 What it shows now

1. **ScreenHeader** — "Strain" + day subtitle (e.g. "Wed, May 28").
2. **MetricHero** — value `X.X`, sub `"0 – 21 scale"`, badge classifying
   strain ("Minimal" / "Light" / "Moderate" / "Strenuous" / "All-out"),
   `delta` vs the prior 7-day mean, and a detail line like
   `"2 named · 1 candidate · 3 off-wrist · 47 active min"`.
3. **DayTimeline** — 24-hour ribbon plotting `feed` (real activities) +
   `candidates` (pending) as colored bands within the day bounds.
4. **PendingActivityCards** — confirmation cards for each candidate
   (sourced from `homeView.pendingActivityCards`).
5. **TODAY eyebrow + activity feed list**:
   - `BoutCard` for each detected activity (type, start time, duration,
     avg HR, intensity, strain, optional press → `/bout-detail?id=…`).
   - `GapRule` for Off-Wrist / No Data entries.
   - `RestDayEmpty` if `feed.length === 0`.
6. **Strain · 7-day inline chart** — only renders if
   `sevenDayStrain.length > 0`.
7. **2×2 VitalCard grid** — Live HR / Stress / Recovery / Load Pressure.
8. **7-day sparklines card** — strain + stress `TrendSparkline`s (tap
   point switches selectedDate).
9. **LabsAccordion** — Training Load Ratio, Load Risk Zone, Stress Load,
   SpO₂, SpO₂ Dips, Active Minutes.

### 5.2 Data sources

- `useDashboard()` — `homeView.rings.strain.value`, `strainTrend`,
  `stressTrend`, `activities.activityFeed`, `pendingActivityCards`,
  `activities.totalActiveMinutes`, `activities.trainingLoad`, etc.
- Live HR from `useBleRealtimeHr()`.
- Bout detail tap goes through expo-router (`/bout-detail?id=…`).

### 5.3 What's broken / weak

- **MetricHero `delta` is computed against the prior 7-day mean** (lines
  88–96), not vs a typical baseline. So on day 1 of usage `delta = null`
  and after a week it becomes "+0.3" against the user's own (possibly
  empty) history — confusing because the badge "Strenuous" already
  classifies absolute strain.
- The **detail line `2 named · 1 candidate · 3 off-wrist`** mixes
  user-facing categories with internal taxonomy. "candidate" and
  "off-wrist" need glossing for a real user.
- **Live HR card is in the strain screen.** It is the same Live HR that
  appears on Home; there is no scrubbable timeline of historical HR.
- The **Strain 7-day inline chart and the Strain 7-day TrendSparkline**
  render the same `strainTrend` series two ways immediately under each
  other (the inline line chart card + the sparkline card). Redundant.
- The Strain 7-day inline chart only appears when `sevenDayStrain.length`,
  but the TrendSparkline below always renders even if it has no points.
- **No filter / sort on the activity feed.** A user with many bouts in a
  day gets the raw timestamp order.
- The PendingActivityCards block sits between the timeline and the activity
  list with no eyebrow / header explaining why a "candidate" exists.
- Long values in `LabsAccordion` (e.g. "Training Load Ratio") collide
  with the right-aligned value column; nothing wraps gracefully.

### 5.4 User-facing weirdnesses

1. **Two strain trend charts in a row** (inline line chart + sparkline)
   showing the same data.
2. **"Live HR" card** floats on a screen about today's strain history —
   it's identical to the Home card and adds no historical context.
3. **Internal jargon** ("candidate", "off-wrist", "No Data") in the hero
   detail line.
4. **No header on the PendingActivityCards block** — the user sees
   confirm/dismiss cards with no explanation of what they are.
5. **The delta vs personal-week mean** is ambiguous because the badge
   already classifies the strain.

---

## 6. `SleepDetailScreen.tsx` — 329 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/SleepDetailScreen.tsx`

Pushed from Home's sleep card (`/sleep-detail?date=…`).

### 6.1 What it shows now

If `sleepView.emptyState.isEmpty`, only an empty-state block. Otherwise:

1. **ScreenHeader** with `formattedDate` and a right-action alarm chip
   (`Alarm icon + alarmLabel`), tapping pushes `/sleep-planner`.
2. **SleepHero** — large duration, bedtime/wake labels (computed from
   the first/last epoch timestamps so they reflect actual sleep, not
   bedtime intent), night score (rounded from `sleepScoreTrend`), score
   label ("Good"/"Fair"/"Poor"/"Unknown"), confidence, delta vs prior
   3+ nights mean.
3. **HypnogramChart** — only when `epochTimeline.length > 0`. Bedtime/wake
   labels passed in.
4. **WhyPanel** — factor insights (factor tags + occurrences + effect
   size) with a CTA to log journal entry.
5. **Vitals 2×2 grid** — Efficiency, Resting HR, HRV (RMSSD), Skin Temp
   Δ. Skin temp value formatted client-side; others read
   `sleepView.metrics`.
6. **Trend sparklines card** — Duration · 7-night + Score · 7-night
   (`TrendSparkline`, tap to set selectedDate).
7. **LabsAccordion** — Blood Oxygen, SpO2 Dips, Respiratory Rate, Sleep
   Consistency.

### 6.2 Data sources

- `useDashboard()` → `sleepView` (from `/views/sleep?date=…`).
- `route.params.date` overrides selectedDate but **then refreshes
  Dashboard for the new date** indirectly: `selectedDate` is only used in
  the trend sparkline currentDate marker. The actual sleepView data
  loaded is for the dashboard's selectedDate, not necessarily the route
  date. (If the user navigates to a non-current date, the sleepView may
  still reflect the dashboard's date until `setSelectedDate` runs.)
- bedtime/wake derived from epoch timeline first, sleepView.header second.
- nightScore inferred from `sleepScoreTrend` — if exact-date match found,
  use it; else use last point. So on a day with no score, score still
  shows whatever the last sample was. (Misleading.)

### 6.3 What's broken / weak

- **Score "Unknown" never shows.** Because the fallback at line 145–146
  uses `points[points.length - 1].value` if no exact match exists, score
  is always defined as long as any history exists.
- The label thresholds for score are arbitrary (≥80 Good, ≥60 Fair, else
  Poor) — embedded in screen logic rather than backend-driven.
- **Score delta is "vs the mean of the prior 3+ nights"** but the
  user-facing label in MetricHero is "vs week". The string label is
  wrong.
- **Alarm chip in the header** competes for attention with the score; on
  small screens it crowds the date title.
- The **HypnogramChart's pressable interactivity** isn't documented in
  this screen; on tap, nothing happens (depending on chart impl).
- The factor insights come from `sleepView.factorInsights`; if the user
  has never logged journal entries, `WhyPanel` falls back to a
  log-journal CTA — fine, but there's no explanation of what factors
  *are* without first logging.
- The Skin Temp Δ card formats `+0.3°C` itself rather than re-using
  `sleepView.metrics["Skin Temp"].detail`.
- Trend sparklines: tapping a point calls `setSelectedDate(d)` — this
  changes the dashboard's selectedDate which RELOADS data. Side-effect:
  the screen header date does NOT update (it reads `route.params?.date`,
  not `selectedDate`). So the screen's title says one date while the
  data is for another. **Subtle but real bug.**

### 6.4 User-facing weirdnesses

1. **Tapping a trend sparkline point changes the data but not the
   screen's title.** Title remains the originally-navigated-to date.
2. **Night score always reports a number** even for nights without data
   (fallback to last sample), so an empty night can show "Score 72 ·
   Good".
3. **Two ways to drill into the alarm**: header chip + the planner is
   `presentation: "formSheet"` — visually it looks like a tiny in-screen
   sheet rather than a full settings screen, surprising on first tap.
4. **WhyPanel without journal context** shows raw factor tags
   ("CAFFEINE_LATE", "STRESS_HIGH") with no explanation.
5. **HypnogramChart has no zoom / scrub** — a 7-hour night squeezed into
   ~340 px width.

---

## 7. `HrvDetailScreen.tsx` — 221 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/HrvDetailScreen.tsx`

Reachable from `/hrv-detail`. The only in-app caller
(`HealthMonitorScreen.tsx`) uses `navigation.navigate("HrvDetail")`,
which is broken in expo-router (see §1 navigation reality). So this
screen is **effectively orphaned in the live app** even though its route
exists.

### 7.1 What it shows now

1. **ScreenHeader** — "HRV" + date subtitle.
2. **MetricHero** — `value = round(hrvNumeric)`, valueDetail = "RMSSD · ms",
   badge ("Awaiting data" / "Low" / "Normal" / "Elevated"),
   `delta = sleepView.vitalsDelta.hrv`, deltaUnit `"ms"`, detail copy.
3. **HRV 7-night inline line chart** — only when sleepView.hrvTrend has
   points. Inside a surfaceCard with the eyebrow `HRV · 7-night`.
4. **VitalCard 2×2** — HRV (RMSSD), Resting HR, Recovery, Sleep
   Efficiency.
5. **Two TrendSparklines** in the bottom card — "HRV · 7-night" and
   "Recovery · 7-day" (the second uses `homeView.trendSummary.samples`,
   which is the *recovery composite* trend, not RHR).
6. **LabsAccordion** — Skin Temp Δ, Respiratory Rate, Blood Oxygen,
   Confidence, Pipeline.

### 7.2 Data sources

- `sleepView.metrics["HRV (RMSSD)"]`, `sleepView.vitalsDelta.hrv`,
  `sleepView.hrvTrend`.
- `homeView.trendSummary.samples` is labelled "Recovery · 7-day" but the
  variable name in the file is **`rhrTrendPoints`** (lines 89–93), so
  there's a comment/code disconnect.
- `homeView.rings.recovery.value`, `homeView.confidence.confidence`,
  `homeView.confidence.pipelineStatus` for labs.

### 7.3 What's broken / weak

- **Orphaned in practice.** The only inbound link is broken (see §3).
- **`rhrTrendPoints` variable holds the recovery trend.** Lines 89–93
  even comment "RHR trend reuses the recovery (general health) trend as
  a stand-in." The card is labelled "Recovery · 7-day" so the label is
  honest, but the variable name is misleading.
- **HRV 7-night inline chart and HRV 7-night TrendSparkline are both
  rendered**, stacked vertically — same data twice (lines 127–146 +
  185–195).
- The MetricHero `detail` copy is hard-coded text ("Heart-rate variability
  measured during sleep. Higher generally indicates better autonomic
  recovery.").
- Classification thresholds (≥60 Elevated, ≥30 Normal, else Low) are
  population averages, not personalised vs the user's baseline — but
  the screen doesn't say so.

### 7.4 User-facing weirdnesses

1. **You can't actually reach this screen** unless you have a deep link
   to `/hrv-detail` (the HRV row in Health Monitor is dead).
2. **The "RHR" code is actually the Recovery trend** — confusing if you
   read source, mostly harmless to a user.
3. **Same HRV trend rendered twice** (inline + sparkline).
4. **Classification labels (Low/Normal/Elevated) are absolute** —
   meaningless for a user whose normal HRV is 25 ms.
5. **No baseline comparison.** Despite a "vs week" delta, there's no
   reference band or personal mean shown on the chart.

---

## 8. `HomeDetailsScreen.tsx` — 139 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/HomeDetailsScreen.tsx`

Reachable at `/home-details`. Currently used as a "your day in review" page.

### 8.1 What it shows now

1. **DetailScreenHeader** — "Your Day in Review" + dateLabel subtitle.
2. **Headline GlassCard** — `homeView.todayOverview.headline` + `detail`.
3. **Live Heart Rate card** — `InlineLineChart` over `realtimeSamples`
   (BLE stream), empty label "Connect the strap for realtime heart
   rate".
4. **Breathing Disturbance card** — only when `odiPerHour != null`. Shows
   ODI value, "dips/hr" unit, zone label (Normal/Mild/Moderate/Elevated),
   ODI events tonight, and a disclaimer.
5. **Health Monitor · 5 Vitals card** — Resting HR, HRV, Respiratory
   Rate, Blood Oxygen, Skin Temp. Each row = label + value + optional
   delta text from sleepView.metrics.
6. **Derived Metrics card** — Stress, SpO₂, Skin Temp, Skin Temp Delta,
   Strain, Recovery, Training Load, Load Risk, SpO₂ Dips — basically a
   raw dump of `homeView.activities.*` fields.
7. **Recovery Confidence card** — Confidence, Pipeline, Source, Storage,
   Persistence + disclaimer.

### 8.2 Data sources

- `useDashboard()` — `homeView.todayOverview`, `homeView.activities`,
  `homeView.confidence`, `sleepView.metrics`.
- `useBleRealtimeSamples()` for the HR chart.

### 8.3 What's broken / weak

- **No header back button.** `DetailScreenHeader` is just title +
  subtitle; the screen relies on the native back gesture. Inconsistent
  with HealthMonitor/StressMonitor screens which DO have a CaretLeft.
- **Three of the cards are raw metric dumps.** Derived Metrics + Health
  Monitor + Recovery Confidence are flat key/value lists with no
  visualisations.
- **Live Heart Rate chart shows 0 axis context.** Just a wavy line.
- **Storage / Persistence / Pipeline / Confidence labels are
  developer-facing** ("Source", "Pipeline", "Persistence"). A real user
  would read this as gibberish.
- The "Breathing Disturbance" copy ("not a clinical diagnosis. Persistent
  high values may warrant a medical sleep study") sits inside a regular
  GlassCard — no distinguishing treatment for medical-grade caveat.
- Skin Temp appears in **both** the 5-Vitals card AND the Derived
  Metrics card.

### 8.4 User-facing weirdnesses

1. **Big page of nested cards with mostly raw labels** — feels like a
   debug screen, not a designed detail.
2. **Two cards repeat the same data** (Skin Temp and SpO2 show in 5
   Vitals + Derived Metrics).
3. **Developer-facing terminology** in the Recovery Confidence card
   (Pipeline / Storage / Persistence).
4. **Live HR chart is decorative** — no axis, no recent peak/min.
5. **No nav back affordance** — relies on iOS swipe; Android users may
   feel trapped.

---

## 9. `HomeMetricScreen.tsx` — 178 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/HomeMetricScreen.tsx`

Reachable at `/home-metric?metric=sleep|recovery|readiness|strain|stress|loadPressure|liveHeartRate|activities`.
This is the screen pushed when a user taps an individual tile on Home.

### 9.1 What it shows now

Switch on `metric` route param:

- **Title + subtitle** — hard-coded copy per metric.
- **An empty "Overview" card** — a GlassCard containing only the eyebrow
  `Overview` and nothing else. Always there (line 129).
- **A chart card** — InlineLineChart or BarSeriesChart, depending on
  metric. For `recovery`/`readiness`/`loadPressure` it uses
  `homeView.trendSummary.samples` (the SAME series). For `liveHeartRate`
  it uses `realtimeSamples`. For `sleep` it's a `BarSeriesChart` over
  `sleepView.durationTrend.samples` with `referenceValue = targetHours`.
- **A details YStack** — for `activities`: a raw KV list of all the
  `homeView.activities.*` strings. For `readiness/recovery`: the
  `homeView.confidence.*` block (Confidence / Pipeline / Source / Storage
  / Persistence). For everything else: 5 generic rows (Selected day,
  Daily Balance, Load Pressure, Sleep Reserve, Confidence).

### 9.2 Data sources

- `useDashboard()` — homeView + sleepView.
- `useBleRealtimeSamples()` and `useBleConnectionState()`.

### 9.3 What's broken / weak

- **The "Overview" card is empty.** Line 129–131 renders nothing inside
  a GlassCard with just the eyebrow `Overview`. Always present, always
  blank.
- **Three different metrics share the SAME chart series.** `recovery`,
  `readiness`, `loadPressure` all render `homeView.trendSummary.samples`.
  So a user tapping "Recovery" vs "Load Pressure" sees identical
  charts.
- **No back button** — same `DetailScreenHeader` pattern as
  HomeDetailsScreen.
- **Title/subtitle copy is hard-coded** and overlaps with content the
  user has already seen on Home.
- **liveHeartRate subtitle uses `noDataReasons.liveHeartRate`** if not
  connected — but the screen still renders the (empty) chart. Mixed
  signal.
- **Activities mode is just a dump of strings.** No structure, no
  filtering, no time scope.
- **`metric` param is loosely typed.** Any unknown metric falls through to
  `activities`, which is at least safe — but means a typo in a link silently
  swaps screens.

### 9.4 User-facing weirdnesses

1. **Empty "Overview" card** always present, never filled.
2. **Recovery / Readiness / Load Pressure all render the same chart.**
3. **No back button** in the header — only the OS gesture.
4. **The detail list under the chart is a raw KV dump** ("Selected day",
   "Daily Balance", "Load Pressure", "Sleep Reserve", "Confidence") —
   confusing because three of the five are also separate metric pages.
5. **Title/subtitle are static** while the chart is dynamic — e.g.
   Strain says "Daily load score on a 0 to 21 strain scale" but the
   chart axis isn't 0–21 (no axis at all).

---

## 10. `SleepPlannerScreen.tsx` — 494 LOC

`/Users/nish/Documents/noop/apps/app/app/screens/SleepPlannerScreen.tsx`

Reachable at `/sleep-planner` (presented as a formSheet — sheetGrabber +
20px corner radius). Pushed from the sleep-detail header alarm chip.

### 10.1 What it shows now

1. **Header row** — spacer + "Sleep Planner" title + close X button.
2. **Summary block** — TARGET SLEEP value (hrs) + WAKE TARGET clock time,
   side by side.
3. **Target Sleep card** — Moon icon, label, description, `− / value / +`
   stepper (15-min steps; clamped 360–600 min = 6–10 h).
4. **Wake Target card** — Sun icon, stepper for wake clock time (15-min
   wrap).
5. **Alarm toggle card** — Switch.
6. **Alarm Time card** — Only when alarmEnabled. Alarm icon, stepper for
   alarm clock (15-min wrap).
7. **Smart Wake toggle card** — Switch.
8. **Arm / Disarm Alarm button** — destructive style when armed; calls
   `armAlarm()`/`disarmAlarm()` from BleContext, toasts.
9. **Connection status caption** — "Strap connected" / "Strap alarm
   armed" / "Strap offline".

### 10.2 Data sources

- `useDashboard().sleepView.planner` for state + `saveSleepPlan` to
  persist via `/views/sleep-plan`.
- `useBle().armAlarm/disarmAlarm` for strap-side alarm command.
- `useBleConnectionState()`, `useBleStrapAlarmArmed()`.

### 10.3 What's broken / weak

- **Steppers are 15-min increments only.** No way to pick e.g. 7:23 AM
  or 7.5 hours of target sleep. For a precision-feeling tool, the
  fidelity is rough.
- **No scroll wheel / time-picker.** All adjustments are tap-stepper.
- **Saving is per-step.** Every `+` button call triggers a network
  `apiPut('/views/sleep-plan', ...)`. Multi-tap = multi-PUT.
- **Arm Alarm button works even when strap is offline.** The button
  doesn't disable on `connectionState !== "ready"`; it just toasts "Alarm
  armed" and the BLE command silently fails (or queues).
- **The "Target Sleep" sleep-reserve estimate**
  (sleepView.planner.sleepReserveText, estimatedSleepHours,
  smartWakeStatusText) is provided by the backend but never rendered.
- **Wake Target and Alarm Time can be set 12+ hours apart.** No
  validation (e.g. alarm should be within ±1 hour of wake target).
- **No visualisation.** The screen is form-only — no preview of when the
  alarm would fire vs the user's typical sleep window.
- **The close X also uses `router.back()`** but since the screen is
  presented as a formSheet, the OS sheet-grabber + dismiss-on-drag also
  works, giving three dismiss affordances.

### 10.4 User-facing weirdnesses

1. **15-minute-only steppers** — feels coarse compared to iOS time
   pickers.
2. **Arm Alarm button doesn't disable when the strap is offline** —
   "Alarm armed" toast can fire while disconnected.
3. **No preview of the alarm vs sleep window** — just numbers; no
   "you'll be woken 23 minutes before your usual wake time" insight.
4. **Backend supplies smartWakeStatusText, sleepReserveText,
   estimatedSleepHours, alarmStatusText** — all unused by the screen.
5. **No bedtime suggestion** — given target sleep + wake target you can
   compute it, but the screen doesn't show it.

---

## Cross-cutting issues

These problems span ≥3 of the screens above.

### A. Navigation system schism

Two navigators coexist; the live one (expo-router) and the dead one
(`@react-navigation/native` under `apps/app/app/navigators/`). Screens
that mix `navigation.navigate("HrvDetail")` with `router.push("/hrv-detail")`
have dead taps (HealthMonitor's HRV row). Audit every `useNavigation()` /
`navigation.navigate(...)` call in `app/screens/` against the active
routes in `src/app/(app)/`.

### B. Backend doesn't supply the data the screens promise

Three specific gaps:

1. **`HomeViewModel.monitors`** has no backend implementation. Every
   monitor field consumed by `HealthMonitorScreen` and `StressMonitorScreen`
   is filled by `deriveMonitorsFallback()` in
   `DashboardContext.tsx`. As a result: `inRangeCount` is fake (RR/SpO₂
   are always counted), `staleSinceMs` is always null, `lastReadingAt`
   is always null, `todayStrip` is always 12 nulls, `timeInZone` is
   always zeros.
2. **`HomeViewModel.activities.respiratoryRate`** does not exist. RR
   shows up only in `sleepView.metrics` (label "Respiratory Rate"), so
   any screen that reads activities (HealthMonitorScreen) shows `"--"`.
3. **`SleepViewModel.planner.smartWakeStatusText / sleepReserveText /
   estimatedSleepHours / alarmStatusText`** are computed backend-side
   and not rendered by the planner screen.

### C. Duplicate / redundant charts

- `StrainActivityScreen` renders the strain 7-day series TWICE — once
  as `InlineLineChart`, once as `TrendSparkline`, in adjacent cards.
- `HrvDetailScreen` renders the HRV 7-night series TWICE — once as
  `InlineLineChart` in a card, once as a `TrendSparkline` in the bottom
  card.
- `HomeDetailsScreen`'s "5 Vitals" card and "Derived Metrics" card both
  surface Skin Temp / SpO₂ values from different source paths.

### D. Charts without axes, legends, or scale

- `HealthScreen` Trend View — floating dots, no axes.
- `TrendsScreen` cards — line charts but no axis labels.
- `HrvDetailScreen` and `StrainActivityScreen` inline charts — same.
- `MetricHomeScreen` — same.
- `HomeDetailsScreen` Live HR — same.

Few of these visualizations carry numeric context. Time/value scales
are inferred from the cards' eyebrow text only.

### E. Empty/never-populated UI elements

- `HealthScreen` — "VIEW YOUR PLAN →" link with no onPress.
- `HealthMonitorScreen` — RR row hard-coded "--"; HRV row's nav target is
  broken; Info icon non-interactive.
- `StressMonitorScreen` — `todayStrip` always 12 nulls; `timeInZone`
  always zeros; `lastReadingAt` always null; Info icon non-interactive.
- `HomeMetricScreen` — empty Overview card always rendered.
- `SleepPlannerScreen` — backend planner status strings never rendered.

### F. Header inconsistency

Some detail screens use `DetailScreenHeader` (title + subtitle, no back
button: `HomeDetailsScreen`, `HomeMetricScreen`). Others use
`ScreenHeader` (with built-in scrollY animation:
`SleepDetailScreen`, `StrainActivityScreen`, `HrvDetailScreen`). Others
roll their own nav bar (`HealthMonitorScreen`, `StressMonitorScreen`).
The Health tab itself (`HealthScreen`) builds a third unique header
with its own CaretLeft, info dialog, and a week strip.

Result: every detail screen has a different back-button affordance (or
none) and a different title typography (some uppercase "HEALTHSPAN", some
title-case "Strain", some hybrid "Sleep · Wed, May 28").

### G. Date selection is global

`useDashboard().selectedDate` is the only date pointer. `SleepDetailScreen`
displays a date from `route.params?.date` in its title, but the data it
reads (`sleepView`) is keyed off the *dashboard's* selectedDate.
`TrendSparkline.onPressPoint = (d) => setSelectedDate(d)` causes data
under a screen to swap without the title updating. The "go back to home"
gesture also leaves Home pointed at the day the user last drilled into
from any detail screen — surprising.

### H. Visual treatment vs theme

The Health tab uses a unique colour story (radial-gradient orb, green/orange
accent, large 56-px age number, custom Phosphor icons) that doesn't
appear anywhere else in the app. The monitor detail screens use a flat
status-tint hero. Sleep/Strain detail screens use `MetricHero`/`SleepHero`
with a much smaller hero number. Trends screen uses a SwiftUI native chart
with completely different chart styling from `InlineLineChart`. No two
detail screens look like they're from the same product.

### I. Internal terminology in user-facing copy

- "candidate", "off-wrist", "No Data" in StrainActivity.
- "Pipeline", "Storage mode", "Persistence health", "Source blend" in
  HomeDetailsScreen + HomeMetricScreen.
- "Pace of Aging", "RMSSD" without explanation in HealthScreen.
- Factor tags (e.g. `CAFFEINE_LATE`, `STRESS_HIGH`) in SleepDetailScreen's
  WhyPanel.

### J. Charts on Android

`TrendsScreen` uses `@expo/ui/swift-ui`'s `Chart`. That's iOS-only.
Android renders nothing useful in those 8 cards.

### K. Loading and error states are global ActivityIndicators

`HealthScreen` blocks the entire screen with a centred spinner.
`TrendsScreen` renders cached content while loading, which is correct.
`SleepDetail`, `Strain`, `Monitor*` screens all rely on the
DashboardContext's `isRefreshing` state being surfaced to a pull-to-refresh
spinner only — they render `"--"` placeholders while loading. No
intermediate skeletons. A first-load user sees a card grid of dashes
that quietly fills in.

### L. Tap targets / pressables

Several "obviously tappable" surfaces have no handler:

- HealthScreen: "VIEW YOUR PLAN" link.
- HealthMonitorScreen: Info icon, RHR/RR/SpO₂ rows.
- StressMonitorScreen: Info icon.
- HrvDetailScreen: every VitalCard.
- SleepDetailScreen: the score / hero is non-interactive (a user might
  expect "tap for details" given the dense info-graphic).
- HomeDetailsScreen: every metric row.

### M. Prior plan artefacts still partially applied

- `2026-04-07-sleep-detail-redesign.md` envisaged removing the Sleep tab
  and pushing SleepDetail from Home — that's done.
- `2026-05-16-home-monitors-redesign.md` introduced the MonitorCard +
  Health/Stress monitor detail screens — those exist but the backend
  contract (`monitors` block + `todayStrip` + `timeInZone`) was never
  implemented backend-side. The fallback in `DashboardContext` is
  effectively the only data source, and it's mostly nulls/zeros.
- `2026-05-10-sleep-detail-v1.5.md` (not opened in this audit but
  reachable in `docs/superpowers/plans/`) likely covers refinements that
  may or may not be live.
