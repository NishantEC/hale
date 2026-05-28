# Secondary screens master plan — 2026-05-28

The Home screen works. Every other screen (Health, Inspector tab, the various detail surfaces, Settings) is below the bar set by Whoop / Oura / Ultrahuman / Apple Health / Bevel. This document is the single source of truth for what's wrong, what good looks like, and what to ship — written as the spec the implementation work will be carved out of in future sessions.

**Foundational reading** (don't duplicate these — they're the deep dives this plan stands on):
- `docs/competitor-screens-research-2026-05-28.md` — 12-app, ~750-line research with patterns
- `docs/current-secondary-screens-audit-2026-05-28.md` — line-anchored audit of every current screen
- `docs/knowledge-base-inventory-2026-05-28.md` — what's still load-bearing in the existing knowledge base

**Scope** — research + plan, no implementation. Every recommendation here is a follow-up session's work.

---

## 1. The two facts that change everything

### 1.1 The IA is already collapsed

Per the 2026-05-24 redesign spec the live IA is **four tabs**:

| Tab | Live route | Status |
|---|---|---|
| Home | `src/app/(app)/(tabs)/index.tsx` | ✅ Working |
| Health | `(tabs)/health.tsx` → `HealthScreen` | ⚠️ Weak — see §3 |
| Inspector | `(tabs)/inspector.tsx` → `DebugInspectorScreen` | ⚠️ Dev-tool, surfaces are wrong |
| Settings | `(tabs)/settings.tsx` | ⚠️ Sparse |

**Trends is dead.** `TrendsScreen.tsx` (357 LOC) is referenced only by `apps/app/app/navigators/MainNavigator.tsx`, which is the stale RN-Navigation router. No `trends.tsx` route exists in the live expo-router. If you've been seeing a Trends screen at all, it's only because the stale navigator is still bundled — it's not actually reachable in the running app. **Delete the file once the Health tab absorbs its responsibilities.**

The Trends screen used iOS-only `@expo/ui/swift-ui` Chart anyway — silently broken on Android — so it's not a loss.

### 1.2 The monitors backbone is missing on the backend

`HomeViewModel.monitors` (the field that powers Health monitor + Stress monitor screens) **is never populated by the backend**. A client-side fallback in `DashboardContext.deriveMonitorsFallback()` invents nulls/zeros:
- `inRangeCount` is fake (RR + SpO₂ are always counted in-range)
- `todayStrip` is permanently 12 empty cells
- `timeInZone` is permanently `0m / 0m / 0m`
- `lastReadingAt` never appears
- `staleSinceMs` is always null

This is the root cause of "the monitors look weird" — they are showing fabricated stand-in data. **The single highest-impact fix is the backend monitors contract.** See §6.

---

## 2. The locked design vocabulary

The 2026-05-24 redesign spec locked these primitives. Use these everywhere, do not invent new ones:

| Primitive | When to use |
|---|---|
| **GlowScoreCard** | The hero on every score detail (Recovery / Sleep / Strain / Stress). Radial glow behind a big number. |
| **GlowTile** | Square mini-card for grids (Health tab grid; week-strip cells). |
| **NumBlock** | "Today value + smaller baseline + delta arrow" row. Reusable contributor row. |
| **ContributorList** | The list of NumBlocks below a hero. |
| **StatusBadge** | The verdict word ("Optimal / Fair / Pay attention" / a color chip). |
| **TrendCard** | Self-contained card with title + sparkline + caption + drill-in chevron. |

**Tone:** pitch-black UI, telegraphic copy, numbers always carry units, no marketing voice. Per the knowledge-base inventory: "debugger-grade chrome, tables ubiquitous, file-path-with-line-anchors style".

---

## 3. The seventeen recurring rules of the genre

Twelve apps later, the design vocabulary converges to a tight set. Every secondary screen in noop must conform to these (numbered to match `competitor-screens-research-2026-05-28.md` §12):

