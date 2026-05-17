# Token Migration Map — Phase 1 → Phase 2

Phase 1 kept the old class names alive as aliases. Phase 2 sweeps them
out one tab at a time. Use this table when rewriting each tab.

## Surfaces

| Old class            | New class                  | Notes                          |
| -------------------- | -------------------------- | ------------------------------ |
| `bg-surface`         | `bg-background`            | page background only           |
| `bg-surface-1`       | `bg-card`                  | chart / table card backgrounds |
| `bg-surface-raised`  | `bg-card`                  | stat cards                     |
| `bg-surface-2`       | `bg-muted`                 | hover states, tooltips         |
| `bg-surface-3`       | `bg-accent`                | focused inputs, K-bar items    |

## Text

| Old class            | New class                  | Notes                          |
| -------------------- | -------------------------- | ------------------------------ |
| `text-text-0`        | `text-foreground`          | primary text                   |
| `text-text-1`        | `text-muted-foreground`    | secondary text                 |
| `text-text-2`        | `text-muted-foreground`    | tertiary (same as -1 in shadcn — lean on size/weight for hierarchy) |

## Borders + focus

| Old class            | New class                  | Notes                          |
| -------------------- | -------------------------- | ------------------------------ |
| `border-border`      | `border`                   | default border                 |
| `border-border-strong` | `border-ring`            | rare — only the strongest divider |

## Brand + accent

| Old class            | New class                  | Notes                          |
| -------------------- | -------------------------- | ------------------------------ |
| `bg-accent`          | `bg-primary`               | primary buttons                |
| `text-accent`        | `text-primary`             | accent / link text             |
| `border-accent`      | `border-primary`           | accent border                  |
| `bg-accent-soft`     | `bg-primary/15`            | accent-tinted background       |
| `accent-accent` (CSS) | `accent-primary`          | form-control accent-color      |

## Semantic status

| Old class            | New class                  | Notes                          |
| -------------------- | -------------------------- | ------------------------------ |
| `text-green`         | `text-success`             | success text                   |
| `bg-green-soft`      | `bg-success/15`            | success surface                |
| `text-red`           | `text-destructive`         | error text                     |
| `bg-red-soft`        | `bg-destructive/10`        | error surface                  |
| `text-yellow`        | `text-warning`             | warn text                      |
| `bg-yellow-soft`     | `bg-warning/15`            | warn surface                   |

## Domain — UNCHANGED

These tokens stay across themes and migrations. Don't sweep:
- `text-stage-awake` / `text-stage-rem` / `text-stage-core` / `text-stage-deep`
- `bg-stage-awake` / etc.
- `text-[var(--color-stage-*)]` constructs in inline SVG fills
- `text-[length:var(--font-size-dense)]`

## Components → shadcn primitives

When rewriting a tab, look for these existing constructs and swap to shadcn:

| Existing inline      | Replace with                          |
| -------------------- | ------------------------------------- |
| `<button className="px-3 py-1.5 rounded-md bg-primary..."> ` | `<Button>` (variant default) |
| `<button className="px-3 py-1.5 rounded-md bg-surface-2..."> ` | `<Button variant="secondary">` |
| Custom modal overlay | `<Dialog>` or `<Sheet>`               |
| Side panel slide-in (PipelineRunDrawer) | `<Sheet>`            |
| Dropdown popover (RunPipelineMenu) | `<DropdownMenu>`           |
| Custom Pill          | `<Badge>`                             |
| `Num` stat tile      | Keep — domain primitive; can sit inside `<Card>` chrome |
| `Row` key/value      | Keep — domain primitive               |
| `StatusBadge` (3-pill hero) | Keep — domain primitive             |
| `MetricChip`         | Keep — domain primitive               |
| `<details><summary>` disclosure | `<Collapsible>`            |
| Sortable presets / drag-reorder | `Sortable` (DiceUI)        |
| Console log search + level toggles | Keep input + `<Toggle>` from shadcn |
| Telemetry event filter | `Combobox` (DiceUI) or shadcn Select |
| Tooltip-on-icon (IconRail) | `<Tooltip>` (shadcn)             |
| Toast / inline confirmation (Raw copy) | `Toaster` + `toast()` (Sonner) |

## Magic UI candidates

Wire these in selectively where they earn their bundle cost:

| Magic UI component   | Where                                 |
| -------------------- | ------------------------------------- |
| `NumberTicker`       | Home counts (raw rows, detections), Telemetry event count, battery SOC |
| `AnimatedBeam`       | Home `SyncTrail` — animate node-to-node connection |
| `Marquee`            | Telemetry live console log tail        |
| `BlurFade`           | Tab transitions (wrap each lazy tab in `<BlurFade>`) |
| `AnimatedList`       | Telemetry events / pipeline runs landing |
| `ShimmerButton`      | Hero "Run pipeline" when dirty         |
| `AnimatedGradientText` | Pipeline status pill label when dirty |
| `AnimatedShinyText`  | "All systems healthy" headline state   |
