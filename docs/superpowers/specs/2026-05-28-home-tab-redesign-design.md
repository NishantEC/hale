# Home tab redesign — design spec (2026-05-28)

Targeted improvements to the home tab. **This is not a rewrite.** The home is largely working; six discrete adjustments tighten it up. One adjustment (date switcher → native ContextMenu) ships as an A/B-able experiment so we can compare feel without losing the existing component. One adjustment unlocks an entire new detail screen (Recovery).

Foundational reading:
- `docs/user-journey-and-feature-graph-2026-05-28.md` — § J1 / morning decision moment
- `docs/secondary-screens-master-plan-2026-05-28.md` — § 4.1 Home, § 6 backend contract
- `docs/competitor-screens-research-2026-05-28.md` — patterns 3.1, 3.2, 3.3, 3.7, 3.15

Audience: implementation plan (next step). Every change here is testable, scoped, and reversible.

---

## 1. Why

J1 ("Am I ready to push today?") is the most-opened question. The home tab is its primary surface. Today it answers J1 correctly **for the headline number** but leaves three gaps:

| Gap | User-visible symptom |
|---|---|
| Stress monitor `--` | Right half of the monitor row is dead. Backend never sends `monitors.stress`. |
| No baseline anchor | Rings show raw score (84, 76, 12.4) without telling the user whether that's better or worse than usual. |
| Recovery drill lands on a generic screen | Tap on Recovery ring opens `HomeMetric` — a metric-agnostic detail with no contributors. The user can see the value but not *why*. |

Adjacent friction: % suffix on the rings implies they're percentages. They aren't. Misframing.

---

## 2. Scope

Six changes. Three depend only on the app; one depends on a backend contract addition; one is a new detail screen; one is a non-blocking experiment.

| # | Change | Layer | Reversible? |
|---|---|---|---|
| 1 | DateSwitcher → native ContextMenu (experiment) | app | Yes — original `DateSwitcher` retained; feature-flagged |
| 2 | Drop %-suffix on ring labels + add 7-day delta caption | app | Yes — pure render change |
| 3 | Recovery ring tap routes to new Recovery detail screen | app + new screen | Yes — revert routing to `HomeMetric` |
| 4 | Stress monitor card populated from real backend data | backend + app | Yes — fallback path stays |
| 5 | "last reading 2m ago" caption on both monitor cards | backend + app | Yes — caption hidden when null |
| 6 | Floating + button → native ActionSheet for quick log | app | Yes — separate component, can be hidden |

**Out of scope** (deferred or already-on-track):
- Rebuilding `MetricRingsRow` from scratch
- Replacing SVG ring with native iOS 17 `Gauge` (potential future native swap)
- Changing the home → detail navigation animation
- Onboarding / first-run experience
- Any backend pipeline change (already shipped earlier this session)

---

## 3. Detailed design

### 3.1 DateSwitcher → native ContextMenu (experiment, reversible)

**Today:** Custom `DateSwitcher` component at top of home — title text + prev/next caret + tap-to-open-calendar.

**Target experiment:** Long-press on the date opens a native ContextMenu (`@expo/ui/swift-ui` `ContextMenu` on iOS; `@expo/ui/jetpack-compose` `Menu` on Android) with: "Yesterday", "Today", "This Week", "Open Calendar", "Jump to Date…". The tap-to-open-calendar gesture stays. Forward/back chevrons stay.

**Implementation discipline:**
- New file `apps/app/app/components/NativeDateSwitcher.tsx` — uses native ContextMenu
- Existing `DateSwitcher.tsx` stays in the tree, unused but importable
- HomeScreen selects via env flag `EXPO_PUBLIC_HOME_NATIVE_DATE=1` (default: off)
- Both compile against the same prop shape so the swap is one-line in HomeScreen
- If the native variant feels worse, the env flag flips and we ship the original

**Success criteria:**
- Long-press surfaces a native menu with the four quick-pick items
- Forward / back / calendar-tap still work identically
- Visual chrome (background, text colour, spacing) matches DateSwitcher pixel-for-pixel when menu is closed
- Tap-to-open-calendar still works when no long-press is detected

### 3.2 Rings — drop %-suffix, add delta caption

**Today:** Each ring renders the value (e.g. `84`) inside the ring with the metric label below. No % suffix today on the ring face — but adjacent copy elsewhere on the home calls it "Sleep 84%". That's the inconsistency we kill.

**Target:**
- Ring face: composite score, no % anywhere (e.g. `84`, `76`, `12.4`)
- Below the metric label, a small (10px) coloured ▲/▼/flat caption against the user's 7-day average:
  - `▲ +5` (green) — value is above 7-day avg
  - `▼ -3` (red) — value is below 7-day avg
  - `flat` (muted) — within ±1 unit of 7-day avg
