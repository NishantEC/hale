# Inspector — Pulse (Delta + Trace) rebuild — design

**Date:** 2026-05-19
**Status:** Approved (Delta + Trace chassis selected from `delta-trace-combined.html`)
**Scope:** `apps/inspector` only. Mobile app palette migration is a separate follow-up spec.

## Problem

The current "Field Manual" aesthetic (Fraunces serif, cream paper, vermillion accent, numbered chapter heads, ruled sections with no card chrome) reads as editorial — magazine, not dashboard. The user wants vibrant, multi-accent dashboard energy reminiscent of Pulse (Apple-Fitness-school), but without the rings as the central visual device. The selected direction is **Delta + Trace**: glass cards with subtly tinted bottom hairlines and inline delta chips.

## Goals

- Replace Field Manual chassis with a pitch-black dashboard chassis that uses per-metric color for identity.
- Each metric card carries three independent signals: the number's color (identity), a delta chip (direction of change), and a bottom hairline (subliminal identity reinforcement).
- Keep every functional behavior intact: 1200px clamp, sticky masthead, tab strip, charts, drag-reorder, command palette, keyboard shortcuts.
- Drop all editorial conceits: no chapter numbering, no Fraunces serif, no italics-as-emphasis, no pull-quotes.

## Non-goals

- No mobile-app changes. Mobile rebuild gets its own spec referencing this palette.
- No new screens, no new tabs, no information-architecture changes.
- No animation system (deferred — current `tw-animate-css` stays).

## Design

### Foundation

**Background.** Pure black `#000` (light mode dropped; the inspector is dark-only going forward — light mode was rarely used and complicates the glass-blur aesthetic).

