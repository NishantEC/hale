# Home Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `HomeScreen` body with the F3 layout — Recovery hero ring → 2×2 stat grid (Sleep/Strain/HRV/Journal) → chronological Today's Tape — plus a floating `+` button for journal entry capture.

**Architecture:** Extract self-contained presentational components into `app/components/home/`, plus one pure data-combiner util. `HomeScreen.tsx` keeps its existing shell (SafeAreaView + PanGestureHandler + Animated.ScrollView + RefreshControl + BlurHeader) and consumes the new components. No backend or context shape changes; the tape combiner derives events from the existing `useDashboard()` view + `fetchJournalEntries()` results.

**Tech Stack:** React Native (RN 0.74+), Expo Router, react-native-reanimated v3 (existing scroll handler), `@/components/Text`, `@/components/reactx/circular-progress`, Ionicons, `LOCAL_THEME` (existing theme shim). No new dependencies.

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-05-10-home-screen-redesign-design.md`
- Design language: `apps/app/DESIGN.md` (Spotify primary), `apps/app/DESIGN.apple.md` (Apple secondary)

**Conventions assumed:**
- All new files are under `apps/app/`. Run commands from `apps/app/` unless otherwise stated.
- Type-check command: `pnpm exec tsc --noEmit -p . --pretty`
- Lint: `pnpm exec eslint --fix <file>`
- The repo has 48 pre-existing typecheck errors in unrelated test/config files; treat any *new* error in a file you touched as a regression.
- `Text` from `@/components/Text` defaults to white text — provide explicit `style={{ color: colors.text }}` when rendering on a light background, or rely on the wrapper passing through.
- Brand orange `#C76542` is `LOCAL_THEME.colors.tint`. Per `DESIGN.md`, it's reserved for action surfaces (FAB, Journal tile). Do not apply elsewhere.

---

## File Structure

**Create (new files):**
- `app/components/home/RecoveryHero.tsx` — centered Recovery ring + verdict text
- `app/components/home/StatTile.tsx` — single tinted tile primitive used by the grid
- `app/components/home/StatGrid.tsx` — 2×2 grid of `StatTile`
- `app/components/home/TapeRow.tsx` — single row primitive for the tape
- `app/components/home/TodayTape.tsx` — vertical list of `TapeRow` separated by hairlines
- `app/components/home/HomeFab.tsx` — floating "+" action button
- `app/utils/buildTodayTape.ts` — pure combiner: turns dashboard view + journal entries into `TapeEvent[]`
- `app/utils/buildTodayTape.test.ts` — Jest tests for the combiner
- `app/utils/recoveryVerdict.ts` — pure function: recovery score → `{ verdict, detail }` strings
- `app/utils/recoveryVerdict.test.ts` — Jest tests
- `app/utils/hexWithAlpha.ts` — small color helper (hex → rgba with alpha). Reused across home components.

**Modify:**
- `app/screens/HomeScreen.tsx` — replace body content; preserve shell (PanGestureHandler, SafeAreaView, ScrollView, RefreshControl, BlurHeader, day-swipe, topStrip)
- `app/utils/localTheme.ts` — add `ringHrv` color key to both palettes

**Why this split:** Each home component has one responsibility and is testable in isolation (snapshot or smoke). The combiner is pure and unit-testable without React. `HomeScreen.tsx` becomes thin glue that wires data → components → routes.

---

## Task 1: Add `ringHrv` color token

**Files:**
- Modify: `apps/app/app/utils/localTheme.ts`

- [ ] **Step 1: Add `ringHrv` to `LIGHT_COLORS`**