- Strain caption: `▲ +1.6`-style (one decimal — same precision as the headline number)

**Per-ring value source for delta math:**

| Ring | Today's value | 7-day baseline source |
|---|---|---|
| Sleep | `dailyScore.sleepScore` (composite 0–100) | Average of `dailyScore.sleepScore` from last 7 calendar days |
| Recovery | `dailyScore.dailyBalance` (0–100) | Average of `dailyScore.dailyBalance` from last 7 calendar days |
| Strain | `dailyMetric.strainScore` (0–21) | Average of `dailyMetric.strainScore` from last 7 calendar days |

**Data dependency:** The view-model exposes `rings[].value` for today and needs a new `rings[].sevenDayAverage` field. Extend `HomeViewModel.rings` in `views.service.ts`.

**Component touchpoints:** `MetricRingsRow.tsx`, `ringTrio` mapper in `HomeScreen.utils.ts`.

**Success criteria:**
- No `%` suffix anywhere in the rings area
- Delta caption renders within `ringSleep`, `ringRecovery`, `ringStrain` rings
- Caption colour matches sign (green = up, red = down, muted = flat) — uses `colors.statusGreen` / `colors.statusRed` / `colors.textDim` from `localTheme.ts`
- When the user is brand-new (< 7 nights of data), caption reads "calibrating · 3 nights left" instead

### 3.3 Recovery ring tap → new Recovery detail screen

**Today:** Tap on Recovery ring routes to `HomeMetric` screen (a generic per-metric detail). Same screen serves Sleep / Strain.

**Target:**
- New screen `RecoveryDetailScreen.tsx` at route `/recovery-detail` (expo-router)
- HomeScreen rebinds the Recovery ring's `onPress` to `router.push("/recovery-detail")`
- Sleep and Strain rings stay where they are (Sleep → `/sleep-detail`, Strain → `/strain-activity`)

**Recovery detail screen contents** (top to bottom):

| Section | Component | Notes |
|---|---|---|
| Header (back, title "Recovery", date) | Existing `ScreenHeader` | Match Sleep detail header treatment |
| Hero ring | `GlowScoreCard` (existing primitive) | Large recovery score + verdict word + 1-sentence personalised paragraph |
| Contributor list — vs last 7 days | New `ContributorList` rendering `NumBlock` rows | Each: HRV / RHR / Respiratory Rate / Sleep performance — current value · 7d avg · delta arrow |
| Contributor list — vs last 30 days | Same `ContributorList`, different data | Dual baseline (Whoop pattern 3.3) |
| Trend cards | One TrendCard per contributor (sparkline) | 7-day point-labelled chart, today shaded — pattern 3.4 |
| "What is Recovery?" explainer card | Static card | Educational — opens a SafeAreaView modal explaining the algorithm |
| "Ask about Recovery" CTA | Disabled stub | Routes to future AI Coach. For now visible-but-disabled to set expectations. |

**Success criteria:**
- Tap on Recovery ring opens the new screen
- Screen renders all sections from data already on `HomeViewModel.todayOverview` + `HomeViewModel.activities` + `HomeViewModel.trendSummary` (no new backend fields required for first ship)
- Back button returns to home with state preserved
- "Calibrating" state shown when baseline isn't warmed up

### 3.4 Stress monitor card populated (backend contract)

**Today:** `HomeViewModel.monitors.stress` is never sent. Client-side `deriveMonitorsFallback()` returns nulls; the home Stress card shows `--` permanently.

**Target — backend contract addition in `views.service.ts`:**

```ts
monitors: {
  health: {
    state: "ok" | "warn" | "alert" | "stale"
    verdict: string
    inRangeCount: number
    totalMetrics: number
    lastReadingAt: string | null  // ISO timestamp — NEW; replaces / adds-to existing staleSinceMs
  }
  stress: {
    state: "ok" | "warn" | "alert" | "stale"
    score: number | null          // 0-100, current stress index
    zone: "Calm" | "Moderate" | "High" | null
    lastReadingAt: string | null  // ISO timestamp of most recent sensor sample
    todayStrip: Array<number | null>  // 24 hourly stress index buckets
    timeInZone: {
      calm: number      // minutes
      moderate: number
      high: number
    }
  }
}
```

Both monitor objects expose `lastReadingAt` for §3.5's freshness caption. Health monitor's existing `staleSinceMs` becomes a derived getter on the client (`now - lastReadingAt`) so callers that already use it don't break, but the canonical field is `lastReadingAt`.

