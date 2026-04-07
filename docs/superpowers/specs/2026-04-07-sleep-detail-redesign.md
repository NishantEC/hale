# Sleep Detail Screen Redesign

## Problem

The Sleep tab has a card-in-card layout (GlassCard wrapping GlassCards) that feels heavy and cluttered. It duplicates information (stage breakdown repeats what the hypnogram shows). It exists as a full tab when it should be a contextual detail view — users always arrive here wanting to see a specific night's data, not browse.

## Decision: Tab to Detail Screen

Remove Sleep from the bottom tab bar. It becomes a **push/modal screen** opened from the Home tab's sleep card. It receives the target date as a navigation parameter. This:

- Frees a tab slot (Home, Trends, Device remain — or repurpose the slot later)
- Makes the screen contextual: "here's what happened on this night"
- Eliminates the need for date navigation within the sleep screen

## Navigation Changes

### MainNavigator
- Remove `Sleep` from `TAB_CONFIG` and the BottomTabNavigator
- 3 tabs remain: Home, Trends, Device

### AppNavigator
- Add `SleepDetail` as a stack screen (push, not modal — user can swipe back)
- Params: `{ date: string }` (ISO date string, e.g. "2026-04-07")

### HomeScreen
- Sleep card `onPress` changes from `navigateTo("Sleep", "sleep")` to `navigation.navigate("SleepDetail", { date: currentDate })`

### SleepDetailScreen (renamed from SleepScreen)
- Receives `date` param via `useRoute()`
- Fetches/filters sleep data for that specific date from DashboardContext

## Screen Layout

Flat layout. No GlassCards. Sections separated by spacing (24px). Content sits on screen background like HomeScreen.

### 1. Nav Bar
- Back arrow (returns to Home)
- Title: "Sleep"
- Subtitle or right-aligned: formatted date ("Mon, Apr 7")

### 2. Hero Score
- Large score number centered (48pt+ font), e.g. "82"
- Quality label beneath: "Good" / "Fair" / "Poor" — derived from score thresholds
- Total sleep duration: "7h 23m"
- This is the biggest visual element. Immediate emotional read.

### 3. Hypnogram
- The Apple Health-style sleep stages chart (already built)
- Full width, no wrapper card
- Interactive: pan gesture shows stage + time on hover

### 4. Key Metrics Row
- Horizontal row, evenly spaced, 3-4 items:
  - **Efficiency**: e.g. "94%"
  - **Latency**: e.g. "12 min" (time to fall asleep)
  - **Avg HR**: e.g. "58 bpm"
  - **HRV Drop**: e.g. "-8%"
- Each metric: small muted label on top, value beneath in medium weight
- No borders, no cards — just a clean row

### 5. Heart Rate Chart
- Overnight HR curve, compact (120px height)
- Same width as hypnogram
- X-axis: time. Y-axis: bpm range
- No card wrapper, subtle grid lines

### 6. Trends (7-Night Context)
- Two side-by-side mini sparklines:
  - Left: sleep duration (last 7 nights), tonight highlighted
  - Right: sleep score (last 7 nights), tonight highlighted
- Compact, ~80px height each
- Gives "how does tonight compare" context

### 7. Insights (Conditional)
- Only renders if factor insight data exists
- Simple flat list: icon + text per insight
- e.g. "Caffeine after 4pm" with a small negative indicator
- No empty state — section simply doesn't appear if no data

## What's Removed
- **Sleep stage breakdown rows** (Awake/REM/Core/Deep with durations) — redundant with hypnogram
- **Sleep Planner section** (target bedtime, wake time, alarm controls) — move to Device tab or a separate flow later
- **Recovery Confidence** — not earning its space; score already communicates this
- **Metrics grid** (6-card grid) — consolidated into the Key Metrics Row (4 items max)
- **Date navigation** (left/right arrows) — date comes from Home tab
- **All nested GlassCard wrappers** — flat layout throughout

## Visual Style
- Follow HomeScreen patterns: direct Views, subtle background tints, generous spacing
- Typography hierarchy: score (48pt bold) > section values (20pt medium) > labels (13pt muted)
- Colors: sleep stage colors from hypnogram (awake=#FE8A73, rem=#3FB1E7, core=#1B81FE, deep=#403EA7) used as accents where relevant
- Dividers: optional hairline or just whitespace between sections