In `app/utils/localTheme.ts`, locate the `LIGHT_COLORS` object. Find the line `ringStrain: "#D97706",` (it's near `ringSleep` and `ringRecovery`). Add a new line directly below it:

```ts
ringHrv: "#539df5",
```

- [ ] **Step 2: Add `ringHrv` to `DARK_COLORS`**

In the same file, locate the `DARK_COLORS` object. Find the line `ringStrain: "#ffa42b",` (near `ringSleep` and `ringRecovery`). Add directly below it:

```ts
ringHrv: "#539df5",
```

(Same hex on both — Spotify's "announcement blue" reads well on both light and dark per the DESIGN.md guidance.)

- [ ] **Step 3: Typecheck**

Run from `apps/app/`:
```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "localtheme" | head
```
Expected: empty output (no errors in `localTheme.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/utils/localTheme.ts
git -c commit.gpgsign=false commit -m "feat(theme): add ringHrv token (#539df5) for HRV stat tile

Spotify DESIGN.md announcement-blue. Same hex in light + dark.
Used by the upcoming home StatTile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `hexWithAlpha` color helper

**Files:**
- Create: `apps/app/app/utils/hexWithAlpha.ts`
- Test: `apps/app/app/utils/hexWithAlpha.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/app/utils/hexWithAlpha.test.ts`:

```ts
import { hexWithAlpha } from "./hexWithAlpha"

describe("hexWithAlpha", () => {
  it("converts a 6-char hex to rgba with alpha", () => {
    expect(hexWithAlpha("#1ed760", 0.18)).toBe("rgba(30, 215, 96, 0.18)")
  })

  it("returns the input unchanged when given an rgba string", () => {
    expect(hexWithAlpha("rgba(0,0,0,0.5)", 0.18)).toBe("rgba(0,0,0,0.5)")
  })

  it("returns the input unchanged when given an rgb string", () => {
    expect(hexWithAlpha("rgb(0,0,0)", 0.18)).toBe("rgb(0,0,0)")
  })

  it("returns the input unchanged when given a non-hex string", () => {
    expect(hexWithAlpha("transparent", 0.18)).toBe("transparent")
  })

  it("returns the input unchanged when given a 3-char hex (not supported)", () => {
    expect(hexWithAlpha("#abc", 0.5)).toBe("#abc")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/app/`:
```bash
pnpm exec jest app/utils/hexWithAlpha.test.ts -t "hexWithAlpha" 2>&1 | tail -15
```
Expected: FAIL with "Cannot find module './hexWithAlpha'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/app/app/utils/hexWithAlpha.ts`:

```ts
export function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba") || color.startsWith("rgb")) return color
  if (!color.startsWith("#")) return color
  const hex = color.replace("#", "")
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec jest app/utils/hexWithAlpha.test.ts 2>&1 | tail -10
```
Expected: PASS · 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/hexWithAlpha.ts apps/app/app/utils/hexWithAlpha.test.ts
git -c commit.gpgsign=false commit -m "feat(util): add hexWithAlpha helper

Used by home StatTile halos and theme chips. Pure function — tests
cover hex/rgba/rgb/non-hex/3-char-hex inputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `recoveryVerdict` pure function

**Files:**
- Create: `apps/app/app/utils/recoveryVerdict.ts`
- Test: `apps/app/app/utils/recoveryVerdict.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/app/utils/recoveryVerdict.test.ts`:

```ts
import { recoveryVerdict } from "./recoveryVerdict"

describe("recoveryVerdict", () => {
  it("returns the high bucket for >= 67%", () => {
    expect(recoveryVerdict(87)).toEqual({
      verdict: "Push hard.",
      detail: "Body is primed. HRV trending up.",
    })
    expect(recoveryVerdict(67)).toEqual({
      verdict: "Push hard.",
      detail: "Body is primed. HRV trending up.",
    })
  })

  it("returns the moderate bucket for 34–66%", () => {
    expect(recoveryVerdict(50)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
    expect(recoveryVerdict(34)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
    expect(recoveryVerdict(66)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
  })

  it("returns the low bucket for < 34%", () => {
    expect(recoveryVerdict(33)).toEqual({
      verdict: "Take it easy.",
      detail: "Recovery is low. Consider rest or active recovery.",
    })
    expect(recoveryVerdict(0)).toEqual({
      verdict: "Take it easy.",
      detail: "Recovery is low. Consider rest or active recovery.",
    })
  })

  it("returns the no-data bucket when value is null or undefined", () => {
    expect(recoveryVerdict(null)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
    expect(recoveryVerdict(undefined)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
  })

  it("returns the no-data bucket when value is NaN", () => {
    expect(recoveryVerdict(NaN)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec jest app/utils/recoveryVerdict.test.ts 2>&1 | tail -10
```
Expected: FAIL with "Cannot find module './recoveryVerdict'".

- [ ] **Step 3: Write the implementation**

Create `apps/app/app/utils/recoveryVerdict.ts`:

```ts
export type RecoveryVerdict = {
  verdict: string
  detail: string
}

const HIGH: RecoveryVerdict = {
  verdict: "Push hard.",
  detail: "Body is primed. HRV trending up.",
}
const MODERATE: RecoveryVerdict = {
  verdict: "Train moderately.",
  detail: "Yellow zone — listen to your body.",
}
const LOW: RecoveryVerdict = {
  verdict: "Take it easy.",
  detail: "Recovery is low. Consider rest or active recovery.",
}
const NONE: RecoveryVerdict = {
  verdict: "Awaiting data.",
  detail: "Sync your strap to see today's recovery.",
}

export function recoveryVerdict(value: number | null | undefined): RecoveryVerdict {
  if (value == null || !Number.isFinite(value)) return NONE
  if (value >= 67) return HIGH
  if (value >= 34) return MODERATE
  return LOW
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm exec jest app/utils/recoveryVerdict.test.ts 2>&1 | tail -10
```
Expected: PASS · 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/recoveryVerdict.ts apps/app/app/utils/recoveryVerdict.test.ts
git -c commit.gpgsign=false commit -m "feat(util): recoveryVerdict — score → verdict copy

Three buckets (>=67 high, 34–66 moderate, <34 low) plus a no-data
fallback. Used by HomeScreen to render the verdict line under the
Recovery hero ring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `buildTodayTape` combiner — types + empty case

**Files:**
- Create: `apps/app/app/utils/buildTodayTape.ts`
- Test: `apps/app/app/utils/buildTodayTape.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/app/utils/buildTodayTape.test.ts`:

```ts
import { buildTodayTape } from "./buildTodayTape"

const COLORS = {
  ringRecovery: "#1ed760",
  ringSleep: "#A78BFA",
  ringStrain: "#ffa42b",
  ringHrv: "#539df5",
  tint: "#C76542",
} as const

const NOW = Date.UTC(2026, 4, 10, 14, 30, 0) // 2026-05-10 14:30 UTC

describe("buildTodayTape", () => {
  it("returns an empty array when there is no data", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: FAIL with "Cannot find module './buildTodayTape'".

- [ ] **Step 3: Write the type and minimal implementation**

Create `apps/app/app/utils/buildTodayTape.ts`:

```ts
import type { HomeViewModel, JournalEntryResponse } from "@/services/api/noopClient"

export type TapeEventType = "sleep" | "recovery" | "journal" | "workout" | "vital"

export type TapeEvent = {
  id: string
  time: string // "HH:MM" 24h format
  ts: number // ms epoch — for sorting only
  title: string
  desc?: string
  dotColor: string
  type: TapeEventType
  // Routing payload — consumed by HomeScreen
  payload?: {
    journalEntryId?: string
  }
}

type ColorTokens = {
  ringRecovery: string
  ringSleep: string
  ringStrain: string
  ringHrv: string
  tint: string
}

export function buildTodayTape(input: {
  homeView: HomeViewModel | null
  journalEntries: JournalEntryResponse[]
  now: number
  colors: ColorTokens
  selectedDate: string // "YYYY-MM-DD"
}): TapeEvent[] {
  return []
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: PASS · 1 test.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/buildTodayTape.ts apps/app/app/utils/buildTodayTape.test.ts
git -c commit.gpgsign=false commit -m "feat(util): scaffold buildTodayTape combiner — empty case

Defines TapeEvent type + signature. Returns [] for now; subsequent
commits add sleep wake-up, recovery, journal, and workout events.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `buildTodayTape` — journal entries

**Files:**
- Modify: `apps/app/app/utils/buildTodayTape.ts`
- Modify: `apps/app/app/utils/buildTodayTape.test.ts`

- [ ] **Step 1: Add the failing journal test**

Append to `app/utils/buildTodayTape.test.ts`, inside the `describe` block:

```ts
  it("emits one event per journal entry, sorted by createdAt ascending", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j2",
          factorTag: "exercise",
          intensity: 2,
          note: "",
          timestamp: "2026-05-10T09:45:00Z",
          createdAt: "2026-05-10T09:45:00Z",
        },
        {
          id: "j1",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T07:02:00Z",
          createdAt: "2026-05-10T07:02:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })

    expect(events.map((e) => e.id)).toEqual(["journal-j1", "journal-j2"])
    expect(events[0]).toMatchObject({
      type: "journal",
      title: "Caffeine",
      payload: { journalEntryId: "j1" },
    })
    expect(events[0].desc).toMatch(/1 cup/i)
  })

  it("uses factor color for the journal dot when available", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j1",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T07:02:00Z",
          createdAt: "2026-05-10T07:02:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events[0].dotColor).toBe("#F59E0B") // caffeine color from JOURNAL_FACTORS
  })

  it("filters out future-dated journal entries (ts > now)", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j-future",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T20:00:00Z", // after NOW (14:30)
          createdAt: "2026-05-10T20:00:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events).toEqual([])
  })
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -20
```
Expected: 1 PASS (empty), 3 FAIL (the new ones).

- [ ] **Step 3: Implement journal handling in `buildTodayTape.ts`**

Replace the body of `buildTodayTape` with the following. Also add the imports listed at the top.

At the **top** of `app/utils/buildTodayTape.ts`, add:

```ts
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
```

Replace the function body:

```ts
export function buildTodayTape(input: {
  homeView: HomeViewModel | null
  journalEntries: JournalEntryResponse[]
  now: number
  colors: ColorTokens
  selectedDate: string
}): TapeEvent[] {
  const { journalEntries, now, colors } = input
  const events: TapeEvent[] = []

  for (const entry of journalEntries) {
    const ts = new Date(entry.createdAt).getTime()
    if (!Number.isFinite(ts)) continue
    if (ts > now) continue

    const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
    const dotColor = factor?.color ?? colors.tint
    const title = factor?.label ?? entry.factorTag
    const desc = formatJournalDesc(factor, entry)

    events.push({
      id: `journal-${entry.id}`,
      time: formatTime(ts),
      ts,
      title,
      desc,
      dotColor,
      type: "journal",
      payload: { journalEntryId: entry.id },
    })
  }

  events.sort((a, b) => a.ts - b.ts)
  return events
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

function formatJournalDesc(
  factor: (typeof JOURNAL_FACTORS)[number] | undefined,
  entry: JournalEntryResponse,
): string | undefined {
  if (!factor) return undefined
  const { input } = factor
  if (input.kind === "toggle") return undefined
  if (input.kind === "quantity") {
    const unit = entry.intensity === 1 ? input.unit.replace(/s$/, "") : input.unit
    return `${entry.intensity} ${unit}`
  }
  if (input.kind === "scale") {
    return input.labels[entry.intensity - 1]
  }
  return undefined
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: PASS · 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/buildTodayTape.ts apps/app/app/utils/buildTodayTape.test.ts
git -c commit.gpgsign=false commit -m "feat(tape): emit journal events sorted by createdAt

Pulls factor color/label from JOURNAL_FACTORS. Singularizes the unit
when intensity is 1 (\"1 cup\" not \"1 cups\"). Filters future-dated
entries (past-only per spec).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `buildTodayTape` — recovery scored event

**Files:**
- Modify: `apps/app/app/utils/buildTodayTape.ts`
- Modify: `apps/app/app/utils/buildTodayTape.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block in `buildTodayTape.test.ts`:

```ts
  it("emits a recovery event when homeView has a recovery ring with a value", () => {
    const events = buildTodayTape({
      homeView: makeHomeView({
        recovery: { value: "87", progress: 0.87 },
      }),
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    const recoveryEvents = events.filter((e) => e.type === "recovery")
    expect(recoveryEvents).toHaveLength(1)
    expect(recoveryEvents[0]).toMatchObject({
      title: "Recovery scored 87%",
      dotColor: COLORS.ringRecovery,
    })
  })

  it("does not emit a recovery event when value is empty / placeholder", () => {
    const events = buildTodayTape({
      homeView: makeHomeView({
        recovery: { value: "--", progress: 0 },
      }),
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events.filter((e) => e.type === "recovery")).toEqual([])
  })
```

At the **top** of the test file (above the `describe`), add a `makeHomeView` helper:

```ts
import type { HomeViewModel } from "@/services/api/noopClient"

function makeHomeView(rings: Partial<HomeViewModel["rings"]>): HomeViewModel {
  return {
    selectedDate: "2026-05-10",
    selectedDateTitle: "Today",
    selectedDateSubtitle: "",
    topStrip: { title: "", subtitle: "" },
    rings: {
      sleep: rings.sleep ?? { value: "--", progress: 0 },
      recovery: rings.recovery ?? { value: "--", progress: 0 },
      strain: rings.strain ?? { value: "--", progress: 0 },
    },
    cards: {
      recommendation: { title: "", subtitle: "", footer: "" },
      stress: { title: "", subtitle: "", footer: "" },
      loadPressure: { title: "", subtitle: "", footer: "" },
      liveHeartRate: { title: "", subtitle: "", footer: "" },
    },
    todayOverview: {
      headline: "", detail: "", dailyBalance: "", loadPressure: "",
      sleepReserve: "", confidence: "", dateLabel: "",
    },
    activities: {
      stress: "", spo2: "", skinTemp: "", strain: "", skinTempDelta: "",
      recoveryIndex: "", trainingLoad: "", trainingLoadRiskZone: "",
      spo2Dips: "", activityFeed: [], totalActiveMinutes: "", activityCount: 0,
    },
    confidence: {
      confidence: "", pipelineStatus: "", sourceBlend: "",
      storageMode: "", persistenceHealth: "",
    },
  } as HomeViewModel
}
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: 4 PASS (existing), 1 FAIL ("Recovery scored 87%"). The empty-recovery case may pass by accident (returns [] today).

- [ ] **Step 3: Add the recovery branch in `buildTodayTape`**

In `app/utils/buildTodayTape.ts`, **inside** the function body but **before** the journal `for` loop, add:

```ts
  // Recovery scored — synthetic time at 06:35 of selectedDate
  if (input.homeView) {
    const recoveryValue = parseScalar(input.homeView.rings.recovery.value)
    if (recoveryValue != null) {
      const ts = synthesizeTimeOnDate(input.selectedDate, 6, 35)
      if (Number.isFinite(ts) && ts <= now) {
        events.push({
          id: "recovery-scored",
          time: formatTime(ts),
          ts,
          title: `Recovery scored ${Math.round(recoveryValue)}%`,
          desc: undefined,
          dotColor: input.colors.ringRecovery,
          type: "recovery",
        })
      }
    }
  }
```

At the **bottom** of the file (after the existing helpers), add:

```ts
function parseScalar(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^\d.-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function synthesizeTimeOnDate(dateIso: string, hour: number, minute: number): number {
  // dateIso = "YYYY-MM-DD" — interpret as local time
  const [y, m, d] = dateIso.split("-").map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime()
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: PASS · 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/buildTodayTape.ts apps/app/app/utils/buildTodayTape.test.ts
git -c commit.gpgsign=false commit -m "feat(tape): emit recovery-scored event from homeView.rings.recovery

Synthetic timestamp at 06:35 on selectedDate (real scoredAt field
will follow). parseScalar handles \"--\"/empty/garbage strings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `buildTodayTape` — sleep wake-up + workout activities

**Files:**
- Modify: `apps/app/app/utils/buildTodayTape.ts`
- Modify: `apps/app/app/utils/buildTodayTape.test.ts`

- [ ] **Step 1: Add the failing tests**

Inside the `describe` block:

```ts
  it("emits a sleep wake-up event when there's a sleep ring", () => {
    const events = buildTodayTape({
      homeView: makeHomeView({ sleep: { value: "7:23", progress: 0.92 } }),
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    const sleepEvents = events.filter((e) => e.type === "sleep")
    expect(sleepEvents).toHaveLength(1)
    expect(sleepEvents[0]).toMatchObject({
      title: "Woke up",
      desc: "7:23",
      dotColor: COLORS.ringSleep,
    })
  })

  it("emits one workout event per activity in homeView.activities.activityFeed", () => {
    const homeView = makeHomeView({})
    homeView.activities.activityFeed = [
      { type: "Run", duration: "26:14", strain: "9.2", intensity: "Moderate", time: "09:45" },
      { type: "Yoga", duration: "30:00", strain: "3.1", intensity: "Low", time: "13:00" },
    ]
    const events = buildTodayTape({
      homeView,
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    const workouts = events.filter((e) => e.type === "workout")
    expect(workouts).toHaveLength(2)
    expect(workouts[0]).toMatchObject({
      title: "Run",
      desc: "26:14 · Strain 9.2",
      dotColor: COLORS.ringStrain,
      time: "09:45",
    })
  })
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: 6 PASS, 2 FAIL.

- [ ] **Step 3: Add sleep + workout branches**

In `app/utils/buildTodayTape.ts`, **before** the journal loop and **after** the recovery branch, add:

```ts
  // Sleep wake-up — synthetic time at 06:30 of selectedDate
  if (input.homeView) {
    const sleepLabel = input.homeView.rings.sleep.value
    if (sleepLabel && sleepLabel !== "--") {
      const ts = synthesizeTimeOnDate(input.selectedDate, 6, 30)
      if (Number.isFinite(ts) && ts <= now) {
        events.push({
          id: "sleep-wake",
          time: formatTime(ts),
          ts,
          title: "Woke up",
          desc: sleepLabel,
          dotColor: input.colors.ringSleep,
          type: "sleep",
        })
      }
    }
  }

  // Workouts — from activities.activityFeed (time is "HH:MM" already)
  if (input.homeView) {
    for (let i = 0; i < input.homeView.activities.activityFeed.length; i++) {
      const a = input.homeView.activities.activityFeed[i]
      const [h, m] = a.time.split(":").map(Number)
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue
      const ts = synthesizeTimeOnDate(input.selectedDate, h, m)
      if (!Number.isFinite(ts) || ts > now) continue
      events.push({
        id: `workout-${i}`,
        time: a.time,
        ts,
        title: a.type,
        desc: `${a.duration} · Strain ${a.strain}`,
        dotColor: input.colors.ringStrain,
        type: "workout",
      })
    }
  }
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts 2>&1 | tail -10
```
Expected: PASS · 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/buildTodayTape.ts apps/app/app/utils/buildTodayTape.test.ts
git -c commit.gpgsign=false commit -m "feat(tape): emit sleep wake-up + workout events

Sleep wake-up synthesized at 06:30 on selectedDate. Workouts from
activities.activityFeed using each activity's HH:MM time field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `RecoveryHero` component

**Files:**
- Create: `apps/app/app/components/home/RecoveryHero.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/RecoveryHero.tsx`:

```tsx
import { FC, useEffect } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import { Easing, useSharedValue, withTiming } from "react-native-reanimated"

import { CircularProgress } from "@/components/reactx/circular-progress"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  /** 0–1 progress for the ring stroke. */
  value: number
  /** Centered number text — usually `${percent}%`. */
  label: string
  /** Bold one-liner under the ring (e.g. "Push hard."). */
  verdict: string
  /** Dim sub-line under the verdict. */
  verdictDetail: string
  onPress?: () => void
}

export const RecoveryHero: FC<Props> = ({ value, label, verdict, verdictDetail, onPress }) => {
  const colors = LOCAL_THEME.colors
  const progress = useSharedValue(0)

  useEffect(() => {
    const target = Math.round(Math.max(0, Math.min(1, value)) * 100)
    progress.value = withTiming(target, { duration: 800, easing: Easing.out(Easing.ease) })
  }, [value, progress])

  return (
    <View style={$wrap}>
      <Pressable onPress={onPress} style={$ringPress} disabled={!onPress}>
        <CircularProgress
          progress={progress}
          size={160}
          strokeWidth={8}
          progressCircleColor={colors.ringRecovery}
          outerCircleColor={colors.surfaceCard}
          backgroundColor="transparent"
          gap={0}
          renderIcon={() => (
            <View style={$ringInner}>
              <Text
                text={label}
                style={{
                  color: colors.text,
                  fontSize: 44,
                  fontWeight: "900",
                  letterSpacing: -1.5,
                  lineHeight: 48,
                  fontVariant: ["tabular-nums"],
                }}
              />
              <Text
                text="RECOVERY"
                style={{
                  color: colors.textDim,
                  fontSize: 8,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  marginTop: 2,
                }}
              />
            </View>
          )}
        />
      </Pressable>

      <Text
        text={verdict}
        style={{
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: -0.2,
          marginTop: 12,
          textAlign: "center",
        }}
      />
      <Text
        text={verdictDetail}
        style={{
          color: colors.textDim,
          fontSize: 10,
          marginTop: 2,
          textAlign: "center",
        }}
      />
    </View>
  )
}

const $wrap: ViewStyle = {
  alignItems: "center",
  marginTop: 16,
  marginBottom: 24,
}

const $ringPress: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}

const $ringInner: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "RecoveryHero" | head
```
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/RecoveryHero.tsx
git -c commit.gpgsign=false commit -m "feat(home): RecoveryHero component

Centered 160×160 ring with green stroke, 44pt-900 score, RECOVERY
eyebrow, then bold verdict + dim detail line. Wraps the existing
CircularProgress.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `StatTile` component

**Files:**
- Create: `apps/app/app/components/home/StatTile.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/StatTile.tsx`:

```tsx
import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { hexWithAlpha } from "@/utils/hexWithAlpha"

type Props = {
  label: string
  value: string
  desc?: string
  /** Hex color for the corner halo (e.g. "#A78BFA"). */
  tint: string
  onPress?: () => void
}

export const StatTile: FC<Props> = ({ label, value, desc, tint, onPress }) => {
  const colors = LOCAL_THEME.colors

  const content = (
    <View style={[$tile, { backgroundColor: colors.surfaceCard }]}>
      <View style={[$halo, { backgroundColor: hexWithAlpha(tint, 0.18) }]} pointerEvents="none" />
      <Text
        text={label.toUpperCase()}
        style={{
          color: colors.textDim,
          fontSize: 7,
          fontWeight: "700",
          letterSpacing: 1.2,
        }}
      />
      <Text
        text={value}
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: "900",
          letterSpacing: -0.5,
          marginTop: 2,
          fontVariant: ["tabular-nums"],
        }}
      />
      {desc ? (
        <Text
          text={desc}
          style={{ color: colors.textMuted, fontSize: 9, marginTop: 1 }}
          numberOfLines={1}
        />
      ) : null}
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}
    >
      {content}
    </Pressable>
  )
}

const $tile: ViewStyle = {
  borderRadius: 12,
  padding: 12,
  overflow: "hidden",
  position: "relative",
  flex: 1,
  minHeight: 76,
}

const $halo: ViewStyle = {
  position: "absolute",
  top: -20,
  right: -20,
  width: 60,
  height: 60,
  borderRadius: 30,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "StatTile" | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/StatTile.tsx
git -c commit.gpgsign=false commit -m "feat(home): StatTile primitive

Flat surface, 12pt corner radius, with a 60×60 round corner halo
(metric tint at 0.18 alpha) clipped via overflow:hidden. Eyebrow
label, big tabular-nums value, optional desc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `StatGrid` component

**Files:**
- Create: `apps/app/app/components/home/StatGrid.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/StatGrid.tsx`:

```tsx
import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { StatTile } from "./StatTile"

export type StatGridItem = {
  key: string
  label: string
  value: string
  desc?: string
  tint: string
  onPress?: () => void
}

type Props = {
  items: StatGridItem[]
}

/**
 * Renders a 2×2 grid. Expects exactly 4 items; fewer/more still render
 * but layout assumes 4.
 */
export const StatGrid: FC<Props> = ({ items }) => {
  const rows: StatGridItem[][] = [items.slice(0, 2), items.slice(2, 4)]
  return (
    <View style={$grid}>
      {rows.map((row, i) => (
        <View key={`row-${i}`} style={$row}>
          {row.map((item) => (
            <StatTile
              key={item.key}
              label={item.label}
              value={item.value}
              desc={item.desc}
              tint={item.tint}
              onPress={item.onPress}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

const $grid: ViewStyle = {
  gap: 8,
}

const $row: ViewStyle = {
  flexDirection: "row",
  gap: 8,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "StatGrid" | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/StatGrid.tsx
git -c commit.gpgsign=false commit -m "feat(home): StatGrid 2×2 wrapper

Takes 4 StatGridItems and renders them as two horizontal rows with
8px gaps. Pure presentational — no theme reads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `TapeRow` component

**Files:**
- Create: `apps/app/app/components/home/TapeRow.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/TapeRow.tsx`:

```tsx
import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  time: string // "HH:MM"
  dotColor: string
  title: string
  desc?: string
  onPress?: () => void
}

export const TapeRow: FC<Props> = ({ time, dotColor, title, desc, onPress }) => {
  const colors = LOCAL_THEME.colors

  const content = (
    <View style={$row}>
      <Text
        text={time}
        style={{
          color: colors.textMuted,
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 0.5,
          minWidth: 38,
          paddingTop: 3,
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={[$dot, { backgroundColor: dotColor }]} />
      <View style={$body}>
        <Text
          text={title}
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}
        />
        {desc ? (
          <Text
            text={desc}
            numberOfLines={2}
            style={{ color: colors.textDim, fontSize: 9, marginTop: 1 }}
          />
        ) : null}
      </View>
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  gap: 10,
  alignItems: "flex-start",
  paddingVertical: 8,
}

const $dot: ViewStyle = {
  width: 7,
  height: 7,
  borderRadius: 4,
  marginTop: 6,
  flexShrink: 0,
}

const $body: ViewStyle = {
  flex: 1,
  minWidth: 0,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "TapeRow" | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/TapeRow.tsx
git -c commit.gpgsign=false commit -m "feat(home): TapeRow primitive

Time column (38px, tabular-nums, 700 weight) + colored dot +
two-line title/desc body. Optional press wrapper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `TodayTape` component

**Files:**
- Create: `apps/app/app/components/home/TodayTape.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/TodayTape.tsx`:

```tsx
import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import type { TapeEvent } from "@/utils/buildTodayTape"
import { TapeRow } from "./TapeRow"

type Props = {
  events: TapeEvent[]
  onEventPress?: (event: TapeEvent) => void
}

export const TodayTape: FC<Props> = ({ events, onEventPress }) => {
  const colors = LOCAL_THEME.colors

  if (events.length === 0) {
    return (
      <View style={$empty}>
        <Text
          text="Nothing logged yet today."
          style={{ color: colors.textDim, fontSize: 11 }}
        />
        <Text
          text="Tap + to log your first entry."
          style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}
        />
      </View>
    )
  }

  return (
    <View>
      {events.map((event, i) => (
        <View key={event.id}>
          <TapeRow
            time={event.time}
            dotColor={event.dotColor}
            title={event.title}
            desc={event.desc}
            onPress={onEventPress ? () => onEventPress(event) : undefined}
          />
          {i < events.length - 1 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.divider,
                marginLeft: 38 + 10 + 7 + 10, // time width + gap + dot + gap
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  )
}

const $empty: ViewStyle = {
  paddingVertical: 16,
  alignItems: "flex-start",
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "TodayTape" | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/TodayTape.tsx
git -c commit.gpgsign=false commit -m "feat(home): TodayTape list + empty state

Renders TapeRow per event, hairline divider between rows (indented
past dot column). Empty state renders the \"Tap + to log\" prompt.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `HomeFab` floating action button

**Files:**
- Create: `apps/app/app/components/home/HomeFab.tsx`

- [ ] **Step 1: Create the component**

Create `apps/app/app/components/home/HomeFab.tsx`:

```tsx
import { FC } from "react"
import { Ionicons } from "@expo/vector-icons"
import { Platform, Pressable, ViewStyle } from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  onPress: () => void
}

export const HomeFab: FC<Props> = ({ onPress }) => {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        $fab,
        { backgroundColor: colors.tint },
        Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.5 : 0.18,
            shadowRadius: 16,
          },
          android: { elevation: 8 },
        }),
        pressed && { transform: [{ scale: 0.95 }], opacity: 0.92 },
      ]}
      accessibilityLabel="Log a journal entry"
      accessibilityRole="button"
    >
      <Ionicons name="add" size={28} color={colors.onPrimary} />
    </Pressable>
  )
}

const $fab: ViewStyle = {
  position: "absolute",
  right: 16,
  bottom: 88,
  width: 56,
  height: 56,
  borderRadius: 28,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "HomeFab" | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/HomeFab.tsx
git -c commit.gpgsign=false commit -m "feat(home): HomeFab — circular brand-orange action button

56×56 absolute-positioned, 16px from right, 88px from bottom (clears
the tab bar). Heavy shadow on iOS, elevation on Android.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Wire HomeScreen — replace body, keep shell

**Files:**
- Modify: `apps/app/app/screens/HomeScreen.tsx`

This is the biggest task. The shell stays (PanGestureHandler → SafeAreaView → Animated.ScrollView with onScroll/refreshControl/scrollEnabled → BlurHeader). Inside the ScrollView, the topStrip stays. Below the topStrip, replace `PrimaryMetricsList` + `JournalChips` + `HomeActionRow` list with: `RecoveryHero` → eyebrow → `StatGrid` → eyebrow → `TodayTape`. Add `HomeFab` as a sibling of the ScrollView (inside SafeAreaView, after the ScrollView so it sits on top).

- [ ] **Step 1: Add new imports at the top**

Open `apps/app/app/screens/HomeScreen.tsx`. Add these imports near the existing component imports:

```tsx
import { RecoveryHero } from "@/components/home/RecoveryHero"
import { StatGrid, type StatGridItem } from "@/components/home/StatGrid"
import { TodayTape } from "@/components/home/TodayTape"
import { HomeFab } from "@/components/home/HomeFab"
import { buildTodayTape, type TapeEvent } from "@/utils/buildTodayTape"
import { recoveryVerdict } from "@/utils/recoveryVerdict"
```

- [ ] **Step 2: Compute the new derived values inside `HomeScreen`**

Just **above** the `return (` statement of the `HomeScreen` component, add:

```tsx
  const recoveryProgress = homeView?.rings.recovery.progress ?? 0
  const recoveryLabelText = homeView?.rings.recovery.value
    ? `${homeView.rings.recovery.value}%`
    : "--"
  const recoveryNumeric = homeView?.rings.recovery.value
    ? parseFloat(homeView.rings.recovery.value)
    : null
  const verdict = recoveryVerdict(recoveryNumeric)

  const statItems: StatGridItem[] = [
    {
      key: "sleep",
      label: "Sleep",
      value: homeView?.rings.sleep.value ?? "--",
      desc: undefined,
      tint: colors.ringSleep,
      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
    },
    {
      key: "strain",
      label: "Strain",
      value: homeView?.rings.strain.value ?? "--",
      desc: undefined,
      tint: colors.ringStrain,
      onPress: () => navigateTo("StrainActivity", "strain-activity"),
    },
    {
      key: "hrv",
      label: "HRV",
      value: homeView?.activities.recoveryIndex || "--",
      desc: "ms",
      tint: colors.ringHrv,
      onPress: () => navigateTo("HomeMetric", "home-metric", { metric: "recovery" }),
    },
    {
      key: "journal",
      label: "Journal",
      value: String(journalEntries.length),
      desc: journalEntries.length === 1 ? "entry" : "entries",
      tint: colors.tint,
      onPress: () => navigateTo("JournalHistory", "journal-history"),
    },
  ]

  const tapeEvents = useMemo<TapeEvent[]>(
    () =>
      buildTodayTape({
        homeView,
        journalEntries,
        now: Date.now(),
        colors: {
          ringRecovery: colors.ringRecovery,
          ringSleep: colors.ringSleep,
          ringStrain: colors.ringStrain,
          ringHrv: colors.ringHrv,
          tint: colors.tint,
        },
        selectedDate,
      }),
    [homeView, journalEntries, selectedDate, colors],
  )

  function handleTapePress(event: TapeEvent) {
    switch (event.type) {
      case "sleep":
        navigateTo("SleepDetail", "sleep-detail", { date: selectedDate })
        break
      case "recovery":
      case "vital":
        navigateTo("HomeMetric", "home-metric", { metric: "recovery" })
        break
      case "journal":
        navigateTo("JournalEntry", "journal-entry", event.payload?.journalEntryId
          ? { id: event.payload.journalEntryId }
          : undefined)
        break
      case "workout":
        navigateTo("StrainActivity", "strain-activity")
        break
    }
  }
```

(`useMemo` is already imported in HomeScreen.tsx — verify in the existing import list.)

- [ ] **Step 3: Replace the inner content of the ScrollView**

Locate the JSX inside `<Animated.ScrollView ...>`. Find the `<View style={themed($topStrip)}>` block. The `topStrip` block stays exactly as it is. **Below** the closing `</View>` of the topStrip, **replace** the existing `<View style={themed($dayContentWrap)}>...</View>` block (which contains the old skeleton/loading + `PrimaryMetricsList` + JournalChips + HomeActionRow) with the new content:

```tsx
          <View style={themed($dayContentWrap)}>
            {isHomeViewLoading ? (
              <Animated.View
                key={contentKey}
                entering={FadeIn.duration(90)}
                exiting={FadeOut.duration(90)}
              >
                <HomeDaySkeleton />
              </Animated.View>
            ) : (
              <Animated.View
                key={contentKey}
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(90)}
              >
                <RecoveryHero
                  value={recoveryProgress}
                  label={recoveryLabelText}
                  verdict={verdict.verdict}
                  verdictDetail={verdict.detail}
                  onPress={() => navigateTo("HomeMetric", "home-metric", { metric: "recovery" })}
                />

                <Text
                  text="STATS"
                  style={{
                    color: colors.textDim,
                    fontSize: 8,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    marginBottom: 8,
                    marginLeft: 2,
                  }}
                />
                <StatGrid items={statItems} />

                <Text
                  text="TODAY'S TAPE"
                  style={{
                    color: colors.textDim,
                    fontSize: 8,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    marginTop: 28,
                    marginBottom: 8,
                    marginLeft: 2,
                  }}
                />
                <TodayTape events={tapeEvents} onEventPress={handleTapePress} />
              </Animated.View>
            )}
          </View>
```

- [ ] **Step 4: Add `HomeFab` after the ScrollView**

Find the closing `</Animated.ScrollView>` inside the `<SafeAreaView>`. **Below** it (still inside the SafeAreaView, before `<BlurHeader ... />`), add:

```tsx
        <HomeFab onPress={() => navigateTo("JournalEntry", "journal-entry")} />
```

- [ ] **Step 5: Typecheck**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "HomeScreen" | head
```
Expected: empty (no errors in HomeScreen).

- [ ] **Step 6: Smoke-run on iOS sim (if available)**

```bash
pnpm ios 2>&1 | tail -20
```
Expected: app boots; Home tab renders the new layout. Tap each tile and FAB to verify navigation. Pull-to-refresh works. Horizontal swipe still changes day.

If `pnpm ios` is unavailable in the engineer's environment, skip and proceed; the next task removes dead code which exposes any unused-import or unused-symbol errors that would catch wiring problems.

- [ ] **Step 7: Commit**

```bash
git add apps/app/app/screens/HomeScreen.tsx
git -c commit.gpgsign=false commit -m "feat(home): wire RecoveryHero + StatGrid + TodayTape + HomeFab

Old PrimaryMetricsList / JournalChips / HomeActionRow are still
defined locally in this file but no longer rendered. Next commit
deletes them. Tap routes preserved (sleep-detail, strain-activity,
home-metric, journal-history, journal-entry).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Delete dead code from HomeScreen

**Files:**
- Modify: `apps/app/app/screens/HomeScreen.tsx`

The replaced sections of HomeScreen still contain the old `PrimaryMetricsList`, `JournalChips`, `HomeActionRow`, and `HomeDaySkeleton` (the old version) function components and their style helpers. The new HomeDaySkeleton needs to mirror the new layout. Delete and replace.

- [ ] **Step 1: Delete `PrimaryMetricsList` function and related styles**

In `apps/app/app/screens/HomeScreen.tsx`, locate the `function PrimaryMetricsList(` block. Delete the entire function (everything from `function PrimaryMetricsList({...}) {` through its closing `}` before the next named export/function).

Also delete these style helpers (search for and remove each, including its const declaration and arrow body):
- `$primaryMetricsList`
- `$ringContainer`
- `$ringCenterContent`
- `$ringValueRow`
- `$ringPercentSign`
- `$ringLabel`
- `$pillStack`
- `$glassCardShadow`
- `$glassCardClip`
- `$glassCardBase`
- `$cardAccentDot`
- `$glassBorder`
- `$glassCardContent`
- `$glassCardTop`
- `$glassCardLabel`
- `$glassCardValue`

- [ ] **Step 2: Delete `JournalChips` and related styles**

Delete the `function JournalChips(` block in full.

Delete styles:
- `$chipScroll`
- `$chipScrollContent`
- `$chip`
- `chipDetail` (the helper function above `JournalChips`)

- [ ] **Step 3: Delete `HomeActionRow` and related styles**

Delete the `function HomeActionRow(` block in full.

Delete styles:
- `$actionList`
- `$actionRow`
- `$actionIconWrap`
- `$actionTitle`
- `$myDayHeader`
- `$myDayTitle`
- `$plusButton`

- [ ] **Step 4: Replace the old `HomeDaySkeleton`**

Find `function HomeDaySkeleton()`. Replace its body to mirror the new layout (one ring placeholder + four tile placeholders + four tape-row placeholders):

```tsx
function HomeDaySkeleton() {
  return (
    <View style={themed($homeDaySkeleton)}>
      <View style={{ alignItems: "center", marginTop: 16, marginBottom: 24 }}>
        <SkeletonBlock style={{ width: 160, height: 160, borderRadius: 80 }} />
        <SkeletonBlock style={{ width: 120, height: 14, borderRadius: 4, marginTop: 12 }} />
      </View>
      <SkeletonBlock style={{ width: 50, height: 10, borderRadius: 4, marginBottom: 8 }} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
        </View>
      </View>
      <SkeletonBlock style={{ width: 80, height: 10, borderRadius: 4, marginTop: 28, marginBottom: 8 }} />
      <View style={{ gap: 6 }}>
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
      </View>
    </View>
  )
}
```

Also delete the now-unused old skeleton style helpers:
- `$primaryMetricsSkeletonList`
- `$primaryMetricRowSkeleton`
- `$compactMetricsSkeleton`
- `$myDayTitleSkeleton`
- `$plusSkeleton`
- `$actionRowSkeleton`

(`$skeletonBlock`, `$dayContentWrap`, `$homeDaySkeleton`, `$container`, `$screenWrap`, `$topStrip`, `$dateSwitcher`, `$switcherButton`, `$switcherTitle`, `$devicePill`, `$deviceIconWrap`, `$chargeBolt`, `$devicePillText` all stay — they're still used.)

- [ ] **Step 5: Drop now-unused imports**

If any of these are no longer referenced anywhere in HomeScreen.tsx after the deletions, remove them from the imports:
- `BlurView` (was used by old PrimaryMetricsList glass cards)
- `LinearGradient`
- `Svg`, `Defs`, `RadialGradient`, `Stop`, `Ellipse`
- `RollingCounter`
- `Glow`
- `JOURNAL_FACTORS`

Verify by searching the file for each name; only remove imports that have zero remaining references.

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm exec tsc --noEmit -p . --pretty 2>&1 | grep -iE "HomeScreen" | head
pnpm exec eslint --fix app/screens/HomeScreen.tsx 2>&1 | tail -5
```
Expected: typecheck output empty for HomeScreen; eslint reports zero errors after auto-fix.

- [ ] **Step 7: Commit**

```bash
git add apps/app/app/screens/HomeScreen.tsx
git -c commit.gpgsign=false commit -m "chore(home): delete PrimaryMetricsList, JournalChips, HomeActionRow

Replaced in the previous commit by RecoveryHero + StatGrid + TodayTape.
Also rebuilt HomeDaySkeleton for the new layout (ring + 2×2 tiles +
4 tape rows). Drops now-unused imports (BlurView, LinearGradient,
Svg + RadialGradient + Stop + Ellipse, RollingCounter, Glow,
JOURNAL_FACTORS) and ~20 dead style helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Final verification pass

**Files:** none

- [ ] **Step 1: Full typecheck — confirm only pre-existing errors remain**

```bash
cd apps/app
pnpm exec tsc --noEmit -p . --pretty 2>&1 | tail -10
```

Expected: "Found 48 errors in 4 files" (the same pre-existing count). The 4 files should be: `app.config.ts`, `app/components/reactx/toast/context/ToastContext.tsx`, `app/services/api/apiProblem.test.ts`, `app/utils/storage/storage.test.ts`. **Any other file appearing here is a regression — go back and fix.**

- [ ] **Step 2: Full unit tests**

```bash
pnpm exec jest app/utils/buildTodayTape.test.ts app/utils/recoveryVerdict.test.ts app/utils/hexWithAlpha.test.ts 2>&1 | tail -10
```
Expected: All three suites green.

- [ ] **Step 3: Lint touched files**

```bash
pnpm exec eslint --fix \
  app/screens/HomeScreen.tsx \
  app/utils/localTheme.ts \
  app/utils/buildTodayTape.ts \
  app/utils/recoveryVerdict.ts \
  app/utils/hexWithAlpha.ts \
  app/components/home/RecoveryHero.tsx \
  app/components/home/StatTile.tsx \
  app/components/home/StatGrid.tsx \
  app/components/home/TapeRow.tsx \
  app/components/home/TodayTape.tsx \
  app/components/home/HomeFab.tsx 2>&1 | tail -5
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Manual smoke pass on iOS simulator**

If a simulator is available:
1. `pnpm ios`
2. Verify: Recovery ring renders centered, animates from 0 → target on mount.
3. Verify: verdict line shows "Push hard." / "Train moderately." / "Take it easy." per recovery score, or "Awaiting data." with `--`.
4. Verify: STATS eyebrow + 2×2 grid of tinted tiles. Each tile tappable; routes go to sleep-detail / strain-activity / home-metric / journal-history.
5. Verify: TODAY'S TAPE eyebrow + chronological events. Each tappable; routes correctly.
6. Verify: FAB visible bottom-right; taps open journal-entry modal.
7. Verify: Pull-to-refresh works. Horizontal swipe changes day.
8. Verify: Theme toggle in Settings flips light/dark; the home renders correctly in both.

If no simulator: at minimum run `pnpm exec expo export --platform web 2>&1 | tail -10` to confirm the bundle builds.

- [ ] **Step 5: Final summary commit (no-op if all green)**

If steps 1–3 all pass and step 4 completed without changes, no commit is needed; the implementation is done. Otherwise, fix issues in their relevant tasks above.

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| Visual layout (ring → grid → tape + FAB) | Task 14 (wiring) |
| `RecoveryHero` component | Task 8 |
| `StatGrid` + `StatTile` | Tasks 9, 10 |
| `TodayTape` + `TapeRow` | Tasks 11, 12 |
| `HomeFab` | Task 13 |
| `buildTodayTape` combiner with all event types | Tasks 4, 5, 6, 7 |
| `recoveryVerdict` (computed copy, 4 buckets) | Task 3 |
| `ringHrv` token addition | Task 1 |
| Halo without SVG (View + radial-equivalent) | Task 9 (`StatTile`) |
| Tap routes for ring / 4 tiles / FAB / 5 tape event types | Task 14 (`handleTapePress` + statItems) |
| Pull-to-refresh kept | Task 14 (preserved RefreshControl) |
| Horizontal day-swipe kept (`activeOffsetX={[-15,15]}`) | Task 14 (PanGestureHandler shell preserved, not edited) |
| BlurHeader fade kept | Task 14 (preserved at end of SafeAreaView) |
| Removal of `PrimaryMetricsList` / `JournalChips` / `HomeActionRow` / "My Day" header / orange `+` button | Task 15 |
| Skeleton rebuilt for new layout | Task 15 (new `HomeDaySkeleton`) |
| Empty-state copy on tape ("Tap + to log…") | Task 12 (`TodayTape` empty branch) |
| `tabular-nums` on numeric values | Tasks 8, 9, 11 |
| Brand orange used only on FAB + Journal tile | Tasks 13, 14 |

No spec section is uncovered.

**Placeholder scan:** No "TBD" / "TODO" in plan body. All code blocks contain actual implementations. Test code is concrete with real expected values.

**Type consistency check:** `TapeEvent` shape is defined in Task 4 and consumed identically in Tasks 11, 12, and 14 (`TapeRow`, `TodayTape`, `HomeScreen`). `StatGridItem` is defined in Task 10 and used in Task 14. `RecoveryVerdict` is defined and consumed in Task 3 and Task 14.

**Scope check:** This is a single screen redesign with 7 new files + 2 modifications. Single implementation plan is correct scope.
