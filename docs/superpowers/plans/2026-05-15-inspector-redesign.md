# Inspector Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Noop Inspector into a power-user-grade, command-driven, time-aware control room — keeping debugger density while dramatically improving information scent, microcopy, performance, accessibility, and visual quality.

**Architecture:** React 19 + Vite 8 + Tailwind v4 + recharts. Replace monolithic `App.tsx` shell with top-bar + icon-rail layout. Replace `Promise.all` `refresh()` with per-tab React Query hooks. URL params for shareable state. Lazy-loaded tab modules with manualChunks splitting recharts. Status semantics layered into primitives (`Num`/`Row`/`Pill`).

**Tech additions:** `@tanstack/react-query`, `@tanstack/react-virtual`. No router lib (URLSearchParams directly).

**Locked decisions:**
1. Routing → URLSearchParams (no deps).
2. DayTimeline → LTTB downsample + recharts (uplot deferred).
3. Backend shims → UI-first; UI degrades gracefully when shim endpoints absent.

**Build order:** Foundation → Shell → Power-user surface → Home tab → per-tab upgrades → A11y/cleanup.

---

## File Structure

```
apps/inspector/src/
├── main.tsx                      [unchanged]
├── App.tsx                       [shrinks to ~30 LOC: auth gate]
├── screens/
│   ├── SignIn.tsx                [new — extracted from App.tsx]
│   └── Inspector.tsx             [new — shell + tab routing]
├── shell/
│   ├── TopBar.tsx                [new — date + status + actions]
│   ├── IconRail.tsx              [new — 48px nav]
│   ├── CommandPalette.tsx        [new — ⌘K]
│   ├── HelpModal.tsx             [new — ? shortcut list]
│   └── tokens.ts                 [new — shell layout constants]
├── hooks/
│   ├── useUrlState.ts            [new — URLSearchParams sync]
│   ├── useKeyboardShortcuts.ts   [new]
│   ├── useInspectorQueries.ts    [new — React Query hooks]
│   ├── useLiveTail.ts            [new — global live mode]
│   └── useScrubController.ts     [new — cross-chart sync]
├── api.ts                        [modified — typed errors + sessionStorage]
├── format.ts                     [unchanged]
├── index.css                     [modified — new tokens]
├── tabs/
│   ├── Home.tsx                  [new — replaces Overview]
│   ├── Sleep.tsx                 [modified — scrub controller, scatter]
│   ├── Pipeline.tsx              [modified — hero + drill-in]
│   ├── Raw.tsx                   [modified — filter + virt + copy]
│   ├── Trends.tsx                [modified — shared domain]
│   ├── Insights.tsx              [modified — sentence-first]
│   └── Telemetry.tsx             [modified — log search + grouping]
├── components/
│   ├── primitives.tsx            [modified — status props]
│   ├── DayTimeline.tsx           [modified — LTTB]
│   ├── Hypnogram.tsx             [modified — scrub + tooltip]
│   ├── StageHrScatter.tsx        [new]
│   ├── PipelineRunsChart.tsx     [modified — static legend + click]
│   ├── TrendChart.tsx            [modified — shared domain]
│   ├── RunPipelineMenu.tsx       [modified — Escape + focus restore]
│   ├── VirtualTable.tsx          [new — generic virtualized table]
│   ├── StatusBadge.tsx           [new — pipeline/strap/night pills]
│   ├── MetricChip.tsx            [new — value + 14d avg + baseline dot]
│   └── SyncTrail.tsx             [new]
└── utils/
    ├── lttb.ts                   [new — downsampling]
    └── errors.ts                 [new — error classification]
```

Files removed in cleanup: none (everything either gets replaced via `Inspector.tsx` or shrinks to a smaller responsibility).

---

## Task List

### Task 1: Install dependencies

**Files:**
- Modify: `apps/inspector/package.json`

- [ ] **Step 1: Add deps**

```bash
cd /Users/nish/Documents/noop/apps/inspector
pnpm add @tanstack/react-query @tanstack/react-virtual
```

- [ ] **Step 2: Verify install**

