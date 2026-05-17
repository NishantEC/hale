# Noop Inspector

Power-user debug console for the Noop sleep-tracking pipeline. React 19 + Vite + Tailwind v4 + recharts.

## Architecture

```
src/
├── App.tsx               auth gate (~20 LOC)
├── main.tsx              ReactDOM + QueryClientProvider
├── api.ts                typed endpoints + tokenStorage (sessionStorage)
├── screens/
│   ├── SignIn.tsx        sign-in / sign-up form
│   └── Inspector.tsx     top bar + icon rail + lazy tabs
├── shell/
│   ├── TopBar.tsx        date scrubber, pipeline status, refresh, run, live
│   ├── IconRail.tsx      56px nav with tooltip + accent-left active bar
│   ├── CommandPalette.tsx ⌘K palette (navigate / actions / data / date)
│   ├── HelpModal.tsx     ? — shortcut reference
│   └── tokens.ts         shell layout constants
├── hooks/
│   ├── useInspectorQueries.ts  one useQuery per endpoint + mutations
│   ├── useUrlState.ts          tab / date / trendsDays in ?key=value
│   ├── useKeyboardShortcuts.ts global key dispatch
│   └── useScrubController.ts   shared cursor for cross-chart sync
├── tabs/
│   ├── Home.tsx          first-screen verdict — 3 status pills, last
│   │                     night card, sync trail, counts disclosure
│   ├── Sleep.tsx         hypnogram + day timeline (cross-scrubbing),
│   │                     stage × HR scatter, detection + features
│   ├── Pipeline.tsx      hero status, runs chart with drill-in, results
│   ├── Raw.tsx           time-filterable, virtualized 5000-row table
│   ├── Trends.tsx        10 panels with shared domain + crosshair
│   ├── Insights.tsx      sentence-first journal correlation, baseline Δ
│   └── Telemetry.tsx     battery, BLE sessions, console log search
├── components/           StatusBadge, MetricChip, SyncTrail, Hypnogram,
│                         DayTimeline, TrendChart, PipelineRunsChart,
│                         StageHrScatter, VirtualTable, etc.
└── utils/                lttb, errors, correlations
```

## Keyboard shortcuts

| Key       | Action                       |
| --------- | ---------------------------- |
| `⌘K`      | Command palette              |
| `1`–`7`   | Jump to tab N                |
| `R`       | Refresh data                 |
| `P`       | Open run-pipeline menu       |
| `L`       | Toggle live tail             |
| `[` / `]` | Previous / next day          |
| `T`       | Jump to today                |
| `?`       | Keyboard shortcut help       |
| `Esc`     | Close any modal / menu       |

## URL state

Tab, selected date, and trends range live in `?tab=&date=&trendsDays=`
so any view is a shareable permalink. `localStorage` provides a
fallback when the URL is empty.

## Data layer

Per-endpoint `useQuery` hooks (`useInspectorQueries`) replace the old
`Promise.all` refresh. Tabs enable their queries by passing `enabled`
flags so switching to Telemetry doesn't re-fetch 5000 raw records.
Mutations (`useRunPipeline`, `useSeed`) invalidate all queries on
success.

`AuthError` short-circuits to `onLogout`; `ServerError` and
`NetworkError` surface in a typed error banner with a Retry button.

## Run

```bash
pnpm dev       # Vite dev server on 0.0.0.0
pnpm build     # tsc -b + vite build
```

Set `VITE_API_BASE_URL` to override the default `http://localhost:3009`.

## Design references

Spec: `docs/superpowers/specs/2026-05-15-inspector-redesign-design.md`
Plan: `docs/superpowers/plans/2026-05-15-inspector-redesign.md`
