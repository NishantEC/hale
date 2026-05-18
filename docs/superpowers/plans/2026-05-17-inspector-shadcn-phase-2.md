# Inspector — Phase 2: Rewrite Tabs on shadcn + Magic UI + DiceUI

**Goal:** Sweep every tab off the Phase 1 token aliases and onto the shadcn / Magic UI / DiceUI primitives installed in Phase 1. Wrap chart and table panels in shadcn `Card` chrome, swap custom modals/dropdowns/dropwers for Radix-based equivalents, wire Magic UI animation in three or four high-impact places.

**Reference:** `apps/inspector/src/components/TOKEN_MAP.md` is the cheat sheet.

**Non-goals:**
- New features. Phase 2 is a chrome rewrite, not a behaviour change.
- Replacing custom domain components (`Hypnogram`, `DayTimeline`, `StageHrScatter`, `TrendChart`, `PipelineRunsChart`, `VirtualTable`, `SyncTrail`, `StatusBadge`, `MetricChip`, `Num`, `Row`). They survive — they wrap in shadcn chrome.
- Logo migration (Phase 3). Auth audit (Phase 4).

## Strategy

7 tabs + shell are largely independent files. Dispatch parallel subagents for **Home, Sleep, Pipeline, Raw, Trends, Telemetry, Insights** — one per tab. Handle the **shell** (`IconRail`, `TopBar`, `RunPipelineMenu`, `HelpModal`, `ErrorBanner` in `Inspector.tsx`) and the shared **`primitives.tsx`** inline since they're touched by every agent.

Each agent gets:
- Its tab file + any tab-local components.
- TOKEN_MAP.md as the migration cheat sheet.
- "Do not commit; report files changed."
- Constraint: don't touch `Inspector.tsx` (shared shell).

After agents return, I:
1. Reconcile and commit each tab in one commit.
2. Rewrite the shell + shared primitives inline.
3. Final build + sweep.

## File Structure (rewrites)

```
src/
├── App.tsx                              [unchanged]
├── screens/
│   ├── Inspector.tsx                    [shell: ErrorBanner → Alert]
│   └── SignIn.tsx                       [Input, Button, Alert]
├── shell/
│   ├── TopBar.tsx                       [Button, Tooltip, Badge for status]
│   ├── IconRail.tsx                     [Tooltip on icons]
│   ├── HelpModal.tsx                    [Dialog]
│   ├── CommandPalette.tsx               [already done in P1]
│   └── tokens.ts                        [unchanged]
├── components/
│   ├── primitives.tsx                   [Num/Row/Pill stay but classes → shadcn]
│   ├── RunPipelineMenu.tsx              [→ DropdownMenu]
│   ├── PipelineRunDrawer.tsx            [→ Sheet]
│   ├── StatusBadge.tsx                  [classes → shadcn]
│   ├── MetricChip.tsx                   [classes → shadcn + NumberTicker]
│   ├── SyncTrail.tsx                    [classes → shadcn + AnimatedBeam]
│   ├── VirtualTable.tsx                 [classes → shadcn, table semantics]
│   ├── DayTimeline.tsx                  [Card chrome]
│   ├── Hypnogram.tsx                    [Card chrome wrapped at call sites]
│   ├── StageHrScatter.tsx               [Card chrome]
│   ├── TrendChart.tsx                   [classes → shadcn]
│   ├── PipelineRunsChart.tsx            [classes → shadcn]
│   └── ThemeToggle.tsx                  [already shadcn-native]
└── tabs/
    ├── Home.tsx                         [agent A]
    ├── Sleep.tsx                        [agent B]
    ├── Pipeline.tsx                     [agent C]
    ├── Raw.tsx                          [agent D]
    ├── Trends.tsx                       [agent E]
    ├── Insights.tsx                     [agent F]
    └── Telemetry.tsx                    [agent G]
```

After Phase 2 the token alias block in `index.css` can be deleted entirely. That's Task 10 below.

## Tasks

### Task 1: Update `primitives.tsx` (Num, Row, Pill, SectionHead)

**Files:** `src/components/primitives.tsx`

- [ ] Switch all class names to shadcn (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `text-destructive`, etc.). Keep API unchanged so call sites compile.
- [ ] `Pill` keeps its `tone` prop but the implementation now wraps shadcn `Badge` with a tonal variant, or stays as a small inline span using `bg-success/15 text-success` etc.
- [ ] `Num` status variants use `text-success` / `text-destructive` / `text-warning` / `text-muted-foreground`.
- [ ] Commit: "inspector(p2): primitives — shadcn tokens"

### Task 2: Update `StatusBadge.tsx`, `MetricChip.tsx`, `SyncTrail.tsx`

**Files:** the three components.

- [ ] StatusBadge: tones → shadcn semantic; uses `bg-success/15`, `bg-warning/15`, `bg-destructive/10`, `bg-muted`.
- [ ] MetricChip: chrome to `bg-card`; today's value optionally wrapped in `<NumberTicker value={...} />` (Magic UI) for live feel.
- [ ] SyncTrail: 4 nodes; between each, render an `<AnimatedBeam>` (Magic UI) connecting consecutive node refs.
- [ ] Commit: "inspector(p2): StatusBadge + MetricChip + SyncTrail to shadcn + Magic UI"

### Task 3: Update `RunPipelineMenu.tsx` → shadcn `DropdownMenu`

**Files:** `src/components/RunPipelineMenu.tsx`