Run: `pnpm ls @tanstack/react-query @tanstack/react-virtual`
Expected: both listed.

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/package.json pnpm-lock.yaml
git commit -m "inspector: add react-query and react-virtual"
```

---

### Task 2: Visual tokens — surface layering and status colors

**Files:**
- Modify: `apps/inspector/src/index.css`

- [ ] **Step 1: Update `@theme` block**

Replace the existing token block with:

```css
@theme {
  --color-surface: #09090b;
  --color-surface-1: #111113;
  --color-surface-raised: #1c1c1f;
  --color-surface-2: #18181b;
  --color-surface-3: #222225;
  --color-border: rgba(255, 255, 255, 0.10);
  --color-border-strong: rgba(255, 255, 255, 0.18);
  --color-text-0: #fafafa;
  --color-text-1: #a1a1aa;
  --color-text-2: #7e7e8c;
  --color-accent: #3b82f6;
  --color-accent-soft: rgba(59, 130, 246, 0.12);
  --color-green: #22c55e;
  --color-green-soft: rgba(34, 197, 94, 0.12);
  --color-red: #ef4444;
  --color-red-soft: rgba(239, 68, 68, 0.10);
  --color-yellow: #eab308;
  --color-yellow-soft: rgba(234, 179, 8, 0.12);
  --color-stage-awake: #FE8A73;
  --color-stage-rem: #3FB1E7;
  --color-stage-core: #5BA8FF;
  --color-stage-deep: #7B78D6;
  --font-size-dense: 13px;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/index.css
git commit -m "inspector: lift text-2/border/stage tokens for WCAG AA"
```

---

### Task 3: Primitives upgrade — status semantics + density

**Files:**
- Modify: `apps/inspector/src/components/primitives.tsx`

- [ ] **Step 1: Add status type + colored borders to `Num`**

Replace the `Num` component with one that accepts an optional `status` prop:

```tsx
export type Status = "ok" | "warn" | "error" | "stale"

const STATUS_BAR: Record<Status, string> = {
  ok: "border-l-green",
  warn: "border-l-yellow",
  error: "border-l-red",
  stale: "border-l-text-2",
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-green",
  warn: "text-yellow",
  error: "text-red",
  stale: "text-text-2",
}

export function Num({
  label,
  value,
  sub,
  status,
}: {
  label: string
  value: string | number
  sub: string
  status?: Status
}) {
  const bar = status ? `border-l-2 ${STATUS_BAR[status]} pl-3` : ""
  const valueColor = status ? STATUS_TEXT[status] : ""
  return (
    <div className={bar}>
      <p className="text-text-2 text-sm">{label}</p>
      <p className={`text-3xl font-semibold tracking-tight mt-1 tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-text-2 text-sm mt-0.5">{sub}</p>
    </div>
  )
}
```

- [ ] **Step 2: Add `dense` + `highlight` to `Row`**

```tsx
export function Row({
  k,
  v,
  dense,
  highlight,
}: {
  k: string
  v: ReactNode
  dense?: boolean
  highlight?: Status
}) {
  const padding = dense ? "py-1.5" : "py-2.5"
  const size = dense ? "text-[13px]" : ""
  const valueColor = highlight ? STATUS_TEXT[highlight] : ""
  return (
    <div className={`flex items-baseline justify-between ${padding} border-b border-border/60 gap-4 ${size}`}>
      <span className="text-text-2 shrink-0">{k}</span>
      <span className={`text-right max-w-[60%] truncate tabular-nums ${valueColor}`}>{v}</span>
    </div>
  )
}
```

- [ ] **Step 3: `Pill` → `rounded-full`**

Change `rounded-md` to `rounded-full` in the Pill component.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/components/primitives.tsx
git commit -m "inspector: add status semantics to Num/Row, rounded-full Pill"
```

---

### Task 4: Error model — typed exceptions in api.ts

**Files:**
- Create: `apps/inspector/src/utils/errors.ts`
- Modify: `apps/inspector/src/api.ts`

- [ ] **Step 1: Write the error utility**

```ts
// utils/errors.ts
export class AuthError extends Error {
  readonly kind = "auth" as const
}
export class ServerError extends Error {
  readonly kind = "server" as const
  constructor(message: string, public status: number) { super(message) }
}
export class NetworkError extends Error {
  readonly kind = "network" as const
}
export class ParseError extends Error {
  readonly kind = "parse" as const
}

export type ApiError = AuthError | ServerError | NetworkError | ParseError

export function classifyError(e: unknown): ApiError {
  if (e instanceof AuthError || e instanceof ServerError || e instanceof NetworkError || e instanceof ParseError) {
    return e
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return new NetworkError(e.message)
  }
  return new ServerError(e instanceof Error ? e.message : String(e), 0)
}
```

- [ ] **Step 2: Update `parseJson` and add 401 interception**

In `api.ts`, replace the existing `parseJson` and `tokenStorage` to:
- Throw `AuthError` on 401
- Throw `ServerError(msg, status)` on other non-OK statuses
- Wrap `fetch` failures in `NetworkError`
- Store token in `sessionStorage` instead of `localStorage`

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/utils/errors.ts apps/inspector/src/api.ts
git commit -m "inspector: typed errors + sessionStorage token"
```

---

### Task 5: URL state hook + LTTB pure function (TDD)

**Files:**
- Create: `apps/inspector/src/hooks/useUrlState.ts`
- Create: `apps/inspector/src/utils/lttb.ts`

- [ ] **Step 1: Write `useUrlState` hook**

```ts
// hooks/useUrlState.ts
import { useEffect, useState } from "react"

export function useUrlState<T extends string>(
  key: string,
  initial: T,
  fromStorage?: () => T | null,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get(key) as T | null
    if (fromUrl) return fromUrl
    if (fromStorage) {
      const fromStore = fromStorage()
      if (fromStore) return fromStore
    }
    return initial
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (value === initial && !params.has(key)) return
    params.set(key, value)
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`)
  }, [key, value, initial])

  return [value, setValue]
}
```

- [ ] **Step 2: Write LTTB (Largest Triangle Three Buckets) downsampling**

```ts
// utils/lttb.ts
export type LttbPoint = { x: number; y: number }

