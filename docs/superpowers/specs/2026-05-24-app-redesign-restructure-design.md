# noop — visual redesign (2026-05-24)

## Scope

Pure visual redesign. **No information architecture changes.** Tabs stay (Home, Health, Inspector, Settings). Routes stay. Drill-ins stay where they are. What changes is the visual grammar across all existing screens.

## Why

The four tabs and 13 routes work. They mirror what the user already knows. But the visual execution is somewhere between "boilerplate dashboard" and "Spotify clone," and it doesn't sit confidently in the Whoop / Oura / Ultrahuman family that noop is implicitly part of. The redesign closes that gap: one tight visual vocabulary, applied uniformly across every existing screen.

## Reference family

Whoop, Oura, Ultrahuman. Shared DNA: pure black ground, score-forward hierarchy, big light-weight numbers, glow cards that radiate from the score, contributor lists with status badges, verdict word before raw number.

## Design system (the only real delta)

### Surface
- Background: `#000`
- Card: `#0E1013` (raised) · `#0B0C0F` (glow-card base)
- Border: `#1A1C20` (cards) · `#14161A` (hairlines inside cards)
- One charcoal step. No layered surface stack.

### Type
- Display numbers: SF Pro Display **200** weight, `letter-spacing: -0.05em`, `font-variant-numeric: tabular-nums`
- Verdict word: 13px / 700
- Labels & pills: 9–11px / 700, `letter-spacing: 0.16em`, uppercase
- Body: 12–13px / 400–600
- Big/light/tabular for numbers; bold/wide-tracked/uppercase for labels. Strong contrast between the two.

### Metric colour palette (semantic)
| Token | Hex | Used on |
| --- | --- | --- |
| Recovery · high | `#2BE07A` | green recovery score |
| Recovery · mid | `#FFD449` | yellow recovery score |
| Recovery · low | `#FF5E5E` | red recovery score, also live HR |
| Strain | `#5DA8FF` | strain score, activity icons |
| Sleep | `#7CCFE5` | sleep score, hypnogram |
| HRV | `#8AE0C2` | HRV score, body trends |
| Stress | `#FF9F6B` | stress score |
| BLE / device | `#B084EB` | inspector device card |

Rule: a card displays one metric, in one colour. The colour appears as a soft radial glow inside the card and on the score number itself.

### The glow score card (primary pattern)

The recurring hero pattern across screens. Structure:

1. Eyebrow pill: metric name + delta (`RECOVERY +8 vs 7d`)
2. Score row: large number (left) + verdict word + one-line explanation (right)
3. Mini histogram of last 7 entries (or hypnogram, or sparkline as appropriate)
4. Axis labels (W T F S S M T)

The glow itself is a radial gradient from the top centre of the card in the metric colour at 32% opacity, faded to transparent at 45%.

### The contributor list (secondary pattern)

Below the glow card on most screens. A card with a heading row + 3–5 contributor rows. Each row: label, value, status badge (`Within range`, `Reduced · good`, `Below typical`, `Optimal`). Pulled directly from the existing data the app already shows but presented uniformly.

### Tile (compact glow card)

For 2-up cards under the hero (Strain + Sleep on Home). Same glow pattern, smaller. 28px score, 110px tall.

## What gets redrawn (no routes change)

| Route | What it becomes |
| --- | --- |
| `(tabs)/index.tsx` (Home) | Recovery glow card + Strain/Sleep tiles + today feed |
| `(tabs)/health.tsx` (Health) | noop Age glow block + Pace of Aging trend + system contributors |
| `(tabs)/inspector.tsx` (Inspector) | Device glow card (BLE-purple) + live HR + toggle rows + console log |
| `(tabs)/settings.tsx` (Settings) | Profile head + device card + grouped menus |
| `sleep-detail.tsx` | Sleep score glow card with hypnogram + stage contributors + why-panel |
| `hrv-detail.tsx` | HRV glow card + D/W/M/6M/Y segmented + distribution + last-night sparkline |
| `strain-activity.tsx` | Day strain glow card + bouts feed + zone contributors |
| `home-metric.tsx` / `home-details.tsx` | Generic metric glow card + contributors + trend |
| `journal-entry.tsx` | Glow-less compose surface; uses BLE-purple accent for save |
| `journal-history.tsx` | Feed rows (purple icon) with date headers |
| `sleep-planner.tsx` | Form rows reusing menu grammar; glow-card preview of next-night target |
| `stress-monitor.tsx`, `health-monitor.tsx`, `bout-detail.tsx`, `device-settings.tsx`, `dev-activity-strip.tsx` | Re-skinned with same vocabulary; structure unchanged |

## What does NOT change

- Tab names, order, count.
- Routes, file paths, navigation flow.
- Inspector as a top-level tab.
- Health as a separate tab from Home.
- Sleep detail and sleep planner as separate routes.
- Journal entry / history split.
- Any backend, BLE, sync, persistence, or business logic.
- The existing Tamagui setup (the redesign lands as new theme tokens + redrawn components inside the same `apps/app/app/components/` tree).

## Components to introduce

Small, focused set — all replacing visual chrome only, not data flow:

- **`GlowScoreCard`** — props: `metric`, `score`, `delta`, `verdict`, `verdictBody`, `histogram[]`. Used on Home (recovery), Sleep Detail, HRV, Strain, Stress, Health Monitor.
- **`GlowTile`** — compact two-up version of above. Used under hero on Home and in any 2-up grid.
- **`NumBlock`** — large centred number block (200 weight, no histogram). Used on Health for noop Age, and any "verdict word" splash.
- **`ContributorList`** — heading row + contributor rows + status badges. Used everywhere data needs to be itemised.
- **`StatusBadge`** — `ok | warn | mid | neutral` variants. The colour mapping mirrors metric palette.
- **`TrendCard`** — card with `<small>` label + value + delta pill + inline sparkline. Used on Health, HRV, Body monitors.

Components that survive without visual changes: `DateSwitcher`, `BlurHeader`, `Shimmer`, `Toast`, `HomeDateCalendar`. They're already aligned with the new system or are functionally invisible.

Components that get retired: the older single-purpose `MonitorCard`, `MetricRingsRow`, `TodayCard`, `PendingActivityCards` — replaced by the smaller, composable set above used directly from each screen.

## Migration

Three slices, each shippable on its own:

1. **Tokens + primitives.** Add the new colour tokens to `tamagui.config.ts` and the existing `LOCAL_THEME`. Ship the 6 components above with no consumer changes. ~1 day.
2. **Home + Health tabs.** Highest-traffic screens. Swap `HomeScreen` body to the new components. Same for `HealthScreen`. ~2 days.
3. **Drill-ins + Inspector + Settings.** Redraw the rest screen-by-screen, in any order. ~3 days, can be parallelised.

## Acceptance

- New tokens exist alongside old ones; old ones removed once consumers are migrated.
- `GlowScoreCard`, `GlowTile`, `NumBlock`, `ContributorList`, `StatusBadge`, `TrendCard` exist under `apps/app/app/components/`.
- Every screen listed above renders with the new vocabulary; no route change required to navigate.
- Mockups in `.superpowers/brainstorm/34457-1779567910/content/redesign-same-screens.html` are the visual contract.