- [ ] Replace the hand-rolled popover with `DropdownMenu` + `DropdownMenuTrigger` + `DropdownMenuContent` + `DropdownMenuItem` + `DropdownMenuCheckboxItem` (for the force toggle) + `DropdownMenuSeparator`.
- [ ] Trigger button uses shadcn `Button` (variant default for primary, secondary for elsewhere).
- [ ] Same external API.
- [ ] Commit: "inspector(p2): RunPipelineMenu → shadcn DropdownMenu"

### Task 4: Update `PipelineRunDrawer.tsx` → shadcn `Sheet`

**Files:** `src/components/PipelineRunDrawer.tsx`

- [ ] Replace the right-aligned fixed overlay with `Sheet` + `SheetContent side="right"` + `SheetHeader` + `SheetTitle` + `SheetDescription`.
- [ ] Re-run button uses `Button`.
- [ ] Internal Rows use the updated `Row` from primitives.tsx.
- [ ] Commit: "inspector(p2): PipelineRunDrawer → shadcn Sheet"

### Task 5: Dispatch 7 parallel subagents for tab rewrites

One subagent per tab. Each gets full task prompt with:
- Path to its tab file.
- TOKEN_MAP.md content inlined.
- shadcn primitives available.
- Magic UI candidates list.
- "Don't commit. Don't touch Inspector.tsx. Report changed files."

After all 7 return, I commit each tab in its own commit (so commits stay reviewable):
- "inspector(p2): Home tab — shadcn chrome + NumberTicker + AnimatedBeam"
- "inspector(p2): Sleep tab — Card chrome + Table for detection rows"
- "inspector(p2): Pipeline tab — Card chrome + Sheet drill-in"
- "inspector(p2): Raw tab — shadcn Input + Sonner toast + Alert empty"
- "inspector(p2): Trends tab — Card chrome + Select range + Switch compact"
- "inspector(p2): Insights tab — Card chrome + AnimatedShinyText headline"
- "inspector(p2): Telemetry tab — Card chrome + ToggleGroup + Marquee live tail"

### Task 6: Shell — `IconRail`, `TopBar`, `HelpModal`

**Files:** `src/shell/{IconRail,TopBar,HelpModal}.tsx`

- [ ] IconRail: wrap each icon button in `Tooltip` + `TooltipTrigger` + `TooltipContent` for hover label.
- [ ] TopBar: replace inline pills with shadcn `Badge`. Pipeline status badge optionally uses `<AnimatedGradientText>` when dirty. Refresh + Run buttons become shadcn `Button`. Date controls keep native `<input type="date">` but wrap with the new `Input` styles.
- [ ] HelpModal → shadcn `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle`.
- [ ] Wrap whole app in `TooltipProvider` (in main.tsx).
- [ ] Commit: "inspector(p2): shell — IconRail Tooltip + TopBar Badge + HelpModal Dialog"

### Task 7: `Inspector.tsx` cleanup — ErrorBanner → shadcn Alert + Sonner toast for run mutations

**Files:** `src/screens/Inspector.tsx`, `src/main.tsx`

- [ ] Replace the bespoke `ErrorBanner` with shadcn `<Alert variant="destructive">` + `AlertTitle` + `AlertDescription` + a `Button` for Retry.
- [ ] Add `<Toaster />` (Sonner) once at the bottom of Inspector for run/seed mutation success/failure toasts.
- [ ] `useRunPipeline` and `useSeed` mutations fire `toast.success(...)` / `toast.error(...)` so the user sees confirmation when triggered from the palette.
- [ ] Commit: "inspector(p2): Inspector shell — Alert + Sonner toaster"

### Task 8: SignIn screen

**Files:** `src/screens/SignIn.tsx`

- [ ] Replace `<input>`s with shadcn `Input`.
- [ ] Submit button → shadcn `Button`.
- [ ] Error → shadcn `Alert variant="destructive"`.
- [ ] Wrap form in a centered shadcn `Card` for visual containment.
- [ ] Commit: "inspector(p2): SignIn screen → shadcn Card + Input + Button + Alert"

### Task 9: Domain chart components — Card chrome at call sites

**Files:** wherever `Hypnogram`, `DayTimeline`, `StageHrScatter`, `TrendChart`, `PipelineRunsChart` are rendered.

- [ ] Most tabs already wrap charts in `bg-surface-1 border rounded-2xl`. Sweep those to `<Card>` (shadcn) with `<CardHeader>` + `<CardContent>`. Header carries the title + helper text (right side) that already lives there.
- [ ] Drop the inline `bg-surface-1 border border-border rounded-2xl` div wrappers.
- [ ] Commit: "inspector(p2): chart panels wrapped in shadcn Card"

### Task 10: Sweep — delete legacy aliases + final smoke test

**Files:** `src/index.css`, any stragglers

- [ ] `grep -rn "bg-surface\|text-text-\|border-border\|bg-green-soft\|bg-red-soft\|bg-yellow-soft\|bg-accent-soft\|--color-text-\|--color-surface" src/` returns zero hits.
- [ ] Delete the `/* aliases — existing screens keep compiling until Phase 2 sweep */` block from `index.css`.
- [ ] Final `pnpm exec tsc -b && pnpm exec vite build`.
- [ ] Smoke test: dev server, click through every tab, verify ⌘K, keyboard shortcuts, theme toggle still all work.
- [ ] Commit: "inspector(p2): drop legacy token aliases — Phase 2 sweep complete"

## Done

10 tasks, ~12 commits, all classes migrated to shadcn semantics. Token alias block deleted. Light + dark + system theme working uniformly. ⌘K, keyboard shortcuts, cross-chart scrub, Run drawer, etc. all intact.