| # | Rule | One-line implementation |
|---|---|---|
| 3.1 | **Score + verdict + sentence** | Big number → categorical word → 1-3 personalised sentences using today's data. |
| 3.2 | **Contributor list primitive** | After the hero, 3-7 rows. Each: icon · label · big value · baseline-with-delta-arrow · chevron. |
| 3.3 | **Two reference frames** | Today vs 7-day **and** today vs 30-day, side by side. Never single value with no anchor. |
| 3.4 | **Chart + scrubber + caption** | Every chart: D/W/M/Y selector, point labels OR tap-and-hold scrubber, highlighted "today" column, plain-English caption. |
| 3.5 | **Day-strip mini-scrubber** | Every secondary screen has a `< TODAY >` strip at the top, doubling as a sparkline. Date is global across tabs. |
| 3.6 | **Hero ring / gauge** | Full ring for percentages, half-arc with needle for zoned scores (stress, recovery). |
| 3.7 | **Colour encoding** | Green = good · Yellow = fair · Red = pay attention · Blue = strain/intensity · Purple = sleep · Pink = HRV. |
| 3.8 | **Journal / tags** | Yes/no checklist with conditional follow-ups (Whoop) **and** pill tag chooser (Oura). At least 50 behaviours. |
| 3.9 | **Insights as "X% impact"** | "Days you did X had Y% change in Z". Bar chart anchored at 0%, hurts left / helps right. |
| 3.10 | **Coach / chat as explanation** | Every detail screen has a "Ask about this" CTA that opens chat pre-seeded with the screen's metric. |
| 3.11 | **Coaching cards vs explainer cards** | Educational cards have a distinct border treatment. Insight cards have a bold emoji headline. |
| 3.12 | **Empty / calibrating states** | Never show 0%. Show "Calibrating · N days remaining" with a dashed ring. |
| 3.13 | **Notifications / coaching tips** | Tips live inline on detail screens. Push only for material drops ("Recovery dropped 27%, tap to see why"). |
| 3.14 | **Settings universals** | Notifications, Goals, Integrations, Data export, Coach settings, Hide metrics, Share Health Report (PDF). |
| 3.15 | **Cross-cutting micro-interactions** | Floating "+" creation, info-(i) modals, share icon, pull-to-refresh, global day picker. |
| 3.16 | **Information density** | Hero / Contributors / Coaching / Trend / Chat-CTA — top to bottom. |
| 3.17 | **Avoid known failures** | No reference-less scores · no axisless charts · no "what is this?" link as sole explanation · no goal rings that cap at 100%. |

---

## 4. Screen-by-screen plan

### 4.1 Home (✅ working — minor polish only)

Keep as-is. Two minor adds:
- **Global day-picker strip** at the very top — `< TODAY >` with calendar popover. Should persist when navigating to Health / detail screens (rule 3.5).
- **Floating "+" action button** — opens "Add Activity / Log Journal / Plan Bedtime" (rule 3.15).

### 4.2 Health tab — the biggest rebuild

**Current state** (`HealthScreen.tsx`, 676 LOC):
- Radial-gradient orb that doesn't match any other screen
- "Pace of Aging" + RMSSD with no explainer
- "VIEW YOUR PLAN →" link that does nothing
- "Trend View" = floating dots with no axes, gridlines, or labels
- Week strip with no values, just dots

**Target state — Whoop's "Health Monitor" + Bevel's "Vitals" + Ultrahuman's grid hybrid:**

1. **Global day-picker strip** (rule 3.5)
2. **Hero GlowScoreCard**: "Healthspan score" or "Health Monitor" — 0-100 with verdict + 1-2 sentence personalised explanation
3. **Vitals grid (GlowTile × 8)**:
   - RHR · HRV · RR · SpO₂ · Skin Temp · Sleep Quality · Recovery 7d Avg · Stress Today
   - Each tile shows: metric · today value · sparkline · 7d delta arrow
   - Tap any tile → that metric's detail trend screen
4. **"VS. PREVIOUS 30 DAYS" + "VS. LAST 7 DAYS"** ContributorList sections (rule 3.3) — the Whoop dual-baseline pattern is the strongest in the category
5. **"What is Healthspan?" explainer card** with the calibration count if relevant (rule 3.12)
6. **Trend cards** at the bottom — one per long-term metric (Pace of Aging, Cardio Fitness, Body Battery) with point-labelled line charts
7. **"Chat about your health" CTA** (rule 3.10)

**Kill**: the orb (replace with GlowScoreCard), the floating-dots trend view, the dead "VIEW YOUR PLAN" link.

### 4.3 Stress Monitor detail (HOME → tap monitor → detail)

**Current state** (`StressMonitorScreen.tsx`, 196 LOC):
- Stress score number rendered
- 12-slot today strip — **permanently empty** (monitors not on backend)
- Time-in-zone strip — **permanently `0m / 0m / 0m`**
- Info icon non-interactive

**Target state — Ultrahuman's "Stress Rhythm" + Oura's "Daytime Stress":**