export function lttb<T extends LttbPoint>(data: T[], threshold: number): T[] {
  if (threshold >= data.length || threshold <= 2) return data
  const bucketSize = (data.length - 2) / (threshold - 2)
  const sampled: T[] = [data[0]]
  let a = 0

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length)
    const avgRangeStart = Math.floor(i * bucketSize) + 1
    const avgRangeEnd = Math.floor((i + 1) * bucketSize) + 1
    let avgX = 0, avgY = 0
    const avgCount = avgRangeEnd - avgRangeStart
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += data[j].x
      avgY += data[j].y
    }
    avgX /= avgCount
    avgY /= avgCount

    let maxArea = -1, maxIdx = rangeStart
    const pointAX = data[a].x, pointAY = data[a].y
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((pointAX - avgX) * (data[j].y - pointAY) - (pointAX - data[j].x) * (avgY - pointAY)) * 0.5
      if (area > maxArea) {
        maxArea = area
        maxIdx = j
      }
    }
    sampled.push(data[maxIdx])
    a = maxIdx
  }

  sampled.push(data[data.length - 1])
  return sampled
}
```

- [ ] **Step 3: Smoke-test LTTB in a one-off file** (no test runner installed)

Verify `lttb([{x:0,y:0},{x:1,y:5},{x:2,y:1},{x:3,y:4},{x:4,y:2}], 3).length === 3` by adding a temporary console check, or by reading the code path mentally — first and last points always present.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/hooks/useUrlState.ts apps/inspector/src/utils/lttb.ts
git commit -m "inspector: URL state hook + LTTB downsample utility"
```

---

### Task 6: React Query setup + per-endpoint hooks

**Files:**
- Modify: `apps/inspector/src/main.tsx`
- Create: `apps/inspector/src/hooks/useInspectorQueries.ts`

- [ ] **Step 1: Wrap app in `QueryClientProvider`**

In `main.tsx`, wrap `<App />` in:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// <QueryClientProvider client={qc}><App /></QueryClientProvider>
```

- [ ] **Step 2: Write per-endpoint hooks**

```ts
// hooks/useInspectorQueries.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  apiGet, apiPost, triggerPipelineRun,
  type Overview, type RawRecords, type SleepNight,
  type PipelineResults, type PipelineState, type PipelineRunsHistory,
  type HomeView, type SleepView, type Telemetry, type BatteryHistory, type TrendsView,
  type PipelineRunOptions,
} from "../api"

export function useOverview(token: string, date: string) {
  return useQuery({
    queryKey: ["overview", date],
    queryFn: () => apiGet<Overview>(`/debug/overview?date=${encodeURIComponent(date)}`, token),
    enabled: !!token,
  })
}
// ...one hook per endpoint, plus useRunPipeline + useSeed mutations that
// call queryClient.invalidateQueries on success.
```

Cover: `overview`, `raw`, `sleep`, `results`, `state`, `runs`, `homeView`, `sleepView`, `telemetry`, `batteryHistory`, `trends`. Mutations: `useRunPipeline`, `useSeed`.

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/main.tsx apps/inspector/src/hooks/useInspectorQueries.ts
git commit -m "inspector: react-query setup + per-endpoint hooks"
```

---

### Task 7: Shell tokens + StatusBadge + MetricChip primitives