**Surface (glass cards).**
- Background: `rgba(28, 28, 30, 0.7)`
- `backdrop-filter: blur(16px)` — Tailwind `backdrop-blur-lg`. Capped at 16px (not 20px) to keep Trends's 10-chart grid smooth on mid-tier laptops.
- Border: `1px solid rgba(255, 255, 255, 0.06)`
- Radius: arbitrary `14px` (use `rounded-[14px]` — Tailwind's `rounded-xl` is 12px, which reads slightly too sharp at this scale).
- Padding: 14px (`p-3.5` in Tailwind). The trace hairline sits 8px from the bottom inside this padding.
- No shadow.

**Trace hairline (optional, per card).**
- Position: absolute, bottom 8px, inset 14px left/right
- Height: 1.5px
- Color: the metric's accent at `opacity: 0.75`
- Implemented as a `::after` on the card, applied when the card receives a `--card-accent` CSS variable.

**Type.**
- Sans: **Inter** (variable). Drop Fraunces, drop IBM Plex Sans.
- Mono: **JetBrains Mono** (variable). Drop IBM Plex Mono.
- Loaded via Google Fonts `@import url(...)` at the very top of `index.css` before `@import "tailwindcss"` (CSS spec — Tailwind v4 expands its import inline).
- Hero numbers: `font-weight: 700`, `letter-spacing: -0.025em`, `font-variant-numeric: tabular-nums`. Sizes: 30px (mobile-style stat), 26px (inspector primary), 22px (inspector compact).
- Body: Inter 400, 15px / 1.55. Labels: Inter 600, 10–11px, uppercase, `letter-spacing: 0.08em`.

**Accent palette.**
- Cyan `#00DCFF` — duration / sleep
- Magenta `#FF2D6E` — HRV
- Lime `#BBFF38` — recovery / RHR
- Amber `#FFA42B` — resp / strain / warn
- Each exposed as CSS variable: `--accent-cyan`, `--accent-magenta`, `--accent-lime`, `--accent-amber`.
- Plus `--accent-active: var(--accent-cyan)` for "current tab / primary CTA" and `--accent-warn: var(--accent-amber)`, `--accent-down: var(--accent-magenta)`.

**Delta chips.**
- Three states, each a small pill with mono numerals:
  - **Up**: `bg: rgba(187, 255, 56, 0.1)`, `text: #BBFF38`. Glyph: `↑` or `▲`.
  - **Down**: `bg: rgba(255, 45, 110, 0.1)`, `text: #FF2D6E`. Glyph: `↓` or `▼`.
  - **Same**: `bg: rgba(255, 255, 255, 0.04)`, `text: #888`. Glyph: `—`.
- Padding: `3px 8px`, border-radius `12px`, font-size `11px` (or `10px` in dense contexts), font: JetBrains Mono, `font-weight: 600`.

**Rules + borders.**
- `rule-strong` (current thick-top-rule from Field Manual) is **removed**. Sections separate via card grouping + whitespace, not rules.
- `rule-hair` and `rule-hair-b` stay (for masthead bottom border + tab strip divider).
- Section separators inside cards (FieldLine rows) use `rgba(255,255,255,0.05)` hairlines.

### Card primitive (`components/ui/card.tsx`)

Replace the current chrome-less ruled-section Card with a glass card:

```tsx
function Card({ className, accent, ...props }: React.ComponentProps<"div"> & { accent?: AccentKey }) {
  const accentVar = accent ? `var(--accent-${accent})` : undefined
  return (
    <div
      data-slot="card"
      data-accent={accent}
      style={accentVar ? { ['--card-accent' as any]: accentVar } : undefined}
      className={cn(
        "relative rounded-[14px] bg-card/70 backdrop-blur-xl border border-white/[0.06] p-3.5",
        accent && "[&::after]:content-[''] [&::after]:absolute [&::after]:left-3.5 [&::after]:right-3.5 [&::after]:bottom-2 [&::after]:h-[1.5px] [&::after]:rounded-[1px] [&::after]:bg-[var(--card-accent)] [&::after]:opacity-75",
        className,
      )}
      {...props}
    />
  )
}
```

Sub-components (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) drop their padding-x (card's own padding handles it), and `CardTitle` drops the Fraunces font-display in favor of Inter `font-semibold text-sm`. The legacy ruled-section behavior is gone — the Card is back to being a real card.

`AccentKey = 'cyan' | 'magenta' | 'lime' | 'amber' | 'warn' | 'down'`.

### Stat / Number primitive (`components/primitives.tsx`)

Rewrite `Num` (and its alias `Stat`) to render the new chassis:

```tsx
export function Stat({
  label, value, unit, accent, delta, status,
}: {
  label: string
  value: string | number
  unit?: string
  accent?: AccentKey
  delta?: { kind: 'up'|'down'|'same'; text: string } | null
  status?: Status   // legacy compatibility
}) {
  const color = accent ? `text-[var(--accent-${accent})]` : 'text-foreground'
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-[26px] font-bold leading-none tabular-nums tracking-tight", color)}>
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-muted-foreground">{unit}</span>}
      </div>
      {delta && <DeltaChip kind={delta.kind}>{delta.text}</DeltaChip>}
    </div>
  )
}
```

`SectionHead` drops `n`, `kicker`, and the thick top rule. New signature:

```tsx
export function SectionHead({ children, meta, className }: {
  children: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex items-baseline justify-between mb-3", className)}>
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {meta && <span className="text-xs text-muted-foreground font-mono">{meta}</span>}
    </header>
  )
}
```

`FieldLine` (alias `Row`) keeps its hairline-separated key/value layout but the hairline color shifts to `rgba(255,255,255,0.05)`.

`Eyebrow`, `Marginalia`, `Pill` retain their API. `Pill` is updated to map `green/yellow/red/neutral` → lime/amber/magenta/neutral chip styles.

### `DeltaChip` component

New, lives in `components/primitives.tsx`:

```tsx
export function DeltaChip({ kind, children }: {
  kind: 'up' | 'down' | 'same'
  children: ReactNode
}) {
  const cls = {
    up:   'bg-[rgba(187,255,56,0.1)]   text-[var(--accent-lime)]',
    down: 'bg-[rgba(255,45,110,0.1)]   text-[var(--accent-magenta)]',
    same: 'bg-white/[0.04]             text-muted-foreground',
  }[kind]
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold tabular-nums", cls)}>
      {children}
    </span>
  )
}
```

### Per-tab cleanup

For each tab, drop the chapter-numbered `SectionHead n={...}` prop and the `kicker` prop. Use plain text titles. The Hypnogram colors retone to the new palette (awake → magenta, REM → cyan, core → muted blue, deep → indigo).

- `Home.tsx` — three glass status cards (Pipeline/Strap/Night) with delta chips; numbered chapter heads → plain; metric grid uses new Stat with accent + delta.
- `Sleep.tsx` — same; remove "00" cover head, use plain SectionHead with meta.
- `Insights.tsx` — DeltaTile becomes a glass Card with accent + delta chip; correlation pull-quote becomes a simple Card with accent.
- `Trends.tsx` — three summary stats become glass cards with accent + delta; chart palette retoned (cyan/magenta/lime/amber + ink-blue + sage + taupe).
- `Telemetry.tsx`, `Raw.tsx`, `Pipeline.tsx` — chapter numbers dropped from SectionHead calls; cards inherit glass.

### What stays

- 1200px width clamp + `items-center` outer flex.
- Masthead + tab strip layout. Tab underline color: `var(--accent-cyan)` (currently vermillion).
- Sticky masthead behavior. The theme toggle button is **removed** from the masthead in this rebuild — dark is the only mode. The component file stays for now but is unimported.
- All charts (Hypnogram, DayTimeline, StageHrScatter, TrendChart, PipelineRunsChart) — only colors change.
- Drag-reorder on Trends, command palette, keyboard shortcuts, URL state, query cache — untouched.

### What goes

- Fraunces font + `font-display`, `font-display-tight` utilities and `--font-display` token.
- IBM Plex Sans, IBM Plex Mono fonts.
- `--paper`, `--ink`, `--vermillion`, `--sage` tokens.
- `rule-strong` class.
- Body `::before` paper-grain noise overlay.
- Chapter-number formatting in `SectionHead` (`n` prop removed).
- Cream/dark-mode-paper dual palette — single dark palette only.

## Architecture / files touched

- `apps/inspector/src/index.css` — full rewrite of fonts, tokens, body styles.
- `apps/inspector/src/components/primitives.tsx` — `SectionHead`, `Stat`/`Num`, `FieldLine`/`Row`, `Pill`, new `DeltaChip` + `AccentKey` type.
- `apps/inspector/src/components/ui/card.tsx` — glass card with optional accent trace.
- `apps/inspector/src/components/ui/badge.tsx` — chip-style mono badges; map variants to up/down/same/accent.
- `apps/inspector/src/components/ui/button.tsx` — restore `rounded-md`, primary uses `bg-foreground` (inverts white in dark), accent uses cyan.
- `apps/inspector/src/components/ui/input.tsx` — restore subtle bg + border + radius.
- `apps/inspector/src/components/StatusBadge.tsx` — glass card chassis with `accent` + `delta` props.
- `apps/inspector/src/components/MetricChip.tsx` — Delta+Trace chassis with `accent` + delta vs baseline.
- `apps/inspector/src/components/SyncTrail.tsx` — palette retone, glass nodes.
- `apps/inspector/src/components/Hypnogram.tsx` — stage colors: awake `#FF2D6E`, REM `#00DCFF`, core `#5C8AC7`, deep `#6B6CC5`.
- `apps/inspector/src/shell/Masthead.tsx` — drop serif date, drop chapter-meta styling, use Inter throughout. Tab underline color → cyan.
- `apps/inspector/src/tabs/Home.tsx`, `Sleep.tsx`, `Insights.tsx`, `Trends.tsx`, `Telemetry.tsx`, `Raw.tsx`, `Pipeline.tsx` — strip `n` and `kicker` props from `SectionHead` calls; assign per-metric `accent` props to Stat/MetricChip; charts use new palette constants.
- `apps/inspector/src/screens/SignIn.tsx` — drop editorial cover; single column form on glass card; remove "vol. iv · field manual" and "printed on paper, not pixels" tag.
- `apps/inspector/src/shell/HelpModal.tsx` — drop "reference · keyboard" eyebrow + Fraunces title; plain Inter title on glass dialog.

No structural file moves. No new components except `DeltaChip` (lives in `primitives.tsx`).

## Risks

- **Backdrop-blur performance.** With many glass cards on screen (Trends has 10), `backdrop-blur(20px)` could stutter on lower-end devices. Mitigation: cap the blur radius to `12px`, and use `will-change: backdrop-filter` only on hovered cards. If still slow, drop blur on charts (keep on stat cards only).
- **Delta computation.** The current code surface mostly already computes deltas (Insights `buildDeltas`, Trends week-over-week). For tabs that don't, we render no delta chip — the card still works without it. Don't introduce fake deltas.
- **Accent color overuse.** With four accents per row of cards, the inspector can look candy-colored. Discipline: status row uses **status-direction** colors (lime/amber/magenta), not identity colors. Metric rows use **identity** colors. Mixing within a row is forbidden.
- **Light mode removed.** If someone has the `.dark` class toggled off in storage, they'd see no styles. Fix: forcibly remove the `.dark` toggle and treat dark as the only mode. The theme toggle button becomes a no-op (or get removed in a follow-up).

## Testing

- Build: `pnpm run build` from `apps/inspector` must pass cleanly (CI enforces `noUnusedLocals`).
- Visual: deploy to `noop.enform.co`. Sign in. Tour every tab:
  - Home: glass status row, metric grid with delta chips, hypnogram retoned, sync trail glass.
  - Sleep: vitals row uses glass + accents, day timeline + hypnogram + stage×HR in new palette.
  - Insights: delta tiles use new chassis; correlation card is a glass card with cyan accent.
  - Trends: summary row + 10-chart small-multiples grid in new palette; drag-reorder still works.
  - Raw: virtual table still aligned; row hover state visible.
  - Pipeline: state block, runs chart, history table all glass.
  - Telemetry: hero counters + log search + battery section all glass.
- Functional: keyboard shortcuts (`1–7`, `R`, `L`, `[`, `]`, `T`, `mod+k`, `?`) work; command palette opens; sign-in still works; theme toggle no longer appears in the masthead.
- Performance: Lighthouse "Reduced motion" enabled — verify no flicker; check FPS on Trends tab scrolling on a mid-tier laptop.

## Rollout

Single PR / single batch of commits to `main` (the existing pattern). Foundation first commit, primitives second, tabs third, deploy.

## Open questions (resolved during brainstorm)

- Q: Drop light mode? A: Yes. Dark-only.
- Q: Mobile app in same spec? A: No — separate follow-up spec referencing this palette.
- Q: Which mono font? A: JetBrains Mono.
- Q: Keep Hypnogram component? A: Yes, only colors change.