1. Day-picker strip
2. **Half-arc gauge** (rule 3.6) with needle showing current stress; bands: Calm / Moderate / High
3. **Verdict + sentence**: "Calm afternoon · Your stress is in the lower half of today's range"
4. **24-hour line chart** with workout/sleep markers (Oura pattern) — tap-and-hold scrubber (rule 3.4)
5. **Time-in-zone stacked horizontal bar** vs last-7-day average (rule 3.3)
6. **ContributorList**: Today peak · Today avg · Recovery effect · Sleep quality
7. **Coaching card**: "Take a 5-min breath break" CTA (rule 3.11)
8. **"Ask about stress"** chat CTA
9. **"How is this measured?"** explainer

**Backend dependency:** real `monitors.stress.todayStrip` (24 hourly buckets with HR + HRV stress index), real `timeInZone`.

### 4.4 Health Monitor detail

**Current state** (`HealthMonitorScreen.tsx`, 159 LOC):
- `inRangeCount` is fake — RR/SpO₂ always counted regardless of value
- RR row hard-coded `"--"` (it's not in `homeView.activities`, only in `sleepView.metrics`)
- HRV row's `navigation.navigate("HrvDetail")` is a dead nav target
- Info icon dead

**Target state — Whoop's "Health Monitor" tile:**

1. Day-picker strip
2. **GlowScoreCard** with "N of 5 vitals in range" + verdict
3. **5 VitalRows** (each interactive, drilling to per-metric detail):
   - RHR · HRV · RR · SpO₂ · Skin Temp
   - Each shows: today value · personal range bar fill · "within / above / below normal" verdict pill (rule 3.2)
4. **24-hour overlay**: small composite chart showing all 5 metrics on a shared time axis (Bevel's "Vitals" pattern)
5. **"vs last 7 days" + "vs last 30 days"** dual-baseline sections (rule 3.3)
6. **Explainer card** for each vital reachable via the info-(i) icon
7. **Calibration state** for new users — "Your normal range will lock in after 14 nights" (rule 3.12)

**Backend dependency:** add `respiratoryRate` to `activities` (currently only in sleepView); fix `inRangeCount` to actually compute against personal range; populate `monitors.health.todayStrip`.

### 4.5 Sleep detail (HOME → tap night → detail)

**Current state** (`SleepDetailScreen.tsx`, 329 LOC):
- Title from `route.params.date` but data swaps with `selectedDate` on sparkline-point taps → desync
- `WhyPanel` shows raw factor tags like `CAFFEINE_LATE` to the user
- No HR-over-night line
- No hatched typical-range overlay

**Target state — Whoop's Sleep tab is the gold standard:**

1. Day-picker strip
2. **GlowScoreCard hero**: sleep score + verdict ("A good night's sleep") + 2-sentence personalised paragraph (rule 3.1)
3. **Sleep needed vs got** card with stacked horizontal bar: actual sleep on top, hatched typical range below (Whoop's #1 differentiator)
4. **Sleep architecture stacked bar** — Awake / Light / Deep / REM as horizontal stacked bar with time labels (rule 3.6 multi-arc variant)
5. **Hypnogram strip** — the timeline below the bar, showing transitions per 5-min epoch (TIDE / Eight Sleep pattern)
6. **HR-over-night line chart** with bedtime/wake/midnight markers
7. **Respiratory rate small chart** — flat-line for the night with the night avg
8. **ContributorList — VS. LAST 7 NIGHTS**: HR drop, sleep efficiency, restorative %, disturbances
9. **"Why this night?" panel** — translate the raw factor tags to human language: `CAFFEINE_LATE` → "Caffeine after 2pm" with an "X% impact" bar (rule 3.9)
10. **Journal entry CTA**: "Log how this night felt" → opens journal entry for this date

**Bug to fix immediately:** decouple `route.params.date` from `selectedDate`. SleepDetail should set the dashboard's selectedDate to its own date on mount, not the other way around.

### 4.6 Strain / Activity detail

**Current state** (`StrainActivityScreen.tsx`, 322 LOC):
- Strain 7-day series rendered TWICE (`InlineLineChart` + `TrendSparkline` adjacent)
- "candidate", "off-wrist", "No Data" labels leak internal terminology
- No Borg-scale gauge

**Target state — Whoop's Strain tab:**

1. Day-picker strip
2. **GlowScoreCard hero**: strain value 0-21 on the Borg scale + verdict + paragraph
3. **0-21 zone gauge** with the current point marked and named bands (Light / Moderate / Strenuous / All Out)
4. **Activities list**: each activity is a chip row — `12.6  RUN  6:30 AM → 7:42 AM  HR avg 142`
5. **ContributorList — vs 7d / vs 30d**: Avg HR, Max HR, Calories, Active Minutes
6. **TrendCard** at the bottom — single bar chart, point-labelled (Whoop pattern), with today highlighted (rule 3.4) — NOT two charts
7. **Heart-rate-zone time** stacked bar (Zone 1-5)
8. **Activity coach** card: "You're cooked, prioritize recovery tomorrow" (rule 3.11)

### 4.7 HRV detail

**Current state** (`HrvDetailScreen.tsx`):
- Orphaned: the nav from HealthMonitor's HRV row is broken (RN-Navigation name vs expo-router path)
- HRV 7-night series rendered TWICE
- Every VitalCard non-interactive

**Target state — Whoop's RHR / HRV drilldowns:**

1. Day-picker strip
2. **Sparkline hero** — big HRV number for today + verdict + sentence
3. **Personal range bar fill** showing where today's value falls vs personal range
4. **Single line chart** — 7/30/90/365-day with D/W/M/Y toggle (rule 3.4), point labels on D/W, scrubber on M/Y
5. **vs 7d / vs 30d / vs personal max** dual-baseline section (rule 3.3, three frames)
6. **Drivers list**: "Sleep duration · alcohol · workout intensity · stress" — each as a contributor row with the correlation strength
7. **"Why HRV matters" explainer** (rule 3.11)

**Bug:** fix the nav schism — link from HealthMonitor must use `router.push("/hrv-detail")` not `navigation.navigate("HrvDetail")`.

### 4.8 Sleep Planner

**Current state** (`SleepPlannerScreen.tsx`, 494 LOC):
- Ignores backend planner strings (`smartWakeStatusText`, `sleepReserveText`, `estimatedSleepHours`, `alarmStatusText`)
- Arm-alarm button stays enabled while strap is offline

**Target state — Whoop's Sleep Planner:**

1. **Predicted bedtime / wake** with sleep-need calculation (sleep debt + recovery target)
2. **Wake window** slider — "Wake me between 6:30 and 7:00"
3. **Smart wake status** — surface `smartWakeStatusText` (e.g., "Will wake during light sleep · alarm armed")
4. **Sleep reserve** — surface `sleepReserveText` (Whoop's "you're +1h 20m ahead of target")
5. **Estimated sleep hours** for tonight — surface `estimatedSleepHours`
6. **Arm alarm** button disabled when strap offline (`alarmStatusText` says so)
7. **Wind-down nudge** with breathwork / lights-down suggestion

### 4.9 Journal — does not exist yet

This is a **net-new screen.** All competitors have one; noop doesn't.

**Target state — Whoop checklist + Oura tag-pills hybrid:**

1. **Yes/No checklist** — every morning, 10-15 conditional questions: "Did you have caffeine after 2pm?" → if yes, "How many cups?" Whoop pattern.
2. **Pill tag chooser** — for evening / context tags. Search + suggested + all tags. Categories: Lifestyle / Circadian / Health Status / Sleep / Status.
3. **Behaviour library**: ~80 tags minimum. Match Whoop's "100+ behaviours" goal.
4. **Per-day journal screen** — what you logged for this date + the metrics that day, side by side.
5. **History** — list of recent days with their tag chip-line + sleep score.

Already part of the data model (`journal_entries` table exists) — just needs the surface.

### 4.10 Insights — also does not exist yet

The single highest-leverage net-new screen — Whoop's Recovery Impact Analysis is the gold standard.

1. Time selector: Last 30 / 60 / 90 days.
2. Metric selector: Recovery / HRV / Sleep / Strain / Stress.
3. **"What helped / what hurt" bar chart** — each behaviour as a row, %-impact as a coloured bar anchored at 0%. Hurts left / helps right (rule 3.9).
4. **Statistical significance markers** — "based on N days" / "high confidence".
5. **"Days you didn't drink alcohol had Y% higher HRV"** sentences below the chart.

Depends on: enough journal data (per 4.9 above) + a backend correlator. Phase E-class work.

### 4.11 Settings

**Current state**: sparse.

**Target state — match the universal categories:**

1. **Notifications** — push categories (Recovery, Strain, Sleep, Coaching).
2. **Goals & targets** — Sleep target (override planner), Strain target, Activity goals.
3. **Integrations** — Apple Health (read + write), Google Health Connect (Android), Spotify wind-down playlist.
4. **Data export & sharing** — "Share Health Report" → one-tap PDF (rule 3.14, every major app supports it).
5. **Coach / AI assistant** — opt in/out, response style.
6. **Journal customisation** — toggle which questions appear, add custom tags.
7. **Hide metrics** — let users opt out of certain vitals (Whoop pattern, important for ED-prone users hiding weight).
8. **Subscription / store** (if applicable).
9. **About / version / debug** (sub-page: link to Inspector).

### 4.12 Inspector tab

Keep — it's a dev tool that's deliberately exposed. But move it out of the **bottom tab bar** into Settings → Advanced → Inspector. Users shouldn't navigate to "Inspector" at the same level as "Health". Put a quick-glance Sync status indicator in the Settings tab instead.

---

## 5. Cross-cutting fixes (apply to all screens)

These show up across ≥3 screens. Fix once, propagate everywhere.

| Issue | Fix |
|---|---|
| **Navigation schism** (RN-Nav stub + expo-router live) | Delete `app/navigators/` and all references. Audit every `navigation.navigate(...)` for dead names; replace with `router.push("/path")`. |
| **Backend doesn't supply `monitors`** | Implement `HomeViewModel.monitors` in `views.service.ts`. Real `todayStrip` (24 hourly buckets), real `timeInZone`, real `lastReadingAt`, real `staleSinceMs`. Drop `deriveMonitorsFallback()`. |
| **RR missing from `activities`** | Add `respiratoryRate` to `HomeViewModel.activities`. (RR is computed in `wellness_scoring.rs::respiratory_rate`, just not surfaced on the activities view-model.) |
| **Duplicate charts** | One chart per metric per screen. Delete the `TrendSparkline` duplicates from `StrainActivityScreen` and `HrvDetailScreen`. |
| **Axisless charts** | Every chart needs: x-axis time labels, y-axis scale labels (or "min / max" annotations), point labels OR a scrubber, a one-line caption. |
| **iOS-only Chart on TrendsScreen** | Moot — Trends is being deleted. |
| **Header inconsistency** | One header component: `ScreenHeader` (scrollY-animated, title in title-case, single source of back button). Retire `DetailScreenHeader` and the bespoke headers. |
| **Date desync (Sleep)** | SleepDetail sets `selectedDate` to its route param on mount, not the other way around. |
| **Internal terminology** | "candidate" → "Pending review". "off-wrist" → "Strap off". "No Data" → "Gap in tracking". "RMSSD" → "HRV" (or "HRV (RMSSD)" tooltip). Factor tags → human strings via a translation map. |
| **Empty states are silent** | Show a calibration message and days-remaining count for every "0" value (rule 3.12). |
| **Loading states are global spinners** | Skeleton cards per region. The card layout should hold its space while loading. |
| **Dead CTAs** | Audit every `<TouchableOpacity>` / `<Pressable>` for missing `onPress`. Either implement or remove. |
| **Tap-targets** | Every value in a contributor row should drill into its own detail screen. Hero scores should open the explainer modal on tap. |

---

## 6. Backend data contract — the gap

Most of the design gaps are downstream of the backend not surfacing the right shape. The view-model layer in `apps/backend/src/views/views.service.ts` needs to add:

### 6.1 `HomeViewModel.monitors` (the missing field)

```ts
monitors: {
  health: {
    state: "ok" | "warn" | "alert" | "stale"
    verdict: string                     // "4 of 5 vitals in range"
    inRangeCount: number                // real count from personal ranges
    totalMetrics: number                // 5
    staleSinceMs: number | null         // ms since last sample
  }
  stress: {
    state: "ok" | "warn" | "alert" | "stale"
    score: number | null                // 0-100
    zone: "Calm" | "Moderate" | "High" | null
    lastReadingAt: string | null        // ISO
    todayStrip: Array<number | null>    // 24 hourly stress index values
    timeInZone: {
      calm: number                      // minutes
      moderate: number
      high: number
    }
  }
}
```

### 6.2 `HomeViewModel.activities.respiratoryRate`

Compute from `wellness_scoring.rs` already populated; just need to expose it on the view model.

### 6.3 Per-metric personal range

Every vital needs a personal `{ min, max, p10, p90 }` from the user's 30-day history so the bar-fill verdict in the contributor row can render. Today this is hard-coded against fixed clinical ranges — should be personalised.

### 6.4 `HomeViewModel.dayRibbon` — keep, extend

Already exists with sleep window + activities + HR series. Add per-day stress + recovery sparkline cells so the day-strip mini-scrubber (rule 3.5) can also act as a sparkline (Oura / Ultrahuman pattern).

### 6.5 `JournalViewModel` and `InsightsViewModel` — net-new

For §4.9 and §4.10. Spec for these in a follow-up; depends on settling on Whoop-checklist vs Oura-tags shape (I recommend both — they cover different mental models).

---

## 7. Implementation order (recommended)

Each row is one focused session.

| # | Session | Why first |
|---|---|---|
| 1 | Navigation schism cleanup | Removes confusion; every other fix depends on this. |
| 2 | Backend `monitors` contract + RR exposure | Unblocks Health Monitor + Stress Monitor + Health tab. |
| 3 | Health tab rebuild | Highest user-visible win. |
| 4 | Stress + Health Monitor detail rebuilds | Now actually-data-driven post-(2). |
| 5 | Sleep detail polish | High-value, well-spec'd already. |
| 6 | Strain detail polish | Lower volume, still wrong though. |
| 7 | HRV detail + Sleep Planner polish | One-shot cleanup of single-metric drilldowns. |
| 8 | Journal — new screen | Net-new. Higher effort but high leverage for §10 to land. |
| 9 | Insights — new screen | Depends on Journal data. |
| 10 | Settings rebuild + Inspector demotion | Lower priority but worth one session. |

After all 10 land, the knowledge base entries for each screen get updated (or rewritten) to reflect the shipped state.

---

## 8. Knowledge base updates

Per the inventory:
- `docs/knowledge.html` is **built** from `docs/build-knowledge.mjs`. Editing the HTML directly would be lost on next rebuild. Updates land in `build-knowledge.mjs`'s `GLANCE` array (the 63 cards) and the `SECTIONS` array of file paths.
- `docs/feature-matrix-audit.md` §2 ("in-process `runPipeline()`") is now stale; the pipeline runs in the Rust worker. Update that section or supersede it.
- `docs/feature-matrix-audit.md` §7 has 5/6 questions already closed in the worker era. Update.
- The screen-by-screen design intent in `docs/superpowers/plans/2026-04-07-sleep-detail-redesign.md`, `2026-05-16-home-monitors-redesign.md`, etc. is half-applied — annotate which parts shipped, which didn't.

**Recommended:** add three new cards to the `GLANCE` array in `build-knowledge.mjs`:
1. **"Secondary screens master plan"** with a link to this document.
2. **"Competitor patterns library"** with a link to `competitor-screens-research-2026-05-28.md`.
3. **"Current screens audit (2026-05-28)"** with a link to `current-secondary-screens-audit-2026-05-28.md`.

And one new long-form section under `SECTIONS`: this file (`secondary-screens-master-plan-2026-05-28.md`).

---

## 9. What's deliberately not in scope

- **Onboarding redesign** — separate problem. The "you must wear the strap for 14 nights to calibrate" flow needs work but it's not a Trends/Health/Stress fix.
- **The watch face / strap LED firmware** — out of mobile-app scope.
- **Premium / subscription gating** — defer until there's a product decision.
- **AI Coach** (rule 3.10) — needs an LLM integration + content licensing decision. The screens should have the "Ask about this" affordance, but the actual chat opening can land in a separate phase.
- **Cycle insights / women's health** — Oura's strongest moat; non-trivial; defer.
- **Body composition** — Whoop has this; we don't have the sensor data path; defer.

---

## 10. Open questions for the user

These need a product call before any session starts:

1. **Trends tab — actually delete or archive?** The audit confirms it's orphaned. Recommendation: delete the file, kill the route, fold its responsibilities into the Health tab grid.
2. **Inspector tab — keep or demote?** Personal recommendation: demote to Settings → Advanced. It's a dev tool, not a user-facing tab.
3. **Journal & Insights — which mental model?** Whoop's yes/no checklist or Oura's tag pills? Recommendation: ship both. They cover different cognitive loads.
4. **AI Coach — when?** If "now", the spec needs an LLM and content provider. If "later", the UI affordances still land but route to "Coming soon".
5. **Share Health Report PDF** — included in v1 settings or v2? Every competitor has it.

---

End. Three foundational research docs (referenced at the top) cover the depth; this document is the synthesis + plan. Next session(s) pick one row from §7 and execute.
