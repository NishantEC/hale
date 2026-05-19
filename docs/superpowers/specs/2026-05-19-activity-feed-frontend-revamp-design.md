# Activity Feed Frontend Revamp

## Problem

The activity surfaces in the app are underdone and don't reflect the new Rich-10 backend taxonomy.

- **Strain tab** (`StrainActivityScreen`, 220 LOC) renders strain ring + 7-day chart + 4 vital cards + 2 sparklines + Labs accordion — **no per-bout list at all**. If a user opens the Strain tab to see "what activities happened today," they don't see them.
- **Home tab** (`HomeScreen` → `TodayCard`) renders a chronological mix of sleep, recovery, journal, workouts, and off-wrist using a single dot-and-text row shape. No per-class icon, no distinct treatment for off-wrist vs real workouts, no tap-to-detail.
- **Candidate cards** (`PendingActivityCards`) work but are visually disconnected from the activity feed and use the old "three buttons + chip row" reclassify pattern. `SUGGESTED_TYPES` still lists the pre-Rich-10 taxonomy.
- **No bout-detail screen.** Tapping a workout in the feed has nowhere to go.

## Decision

Full activity-surface overhaul. New visual language: per-class icon + color, single shared `BoutCard` component, candidate cards stacked as a deck when multiple, bottom-sheet class picker (Rich-10), bout-detail screen on tap. No GPS / pace / cadence / calorie features — we don't have the signals.

## Surfaces

### Strain tab — `StrainActivityScreen` rewrite

Top-to-bottom:

1. **Header** — existing `ScreenHeader` with "Strain" + formatted date (unchanged shell).
2. **Day pills strip** — 3-day pills (Fri / Sat / Sun-today), swipe to change day. Replaces the existing tap-into-detail navigation pattern with a compact in-tab day switcher.
3. **Hero card** — small strain ring (70 px) + day-strain numeric + intensity eyebrow ("Strenuous · +2.1 vs avg") + counts line ("5 named · 2 candidate · 1 off-wrist · 142 active min"). Strain ring color = strain tint (current orange).
4. **Day timeline strip** — 24-hour horizontal bar, ~20 px tall. Each bout renders as a class-colored block at its proportional time position. Off-Wrist intervals = diagonal-stripe block; Candidates = dashed-border block. Axis underneath: 4a / 8a / 12p / 4p / 8p. Single glance "shape of my day."
5. **Candidate section** — only when `pendingActivityCards.length > 0`. Single card → single `BoutCard.candidate`. Multiple → `CandidateDeck`. Above-the-fold so the user sees there's something to confirm.
6. **Today section label** — "TODAY" eyebrow + entry count.
7. **Bout feed** — chronological list of `BoutCard`s for named bouts, with `GapRule`s interleaved for Off-Wrist / No-Data intervals.
8. **Strain · 7-day** trend card (kept from existing — moved below the day's bouts).
9. **Labs accordion** (kept from existing) at the bottom.

The 4 vital cards (Live HR / Stress / Recovery / Load Pressure) and the 2 sparklines (Strain / Stress) are kept but **moved into the Labs accordion** — they belong below the day-detail, not between hero and feed.

### Home tab — `TodayCard` refresh

The chronological mixed-event list stays, but workouts get the new `BoutCard` treatment (icon · color · strain pill). Off-Wrist / No-Data rows become `GapRule`. Sleep, recovery, and journal rows keep the current dot-and-text shape (their existing treatment is fine — only workouts are getting the upgrade).

`PendingActivityCards` on Home renders the same `CandidateDeck` as on the Strain tab — one source of truth.

### Candidate card / deck

Replaces today's `PendingActivityCards`. Behavior:

- **1 candidate** → single `BoutCard.candidate` (the rich card).
- **2+ candidates** → `CandidateDeck` showing the top card actionable, up to 2 cards peeking behind it (offset / scaled / dimmer). Counter pill ("3") top-right of the deck. Pager line ("1 of 3 — swipe up for next") under the deck.

The rich candidate card:

- **Meta row**: `09:15 → 09:33 · 18 min · HR 132 avg · 158 max` and a confidence chip (`72%`) right-aligned.
- **HR mini-sparkline** (44 px tall) over the bout window, class-tinted.
- **Verdict row**: "This was [class chip]". Chip has class icon + name + caret. Tap → bottom-sheet picker (see below).
- **Actions**: single big primary "Confirm" button + small "Not an activity" text link.

After confirm, the bout drops silently into the Today feed at its real time slot — no green outline, no "just confirmed" label. Dismissed candidates simply disappear from the deck.

### Class picker — bottom sheet

Tap the class chip → bottom sheet slides up. Grab-handle on top. Header: "Pick a class". Body: Rich-10 list as full-width rows, each row = `icon · class name · check-mark-if-current`. Tap a row → sheet dismisses + chip updates. Swipe down or tap outside → dismiss without change.

Rich-10 list order (matches the priority cascade in the backend classifier):
1. Stair Climb · 2. Running · 3. HIIT · 4. Cycling · 5. Strength · 6. Hiking · 7. Walking · 8. Cardio · 9. Mixed · 10. Light Activity.

The current suggested class is bumped to the top of the sheet when it differs from the canonical order.

### Bout detail screen — new

New route `/bout-detail?id=<uuid>`. Top-to-bottom:

1. **Top bar** — back button + overflow menu.
2. **Hero** — class color gradient background, 44 px class icon, class name, "Sun, May 17 · 07:30 → 08:02 IST", strain headline number, intensity badge.
3. **3-stat strip** — duration · HR avg · HR max.
4. **Heart rate** section card — full HR curve over the bout window, class-tinted, Y-axis ticks at 60 / 100 / 140 / 180 bpm.
5. **HR zones** section card — Z1–Z5 stacked bar showing % of bout in each zone, with minute counts in a legend underneath.
6. **Motion intensity** section card — `|Δgravity|` rendered as a bar chart over the bout window.
7. **Reclassify row** — "Wrong class? [class chip]" — opens the same bottom-sheet picker.
8. **Delete bout** — destructive text button at the bottom.

**Candidate-tier variant**: replaces the top bar's clean look with an indigo banner ("Possible activity · 72% sure · Confirm to count toward your strain · [Confirm CTA]"). Hero uses indigo gradient. Strain shown but labeled "est. strain (not counted)". Reclassify chip reads "Pick a class" (no suggested class). Bottom action is **Dismiss**, not Delete.

## Visual System

### Rich-10 class → (SF Symbol, tint hex)

| Class | SF Symbol | Tint |
|---|---|---|
| Running | `figure.run` | `#FF8A8A` |
| Walking | `figure.walk` | `#4ADE80` |
| Hiking | `figure.hiking` | `#A78BFA` |
| Cycling | `bicycle` | `#64D2FF` |
| Strength | `figure.strengthtraining.functional` | `#FFA42B` |
| HIIT | `bolt.fill` | `#FBBF24` |
| Stair Climb | `figure.stair.stepper` | `#C48BF8` |
| Cardio | `heart.fill` | `#9492F5` |
| Mixed | `square.grid.2x2` | `#C7C7CC` |
| Light Activity | `figure.walk.motion` | `#AEAEB2` |
| **Candidate** *(tier, not class)* | `questionmark.circle.fill` | `#5E5CE6` |
| **Off-Wrist** *(sentinel)* | `wave.3.left.slash` | `#6B6B70` |
| **No Data** *(sentinel)* | `wifi.slash` | `#6B6B70` |

Each tint is used both as the icon background (`tint @ 0.18` opacity) and as the icon glyph color (full opacity).

### Bout card shape

- 36 px round icon (left)
- Body (flex): title (14 px bold) + meta (11 px dim) — meta = `HH:MM · duration · HR N · intensity`
- Right: strain numeric (18 px bold tabular-nums) + "STRAIN" eyebrow (9 px)
- Padding 12 px / 14 px, radius 12 px, surface = `colors.surfaceCard`

Candidate variant adds a 1 px dashed indigo border + indigo-tint background.

### Gap rule (Off-Wrist / No-Data)

Thin row, not a card. 18 px round muted icon + `09:45 – 11:30 · Off-wrist · charging` text + horizontal dashed line stretching to the right edge. No tap action. Color: `#6E6E73`.

## File / module structure

### New files

```
apps/app/app/components/activity/
  BoutCard.tsx           // rich bout card — used on Strain tab + Home TodayCard
  CandidateCard.tsx      // rich candidate variant — meta row + sparkline + chip + confirm
  CandidateDeck.tsx      // stack-of-3 for 2+ candidates
  ClassPickerSheet.tsx   // bottom sheet, Rich-10 list, grab handle
  DayTimeline.tsx        // 24h strip with class-colored blocks
  GapRule.tsx            // Off-Wrist / No-Data line
  bout-icons.ts          // class → { sfSymbol, tint } table

apps/app/app/screens/BoutDetailScreen.tsx
apps/app/src/app/(app)/bout-detail.tsx     // route file
```

### Modified files

| Path | Change |
|---|---|
| `apps/app/app/screens/StrainActivityScreen.tsx` | Rewrite per the spec above. ~220 LOC → ~280 LOC. |
| `apps/app/app/components/home/PendingActivityCards.tsx` | Replace internals with `CandidateCard` / `CandidateDeck`. Public API unchanged so HomeScreen doesn't move. |
| `apps/app/app/components/home/TodayCard.tsx` | Workouts switch to `BoutCard`. Off-Wrist / No-Data rows → `GapRule`. Sleep/recovery/journal rows unchanged. |
| `apps/app/app/utils/buildTodayTape.ts` | `TapeEvent.payload` extended with `boutId`, `class`, `intensity`, `strain` so `TodayCard` can render the new shape without a second fetch. |
| `apps/app/app/services/api/noopClient.ts` | `PendingActivityCard` and `ActivityFeedEntry` types extended with `endTime`, `confidence`, `source`, `class` (Rich-10 string). |
| `apps/app/src/app/(app)/_layout.tsx` | Register `bout-detail` route. |
| `apps/app/app/screens/HomeScreen.tsx` | `handleTapePress` for workout events navigates to `bout-detail?id=...`. |

### Removed

- The 4 vital cards row and the Strain/Stress sparkline pair are moved from the main scroll into the Labs accordion. No file removed; markup re-homed inside `StrainActivityScreen.tsx`.

## Behavior rules

- **Confirmation lands silently.** No "just confirmed" label, no green border, no toast. The Today feed reflects it next render.
- **Class chip color updates immediately** when the user picks a different class in the picker — no separate "Save" state. Primary button stays "Confirm".
- **Confidence chip is always shown** on candidate cards (top-right of meta row). When `< 50%`, chip turns amber and the verdict reads "This might be" instead of "This was". When `>= 50%`, indigo.
- **Sort order in feed**: chronological by start time. Same-class bouts are NOT collapsed.
- **Tap target**: the entire `BoutCard` opens the bout-detail screen. Inside `CandidateCard`, only the confirm button + class chip + "Not an activity" link have actions; tapping the card body opens bout-detail with the candidate's id.
- **Day timeline tap**: tap a block → scrolls the feed below to the corresponding bout, briefly highlights it (200 ms ease-in opacity flash).

## Empty / sparse states

- **Day with zero bouts**: hero shows strain ring + "Light day · 0 named · 0 candidate". Day timeline strip rendered but empty (full-width gray track). Feed area renders a single muted line: "Nothing logged today." No empty-state hero illustration — the page above it is information enough.
- **Day with only candidates, no named bouts**: deck above + feed shows "No confirmed activities yet."
- **Day with only off-wrist / no-data**: gap rules render as if a normal feed; counts line reads "0 named · 1 off-wrist".

## Out of scope

- GPS / route map / pace — no GPS signal.
- Cadence / splits — FFT aliased at 1 Hz.
- Calories — we don't compute this.
- Same-class collapse — explicitly declined (chronological flat list).
- Swipe gestures on candidate deck — buttons only for v1; revisit later.
- Same-class bout sort by total-strain — chronological only for v1.
- A weekly / monthly activity view — out of scope; Strain tab is single-day for v1.
- Strain target band visualisation on the ring — out of scope.

## Testing

- **Snapshot tests** for `BoutCard`, `CandidateCard`, `GapRule`, `DayTimeline` covering each Rich-10 class + the two sentinels.
- **Behavior test** for `CandidateDeck`: counter pill updates on confirm/dismiss; "1 of N" pager line matches; bottom-sheet picker change updates the chip.
- **Integration test**: `BoutDetailScreen` renders correctly for confirmed and Candidate-tier inputs (zone bar percentages sum to 100, HR curve points length matches duration).
- **Visual regression** via the dev preview screen (existing `DevActivityStripScreen` pattern) — extend with bout-card-preview that lets us walk every state.