**Files:**
- Create: `apps/inspector/src/shell/tokens.ts`
- Create: `apps/inspector/src/components/StatusBadge.tsx`
- Create: `apps/inspector/src/components/MetricChip.tsx`

- [ ] **Step 1: `shell/tokens.ts`**

```ts
export const TOP_BAR_HEIGHT = 48
export const RAIL_WIDTH = 48
export const PAGE_PADDING_X = 32
```

- [ ] **Step 2: `StatusBadge` component**

Pill that renders `{ label, status, detail?, action?: { label, onClick } }`. Status drives bg + border + text color. Action renders as inline button on the right. Used by Home hero row, Pipeline tab hero, top bar.

- [ ] **Step 3: `MetricChip` component**

Renders `{ label, value, unit?, avg14d?, baseline? }`. Three stacked dots on the right edge: today, 14d avg, baseline (using `--color-text-2` for older, `--color-text-0` for today).

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/shell/tokens.ts apps/inspector/src/components/StatusBadge.tsx apps/inspector/src/components/MetricChip.tsx
git commit -m "inspector: StatusBadge + MetricChip primitives"
```

---

### Task 8: TopBar component

**Files:**
- Create: `apps/inspector/src/shell/TopBar.tsx`
- Modify: `apps/inspector/src/components/RunPipelineMenu.tsx` (size adjustment for inline placement)

- [ ] **Step 1: Build TopBar layout**

Three-section layout: left brand cluster, center date controls, right action cluster.

```tsx
type TopBarProps = {
  apiHost: string
  date: string
  onDateChange: (d: string) => void
  pipelineStatus: { tone: "ok" | "warn" | "error"; label: string }
  lastRefreshedAt: string | null
  busy: boolean
  onRefresh: () => void
  onRunPipeline: (opts: PipelineRunOptions) => void
}
```

Includes day-step `←` / `→` buttons + "Today" shortcut.

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/shell/TopBar.tsx apps/inspector/src/components/RunPipelineMenu.tsx
git commit -m "inspector: TopBar with date controls and status badge"
```

---

### Task 9: IconRail (48px nav)

**Files:**
- Create: `apps/inspector/src/shell/IconRail.tsx`

- [ ] **Step 1: Build icon rail**

```tsx
type IconRailProps = {
  tabs: { id: string; label: string; icon: ReactNode; shortcut: string; badge?: number; dot?: boolean }[]
  active: string
  onSelect: (id: string) => void
  onLogout: () => void
  onSeed: () => void
}
```

- 48px wide, icons only, tooltip on hover that includes the shortcut key.
- Active state: 2px accent-left bar + bg `surface-2`.
- Bottom section: Seed + Logout as secondary icons.

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/shell/IconRail.tsx
git commit -m "inspector: 48px icon rail with tooltip + shortcut hints"
```

---

### Task 10: Inspector screen — new shell + lazy tabs + URL state

**Files:**
- Create: `apps/inspector/src/screens/Inspector.tsx`
- Create: `apps/inspector/src/screens/SignIn.tsx`
- Modify: `apps/inspector/src/App.tsx`
- Modify: `apps/inspector/vite.config.ts`

- [ ] **Step 1: Extract SignIn from App.tsx → `screens/SignIn.tsx`**

Move the existing `SignInScreen` body verbatim. Add `role="alert" aria-live="assertive"` to the error paragraph.

- [ ] **Step 2: Build `screens/Inspector.tsx`**

This is the new shell:
- `useUrlState` for `tab`, `date`, `trendsDays`.
- `useInspectorQueries` for data.
- Lazy imports for all 7 tab modules with `<Suspense fallback={null}>`.
- TopBar on top, IconRail on left, main canvas (no `max-w` cap).

- [ ] **Step 3: Shrink `App.tsx` to ~30 LOC**

Auth gate only — checks token, renders `SignIn` or `Inspector`.

- [ ] **Step 4: Vite manualChunks**

In `vite.config.ts`:

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0" },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { recharts: ["recharts"] },
      },
    },
  },
})
```

- [ ] **Step 5: Verify build**

Run: `cd apps/inspector && pnpm build`
Expected: build succeeds; check `dist/assets/` for separate `recharts-*.js` chunk.

- [ ] **Step 6: Commit**

```bash
git add apps/inspector/src
git commit -m "inspector: new TopBar+IconRail shell, lazy tabs, URL state"
```

---

### Task 11: Command palette

**Files:**
- Create: `apps/inspector/src/shell/CommandPalette.tsx`

- [ ] **Step 1: Build palette**