**Stress index calc (Phase 1, simple):**
- Per-hour bucket of `raw_sensor_records` within the user's selected day (timezone-aware)
- For each hour, compute `stress = clamp((HR - restingHeartRate) / (maxHeartRate - restingHeartRate) * 100, 0, 100)`
  - Excludes records during sleep windows (use `sleep_detections.bedtime / wakeTime` to filter)
  - Excludes off-wrist intervals (use device events 7/8/9/10)
- Day's headline score = median of populated hour buckets
- Zone thresholds: `<35 Calm`, `35-65 Moderate`, `>65 High`
- `timeInZone` = sum of minutes per zone across populated buckets

**Home Stress card behaviour:**
- Headline: score (e.g. `27`) and zone word (`Calm`)
- Sub-caption: `last reading 2m ago` (from `lastReadingAt`) when score is non-null
- Stale state: `Stale · 4h ago` (yellow tint) when `lastReadingAt > 30 min` old
- Null state: still falls back to `--` with `No reading` caption (matches current behaviour during cold start)

**Success criteria:**
- Backend deploy with this change makes the home Stress card show a real number for users with raw sensor data in the last 24h
- `HomeMetricRing.stress` view-model passes type check
- The card's tap target opens the existing `StressMonitorScreen` (no change to routing)
- A user with no raw sensor data in the day still sees the fallback `--` cleanly

### 3.5 Monitor cards — "last reading" freshness caption

**Today:** Health and Stress monitor cards have no freshness indicator. User can't tell whether the value is from 30 seconds ago or 6 hours ago.

**Target:**
- Both `MonitorCard`s gain a sub-caption rendering `last reading {relative_time}` from `monitors.{health|stress}.lastReadingAt`
- Format: `2m ago` / `45m ago` / `3h ago` / `1d ago`
- When > 4h ago, caption colour shifts to `colors.statusAmber` and prefixes with `Stale ·`
- When null, caption is omitted (no "last reading null")

**Component touchpoint:** `apps/app/app/components/home/MonitorCard.tsx` — extend props with `lastReadingAt?: string | null`.

**Success criteria:**
- Caption renders correctly for all three states (fresh, stale, null)
- Time formatting matches existing relative-time helper (`relativeTime.ts`)
- Card height adjusts to accommodate the new caption row without truncating other content

### 3.6 Floating + button → native ActionSheet quick log

**Today:** No quick-log affordance on home. Adding an activity / journal entry requires opening Settings or another tab.

**Target:**
- New `ComposeButton.tsx` component, absolutely-positioned bottom-right of home
- 52px circular button, white background, dark `+` glyph (matches existing button vocabulary in `localTheme.ts`)
- Tap behaviour:
  - iOS: opens native `ActionSheetIOS.showActionSheetWithOptions` with: `Add activity`, `Log journal entry`, `Plan bedtime`, `Start session`, `Cancel`
  - Android: opens `@gorhom/bottom-sheet` (already a dep) with the same options as a list

**Action routing:**
| Option | Route |
|---|---|
| Add activity | `router.push("/strain-activity?mode=add")` (or a dedicated `/add-activity` if simpler) |
| Log journal entry | `router.push("/journal-entry?date=today")` |
| Plan bedtime | `router.push("/sleep-planner")` |
| Start session | Disabled stub for now — routes nowhere (visible item with grey tint, no action) |

**Discipline:**
- Component lives independent of `HomeScreen.tsx` — can be removed by deleting one mount line
- No state lives in the button — it's a pure dispatcher

**Success criteria:**
- Button visible at bottom-right of home, always-on-top of scroll content
- iOS opens system ActionSheet; Android opens BottomSheet
- Each option routes correctly (Start session is the only stub)
- Long-press has no special behaviour (single-tap only)

---

## 4. Components introduced / changed

| Path | Status | Purpose |
|---|---|---|
| `apps/app/app/components/NativeDateSwitcher.tsx` | NEW | Native ContextMenu variant of DateSwitcher |
| `apps/app/app/components/DateSwitcher.tsx` | KEEP | Existing — retained for env-flag rollback |
| `apps/app/app/components/home/MetricRingsRow.tsx` | EDIT | Drop % suffix; render delta caption |
| `apps/app/app/components/home/MonitorCard.tsx` | EDIT | Add `lastReadingAt` prop + caption rendering |
| `apps/app/app/components/ComposeButton.tsx` | NEW | Floating + with native ActionSheet |
| `apps/app/app/screens/RecoveryDetailScreen.tsx` | NEW | Recovery hero + contributor list + trend cards |
| `apps/app/src/app/(app)/recovery-detail.tsx` | NEW | expo-router stub mounting the screen |
| `apps/app/app/screens/HomeScreen.tsx` | EDIT | Rebind Recovery ring tap; mount ComposeButton; swap DateSwitcher via flag |
| `apps/backend/src/views/views.service.ts` | EDIT | Populate `monitors.stress` real data |
| `apps/backend/src/views/views.service.spec.ts` | EDIT | Tests for the new stress monitor field |
| `apps/app/app/context/DashboardContext.tsx` | EDIT | Trust backend `monitors.stress` when present; fallback path stays for null |

