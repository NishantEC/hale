# Inspector — Phase 5: Deeper shadcn integration + UX polish

**Goal:** Make every page meaningfully more usable by pulling in the shadcn primitives we installed but didn't lean on hard, and adding the four or five primitives we never installed but obviously need.

**Diagnosis** (what's still hand-rolled or weakly themed):

1. **Date picker** is a native `<input type="date">` in TopBar — ugliest visible control, browser-themed not shadcn-themed.
2. **Recharts panels** (DayTimeline, StageHrScatter, TrendChart, PipelineRunsChart) read theme colors via `var(--muted-foreground)` etc. inline, instead of going through `shadcn/ui Chart` which standardises tooltips, axes, and legend chrome.
3. **Loading state** is the text "Loading…". Every tab should ship a Skeleton frame matching its layout.
4. **Empty / error states** mostly use `<Alert>` already (good), but icons and CTAs are inconsistent.
5. **Stats / KPIs** rely on the bespoke `Num` tile. Underused: shadcn `Card` with `CardHeader`/`CardTitle`/`CardDescription`/`CardContent` for richer hierarchy on Home + Sleep + Pipeline.
6. **Per-row tooltips on numeric values** are sparse. Could systematically show "what this metric means" via shadcn `<Tooltip>` or `<HoverCard>` for richer overlays.
7. **Journal correlations** table is a flat shadcn Table. Could be Accordion with per-row drill-in.
8. **Range pickers** in Trends use Select. ToggleGroup would be a segmented control with one tap per range — better than 2-step Select.
9. **Telemetry session cards** use shadcn `Collapsible` directly. shadcn `Accordion` is the natural higher-level fit.
10. **Pipeline run list** is only a Recharts bar chart. A `DataTable` (shadcn's tanstack-table example) with sortable columns + click-to-drill would be more useful for a debugger.

## Decisions locked

- **Calendar date picker** via shadcn `Calendar` + `Popover` (mandatory).
- **shadcn `Chart`** wraps every Recharts panel (gets theme + tooltip primitives for free).
- **Skeleton loading frames** per tab, matching the tab's real layout.
- **Accordion** for Insights journal correlations + Telemetry BLE sessions (replacing inline `Collapsible`).
- **ToggleGroup** for Trends range selector.
- **HoverCard** for inline metric explanations.
- **Form** (shadcn + react-hook-form + zod) for SignIn validation.
- **DataTable** for Pipeline runs table-view alongside the existing bar chart.

## New deps to install

- `shadcn add calendar popover hover-card accordion toggle toggle-group form chart`
- `pnpm add react-hook-form zod @hookform/resolvers` (for Form + validation)
- `pnpm add date-fns` (Calendar dep)

## Tasks

### Task 1: Install the missing primitives + deps
- `pnpm add date-fns react-hook-form zod @hookform/resolvers`
- `pnpm dlx shadcn@latest add calendar popover hover-card accordion toggle toggle-group form chart`

### Task 2: Calendar date picker in TopBar
- Replace the native `<input type="date">` with a `Popover` + `Calendar` combination. Native `←` / `→` / `Today` buttons stay. Date input button label shows the formatted date with a calendar icon.

### Task 3: shadcn Chart wrappers
- Migrate `DayTimeline`, `StageHrScatter`, `TrendChart`, `PipelineRunsChart` to use shadcn's `Chart` container + `ChartTooltipContent` so tooltips and theming are consistent.

### Task 4: Skeleton loading frames per tab
- Each lazy tab module exports an additional `<TabSkeleton />` component. Inspector's Suspense fallback resolves to the matching skeleton (small registry mapping tab → skeleton).

### Task 5: Insights — Accordion for journal correlations + delta tile polish
- Convert the journal correlations table to an Accordion: each row expands to show factor breakdown, sample dates, full delta math.
- Delta tiles gain HoverCard for the metric definition.

### Task 6: Trends — ToggleGroup for ranges + Chart wrappers
- Range selector → ToggleGroup of 7/14/30/60/90.
- All TrendCharts move to shadcn Chart container.

### Task 7: Telemetry — Accordion for BLE sessions + DataTable for events
- Sessions: Collapsible → Accordion.
- Recent events: simple list → shadcn DataTable (sortable columns).

### Task 8: Pipeline — DataTable for runs alongside bar chart
- Add a sortable runs DataTable below the bar chart. Click a row = same drill-in as clicking a bar.

### Task 9: Sleep + Home — HoverCards on metric values
- Continuity/Coverage/Confidence/Regularity Rows + Home MetricChips gain HoverCard with the metric's definition + valid range + interpretation.

### Task 10: SignIn — shadcn Form + zod validation
- Replace the imperative submit handler with `useForm` + zod schema (`email().min().max()`, `password().min(8)`). Inline field errors via `FormMessage`.

### Task 11: Final sweep + smoke test + deploy
- `tsc -b` + `vite build` clean.
- Push to main, watch deploy.

## Strategy

Tasks 1-2 + 4 are inline (shared shell). Tasks 3 + 5-10 are dispatched as parallel subagents per surface — same pattern as Phase 2.