Modal overlay opened by `⌘K` / `Ctrl+K`. Items:
- Refresh all data
- Run pipeline (one entry per preset)
- Seed demo data
- Jump to tab (×7)
- Jump to date (`yesterday`, `today`, `-7d`, `-30d`, plus a date input)
- Toggle live tail
- Copy permalink
- Sign out

Filter is substring match on label + description. Up/Down to navigate, Enter to fire, Esc to close. Focus returns to whatever was focused before open.

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/shell/CommandPalette.tsx
git commit -m "inspector: ⌘K command palette"
```

---

### Task 12: Keyboard shortcuts hook

**Files:**
- Create: `apps/inspector/src/hooks/useKeyboardShortcuts.ts`
- Modify: `apps/inspector/src/screens/Inspector.tsx`

- [ ] **Step 1: Hook**

```ts
type Bindings = Record<string, () => void>

export function useKeyboardShortcuts(bindings: Bindings) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key !== "Escape") return
      }
      const key = (e.metaKey || e.ctrlKey) ? `mod+${e.key.toLowerCase()}` : e.key.toLowerCase()
      const fn = bindings[key]
      if (fn) { e.preventDefault(); fn() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [bindings])
}
```

- [ ] **Step 2: Wire into Inspector**

```ts
useKeyboardShortcuts({
  "mod+k": openPalette,
  "1": () => setTab("home"), "2": () => setTab("sleep"), /* ...7 */
  "r": refresh,
  "p": openRunMenu,
  "[": () => stepDate(-1), "]": () => stepDate(1),
  "t": () => setDate(today()),
  "d": focusDatePicker,
  "l": toggleLive,
  "/": focusTabSearch,
  "?": openHelpModal,
  "escape": closeOpenMenu,
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/hooks/useKeyboardShortcuts.ts apps/inspector/src/screens/Inspector.tsx
git commit -m "inspector: keyboard shortcuts (1-7, R, P, [/], T, D, L, /, ?, Esc)"
```

---

### Task 13: Help modal (`?` shortcut)

**Files:**
- Create: `apps/inspector/src/shell/HelpModal.tsx`

- [ ] **Step 1: Build help modal**

Two-column list: shortcut on left, action on right. Group by category (Navigation / Actions / Data).

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/shell/HelpModal.tsx
git commit -m "inspector: keyboard shortcut help modal"
```

---

### Task 14: Home tab — hero status row

**Files:**
- Create: `apps/inspector/src/tabs/Home.tsx`
- Modify: `apps/inspector/src/screens/Inspector.tsx` (route `tab=home` to `Home.tsx`)

- [ ] **Step 1: Build status-row logic**

Compute three statuses from query data:

- Pipeline: `state?.isDirty` → `warn` ("inputs changed since last run"); `!state?.lastRunAt` → `error` ("never run"); else `ok` (`last run X ago`).
- Strap: latest raw record timestamp vs now; `<1h` → ok, `<6h` → warn, `>24h` → error.
- Selected night: `sleep?.detection?.start` present → ok with duration; else warn ("no detection for this date").

Each renders as a `StatusBadge` with an inline action button when actionable (Run / Re-detect).

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/tabs/Home.tsx apps/inspector/src/screens/Inspector.tsx
git commit -m "inspector: Home tab hero status row"
```

---

### Task 15: Home — last-night card

**Files:**
- Modify: `apps/inspector/src/tabs/Home.tsx`

- [ ] **Step 1: Half-height Hypnogram embed**

Render `<Hypnogram epochs={...} height={160} />` (pass through existing component; ensure it accepts a `height` prop — add if missing).

- [ ] **Step 2: Four `MetricChip` row**

Duration · HRV (RMSSD) · RHR · Resp rate.
- Today's value pulled from `sleep?.features`.
- `avg14d` pulled from `trends?.metrics` last 14 entries.
- `baseline` pulled from `results?.results.baselineProfile`.

- [ ] **Step 3: One-sentence correlation**

If `results?.results.journalCorrelations` has an entry with `|effect| > 0.3` related to current night's deltas, render a one-sentence headline. Otherwise omit.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/tabs/Home.tsx apps/inspector/src/components/Hypnogram.tsx
git commit -m "inspector: Home last-night card with Hypnogram + chips"
```

---

### Task 16: Home — sync trail + counts disclosure

**Files:**
- Create: `apps/inspector/src/components/SyncTrail.tsx`
- Modify: `apps/inspector/src/tabs/Home.tsx`

- [ ] **Step 1: Build `SyncTrail`**

Horizontal 4-node timeline: Strap → Backend → Pipeline → App view. Each node: name, timestamp (relative), status dot. Connecting lines between.

- [ ] **Step 2: Counts disclosure**

`<details>` block titled "Details" — collapsed by default. Inside: current Overview counts grid using new `Num` with status (`stages === 0` → error, etc.).

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/components/SyncTrail.tsx apps/inspector/src/tabs/Home.tsx
git commit -m "inspector: Home sync trail + counts disclosure"
```

---

### Task 17: Sleep tab — cross-chart scrub controller

**Files:**
- Create: `apps/inspector/src/hooks/useScrubController.ts`
- Modify: `apps/inspector/src/components/Hypnogram.tsx`
- Modify: `apps/inspector/src/components/DayTimeline.tsx`
- Modify: `apps/inspector/src/tabs/Sleep.tsx`

- [ ] **Step 1: Hook**

```ts
export function useScrubController() {
  const [cursorMs, setCursorMs] = useState<number | null>(null)
  return { cursorMs, setCursorMs }
}
```

- [ ] **Step 2: Hypnogram and DayTimeline accept `cursorMs` + `onCursorChange`**

Both render a vertical line at `cursorMs` and call `onCursorChange(t)` on hover.

- [ ] **Step 3: Sleep tab hosts the controller and passes to both charts**

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/hooks/useScrubController.ts apps/inspector/src/components/Hypnogram.tsx apps/inspector/src/components/DayTimeline.tsx apps/inspector/src/tabs/Sleep.tsx
git commit -m "inspector: cross-chart scrub between Hypnogram and DayTimeline"
```

---

### Task 18: Hypnogram tooltip — follow cursor with epoch timestamp

**Files:**
- Modify: `apps/inspector/src/components/Hypnogram.tsx`

- [ ] **Step 1: Show exact timestamp at cursor**

In `onMouseMove`, compute the timestamp at the cursor pixel from the active segment's `start..end` and the relative x. Show in tooltip header (`HH:mm:ss`). Segment metadata stays as secondary context below.

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/components/Hypnogram.tsx
git commit -m "inspector: Hypnogram tooltip follows cursor with epoch timestamp"
```

---

### Task 19: DayTimeline — LTTB downsampling

**Files:**
- Modify: `apps/inspector/src/components/DayTimeline.tsx`

- [ ] **Step 1: Wrap raw points in `useMemo` + LTTB to 500**

```ts
const points = useMemo(() => {
  const all = raw.rows.map(r => ({ x: Date.parse(r.timestamp), y: r.heartRate ?? 0 }))
  return lttb(all, 500)
}, [raw.rows])
```

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/components/DayTimeline.tsx
git commit -m "inspector: LTTB downsample DayTimeline to 500 points"
```

---

### Task 20: Stage × HR scatter chart

**Files:**
- Create: `apps/inspector/src/components/StageHrScatter.tsx`
- Modify: `apps/inspector/src/tabs/Sleep.tsx`

- [ ] **Step 1: Component**

Recharts `<ScatterChart>` with X axis = mean HR (bpm), Y axis = stage ordinal (Awake=3, REM=2, Core=1, Deep=0). Dots colored by stage. Join `epochs[].stage` to `raw.rows[].heartRate` on timestamp (nearest within 30s window).

- [ ] **Step 2: Wire into Sleep tab below Hypnogram**

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/components/StageHrScatter.tsx apps/inspector/src/tabs/Sleep.tsx
git commit -m "inspector: stage × HR scatter to surface classifier disagreement"
```

---

### Task 21: Pipeline tab — hero status + drill-in panel

**Files:**
- Modify: `apps/inspector/src/tabs/Pipeline.tsx`
- Modify: `apps/inspector/src/components/PipelineRunsChart.tsx`

- [ ] **Step 1: Hero status block**

At top of Pipeline tab: full-width `StatusBadge` mirroring Home's pipeline pill, with the dirty inputs preview inline. Run button inline.

- [ ] **Step 2: Click a run bar → drill-in side panel**

`PipelineRunsChart` gains `onRunClick: (id: string) => void`. Pipeline tab opens a side panel with: stage timings horizontal bar, input/output row counts, error message if present, "rerun this date" button.

- [ ] **Step 3: Static legend for stage colors**

Render legend from `STAGE_COLORS` constant unconditionally — not gated on `stageNames.length > 0`.

- [ ] **Step 4: Per-run version pill (graceful)**

If `PipelineRunRow.pipelineVersion` is present (post-backend-shim), render as a small pill below the bar. If absent, omit silently.

- [ ] **Step 5: Commit**

```bash
git add apps/inspector/src/tabs/Pipeline.tsx apps/inspector/src/components/PipelineRunsChart.tsx
git commit -m "inspector: Pipeline hero + drill-in + static legend"
```

---

### Task 22: Raw tab — time filter + virtualization + copy

**Files:**
- Create: `apps/inspector/src/components/VirtualTable.tsx`
- Modify: `apps/inspector/src/tabs/Raw.tsx`

- [ ] **Step 1: Generic `VirtualTable<T>` using @tanstack/react-virtual**

```tsx
type VirtualTableProps<T> = {
  rows: T[]
  rowHeight: number
  renderRow: (row: T, i: number) => ReactNode
  className?: string
}
```

- [ ] **Step 2: Time-range filter above the table**

Input `02:00-03:00` parses into `[startMs, endMs]`. Filters `raw.rows` in a `useMemo` before passing to `VirtualTable`.

- [ ] **Step 3: Row keyboard nav + copy-as-JSON**

Each row has `tabIndex={0}`. `⌘C` / `Ctrl+C` while a row is focused copies its JSON to clipboard. Visible "copy" icon on hover.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/components/VirtualTable.tsx apps/inspector/src/tabs/Raw.tsx
git commit -m "inspector: Raw tab time-filter + virtualize + copy-row"
```

---

### Task 23: Trends — shared domain + tooltip cleanup

**Files:**
- Modify: `apps/inspector/src/components/TrendChart.tsx`
- Modify: `apps/inspector/src/tabs/Trends.tsx`

- [ ] **Step 1: TrendChart accepts `domain?: [number, number]` + `onDomainChange?: (d) => void`**

Both axes opt-in. When domain is shared, brushing one chart updates the controller. Hover crosshair drawn at shared X position on all charts.

- [ ] **Step 2: Tooltip `formatter` drops redundant title**

Replace `[value, title]` with `[value, unit ?? ""]`.

- [ ] **Step 3: Compact mode toggle**

A toggle at the top of Trends drops chart height from 200px to 90px.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/components/TrendChart.tsx apps/inspector/src/tabs/Trends.tsx
git commit -m "inspector: Trends shared domain + crosshair + compact mode"
```

---

### Task 24: Telemetry — global live tail + log search + session grouping

**Files:**
- Create: `apps/inspector/src/hooks/useLiveTail.ts`
- Modify: `apps/inspector/src/tabs/Telemetry.tsx`
- Modify: `apps/inspector/src/screens/Inspector.tsx`

- [ ] **Step 1: Hoist live tail out of Telemetry into a global hook**

```ts
// Hook polls /debug/telemetry on a 5s interval, pauses on document.hidden,
// exponential backoff on consecutive failure (5s → 30s → 60s, reset on success).
export function useLiveTail({ enabled, token }: { enabled: boolean; token: string }) { ... }
```

Indicator pill goes in the TopBar.

- [ ] **Step 2: Log search + level filter on console logs table**

Text input + 4 level toggles (error/warn/info/debug). Filter in a `useMemo`.

- [ ] **Step 3: BLE event session grouping**

Group events by connection session (handshake → first packet → disconnect). Display elapsed-between-events.

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/hooks/useLiveTail.ts apps/inspector/src/tabs/Telemetry.tsx apps/inspector/src/screens/Inspector.tsx
git commit -m "inspector: global live tail + log search + BLE session grouping"
```

---

### Task 25: Insights — sentence-first

**Files:**
- Modify: `apps/inspector/src/tabs/Insights.tsx`

- [ ] **Step 1: Promote top journal correlation to a headline sentence**

If `journalCorrelations` has an entry with `|effect| > 0.3`, render as a one-sentence headline at the top of the tab. Table stays below for power users.

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/tabs/Insights.tsx
git commit -m "inspector: Insights leads with plain-English correlation sentence"
```

---

### Task 26: Microcopy sweep

**Files:**
- Modify: `apps/inspector/src/tabs/Home.tsx`, `Pipeline.tsx`, `Sleep.tsx`, `Telemetry.tsx`, `Trends.tsx`, `Raw.tsx`, `Insights.tsx`
- Modify: `apps/inspector/src/components/primitives.tsx` (if any inline labels)

- [ ] **Step 1: Apply label rewrites**

Per spec §6. Examples:
- "Raw rows" → "Sensor records (all time)"
- "Detections" + `auto`/`manual` sub → "Sleep detections" + "mode: auto"
- "Stages" + "Epochs: N" sub → "Sleep stages" + "N epoch windows"
- "Scores" → "Daily scores"
- "Selection" → "Night selection mode"
- "Plan updated" → "Sleep plan last updated"
- "Sleep empty: Yes/No" → "App sleep view: populated/empty"
- "Last input max" → "Input high-water mark (prev run)"

- [ ] **Step 2: Add tooltips on metric directionality**

Continuity / Coverage / Confidence each get a `title` attribute explaining "higher is better, range 0–1".

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src
git commit -m "inspector: microcopy sweep — clearer labels and metric tooltips"
```

---

### Task 27: Empty / loading / error states

**Files:**
- Modify: `apps/inspector/src/tabs/Home.tsx`, `Sleep.tsx`, `Raw.tsx`, `Trends.tsx`, `Insights.tsx`, `Telemetry.tsx`, `Pipeline.tsx`
- Modify: `apps/inspector/src/screens/Inspector.tsx` (global error banner upgrade)

- [ ] **Step 1: Per-tab empty states**

Per spec §6.1:
- No data for date → message + "Try a different date" link
- Pipeline never run → message + Run button
- BLE silent 24h → message + check BLE link
- Raw empty → message
- Trends 0 nights → message + Run button
- Insights no night → message
- Sign-in error already has `role="alert"` (Task 10)

- [ ] **Step 2: Global error banner**

Inspector renders an error banner per failed query (rather than one stomp). Distinguishes `AuthError` (logout) vs `ServerError(url)` (Retry button) vs `NetworkError` (Retry button).

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src
git commit -m "inspector: empty / loading / error states across tabs"
```

---

### Task 28: A11y polish — focus management + ARIA

**Files:**
- Modify: `apps/inspector/src/components/RunPipelineMenu.tsx`
- Modify: `apps/inspector/src/shell/CommandPalette.tsx`
- Modify: `apps/inspector/src/shell/HelpModal.tsx`
- Modify: `apps/inspector/src/index.css` (focus ring)

- [ ] **Step 1: RunPipelineMenu — Escape closes, focus restores, focus traps**

`useRef` on trigger button. On open, focus first menu item. On Escape: close + restore focus to trigger. Tab cycles within the menu only.

- [ ] **Step 2: Same focus discipline on CommandPalette and HelpModal**

- [ ] **Step 3: Global visible focus ring**

In `index.css`:

```css
*:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 6px;
}
```

- [ ] **Step 4: `aria-busy` on Refresh/Run buttons**

- [ ] **Step 5: Commit**

```bash
git add apps/inspector/src
git commit -m "inspector: focus management + visible focus rings + aria-busy"
```

---

### Task 29: Hypnogram SVG defs memoization + cleanup

**Files:**
- Modify: `apps/inspector/src/components/Hypnogram.tsx`

- [ ] **Step 1: Memoize SVG `<defs>` block**

Wrap the `<defs>` JSX in `useMemo` keyed on `segments` + `containerWidth`. Prevents mask re-evaluation on every cursor pixel.

- [ ] **Step 2: Drop unused imports / dead code (if any)**

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/components/Hypnogram.tsx
git commit -m "inspector: memoize Hypnogram <defs> to free cursor scrub"
```

---

### Task 30: Final cleanup + visual verification

**Files:**
- Delete: any orphaned components after the cutover
- Modify: `apps/inspector/README.md`

- [ ] **Step 1: Find and delete orphans**

```bash
cd /Users/nish/Documents/noop/apps/inspector/src
git grep -l "Overview.tsx" .  # ensure old tab file is no longer imported anywhere
```

If `tabs/Overview.tsx` is referenced only by old code paths, delete it.

- [ ] **Step 2: README update**

Replace the Vite template boilerplate in `apps/inspector/README.md` with a short description of the new architecture + shortcuts list.

- [ ] **Step 3: Visual smoke test**

Run: `cd apps/inspector && pnpm dev`. Open in browser. Verify:
- Top bar renders date + status + actions
- Icon rail renders 7 tabs with tooltips
- ⌘K opens command palette
- 1-7 switches tabs
- `?` opens help modal
- Home shows three status pills + last-night card
- Sleep: hovering Hypnogram highlights HR at same time on DayTimeline
- Raw tab: 5000 rows render without lag; time filter narrows
- Trends: hovering one chart shows crosshair on all
- Telemetry: live indicator in top bar pulses; log search filters

- [ ] **Step 4: Commit + done**

```bash
git add apps/inspector
git commit -m "inspector: README + cleanup, redesign complete"
```

---

## Done

All 30 tasks complete = inspector v2 shipped.