---

## 5. Backend dependencies

Only one: §3.4 stress-monitor field on `HomeViewModel`. The aggregation logic touches `raw_sensor_records` (filtered by sleep + off-wrist), the user's `baseline_profiles` (for RHR / max HR), and `device_events` (for off-wrist intervals). All those tables exist; no migration needed.

**Risk:** Backend pipeline computes per-day aggregates; the home is requested per-tab-open. If the per-tab-open computation is too slow, we cache `monitors` on `daily_metrics` and the view-model just reads it. For Phase 1 we compute on read (a single SQL aggregation, ≤ 50 ms expected). Re-evaluate if it bites.

---

## 6. Tests

| Layer | Test |
|---|---|
| Rust worker | No changes — sleep_detect / activity_detect / wellness already shipped. |
| Backend (Jest) | `views.service.spec.ts` — assert `monitors.stress.score`, `zone`, `lastReadingAt`, `todayStrip`, `timeInZone` populated for a user with synthetic raw + sleep + device-event fixture |
| Backend (Jest) | Same — assert null/fallback when the user has no raw data in window |
| App (Jest) | `MonitorCard.test.tsx` — renders score + zone + last-reading caption when monitors.stress is populated; renders `--` + No reading when null |
| App (Jest) | `MetricRingsRow.test.tsx` — renders delta caption in correct colour for above/below/flat; renders calibrating state when nights-used < 7 |
| App (Jest) | `RecoveryDetailScreen.test.tsx` — renders contributor rows from `HomeViewModel.activities`, hero + verdict + sentence, calibrating state |
| App (Jest) | `ComposeButton.test.tsx` — tap opens ActionSheet (mocked); each option dispatches to the correct route |
| App (Jest) | `NativeDateSwitcher.test.tsx` — long-press surfaces the ContextMenu; quick-pick options route to the expected date |
| Flag check | Backend spec covers both `monitors.stress` populated and falsy paths; app test covers both ContextMenu variant and original variant via env flag |

---

## 7. Rollback plan

Every change has a single-toggle revert:

| # | Revert lever |
|---|---|
| 1 | Set `EXPO_PUBLIC_HOME_NATIVE_DATE=0`; ship — falls back to `DateSwitcher` |
| 2 | Remove the delta caption block from `MetricRingsRow.tsx` |
| 3 | Change the Recovery ring `onPress` back to `navigateTo("HomeMetric", "home-metric", { metric: "recovery" })` |
| 4 | Backend: ship without the stress aggregation; `monitors.stress` remains undefined; client fallback handles it |
| 5 | Remove the `lastReadingAt` prop usage on MonitorCard |
| 6 | Delete the `ComposeButton` mount line from `HomeScreen.tsx` |

---

## 8. Open product decisions

These remain open and don't block the spec:

- **Start session quick-log option:** stub disabled for now or hide entirely? Recommendation: visible-but-disabled with a "Coming soon" caption. Tells users it's in the roadmap without leaving an option that does nothing.
- **Stress aggregation Phase 2:** when do we move to a precomputed `daily_metrics.stress_*` field instead of on-read aggregation? Recommendation: only if read latency > 100ms in prod after rollout.
- **Recovery detail "Ask about Recovery" CTA:** ship as disabled stub or hide entirely? Recommendation: ship as disabled — gives users the visual cue that coaching is coming.

---

## 9. Non-goals

- **No `MetricRingsRow` rewrite.** We edit; we don't rebuild.
- **No new ring visual style.** No iOS 17 `Gauge`, no SwiftUI Chart replacement. Existing SVG rings stay.
- **No Tamagui theme change.** Every colour resolves via `localTheme.ts` tokens.
- **No new tab.** Recovery detail is a stack screen accessed by tap, not a tab.
- **No journaling implementation.** Journal entry route in §3.6 points at the existing screen; the redesign of that screen is out of scope.

---

## 10. Success — when this is done

Three observable outcomes:

1. **Stress monitor card on the home tab shows a real number** for users with recent raw data — the dead `--` is gone.
2. **Tapping the Recovery ring opens a dedicated Recovery detail screen** with HRV/RHR/RR/Sleep contributors against 7-day and 30-day baselines — Whoop's signature pattern, finally on noop.
3. **Native ContextMenu experiment is testable** — a single env flag flips between the existing DateSwitcher and the native variant, letting us learn whether the native pattern feels better without losing the option.

Everything else (delta captions, freshness label, floating +) is polish around those three outcomes.

---

End.
