# Inspector — Pulse (Delta+Trace) Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editorial Field Manual aesthetic with a pitch-black, glass-card, per-metric-accent dashboard chassis (Delta + Trace).

**Architecture:** Five layered tasks, each independently shippable: (1) foundation tokens + fonts in `index.css`, (2) primitives + Card + form chrome, (3) re-toned reusable components, (4) Masthead, (5) tab cleanups. CI runs `pnpm run build` which uses `tsc -b` with `noUnusedLocals` — use that for verification, not bare `tsc --noEmit`.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind v4 (`@theme inline`, arbitrary values via `[]`), Google Fonts (Inter + JetBrains Mono), shadcn/ui primitives. Cloud Run deploy via GitHub Actions on push to `main`.

**Spec:** `docs/superpowers/specs/2026-05-19-inspector-pulse-rebuild-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `apps/inspector/src/index.css` | Tokens, fonts, base styles. Single source of truth for palette. |
| `apps/inspector/src/components/primitives.tsx` | `SectionHead`, `Stat`/`Num`, `FieldLine`/`Row`, `Pill`, `Eyebrow`, `Marginalia`, **new** `DeltaChip`, **new** `AccentKey` type |
| `apps/inspector/src/components/ui/card.tsx` | Glass card with optional accent trace hairline |
| `apps/inspector/src/components/ui/badge.tsx` | Restore rounded-full pill (matching DeltaChip styling), variants map to accent palette |
| `apps/inspector/src/components/ui/button.tsx` | `rounded-md` back; primary is `bg-foreground` (inverts white in dark); destructive is magenta |
| `apps/inspector/src/components/ui/input.tsx` | Restore subtle bg + border + radius (drop the underline-only Field Manual treatment) |
| `apps/inspector/src/components/StatusBadge.tsx` | Glass card chassis with `accent` + `delta` props |
| `apps/inspector/src/components/MetricChip.tsx` | Glass card with hero number in accent color + bottom trace + optional delta chip |
| `apps/inspector/src/components/SyncTrail.tsx` | Re-toned to glass; ring dots use accent palette |
| `apps/inspector/src/components/Hypnogram.tsx` | Stage colors retoned to magenta/cyan/blue-grey/indigo |
| `apps/inspector/src/screens/SignIn.tsx` | Drop editorial cover; single-column form on glass card |
| `apps/inspector/src/shell/HelpModal.tsx` | Drop "reference · keyboard" eyebrow + serif title; plain Inter on glass |
| `apps/inspector/src/shell/Masthead.tsx` | Drop ThemeToggle import + render; retone; tab underline → cyan |
| `apps/inspector/src/tabs/Home.tsx` | Strip `n`/`kicker` from SectionHead calls; assign accents to MetricChip; status badges get tones |
| `apps/inspector/src/tabs/Sleep.tsx` | Strip `n`/`kicker`; assign accents to vitals row |
| `apps/inspector/src/tabs/Insights.tsx` | Strip `n`/`kicker`; DeltaTile + DirectionCard adopt Card chassis |
| `apps/inspector/src/tabs/Trends.tsx` | Strip `n`/`kicker`; retone CHART_COLORS; SummaryStat adopts new chassis |
| `apps/inspector/src/tabs/Telemetry.tsx` | Strip `n`/`kicker` |
| `apps/inspector/src/tabs/Raw.tsx` | Strip `n`/`kicker` |
| `apps/inspector/src/tabs/Pipeline.tsx` | Strip `n`/`kicker` |

No file moves or deletions. No new files except via the new `DeltaChip` export inside `primitives.tsx`.

---

## Task 1: Foundation — `index.css`

**Files:**
- Modify: `apps/inspector/src/index.css` (full rewrite)

This task replaces every CSS token and base style. After this lands, the build will *render* in the new palette and fonts but components that still hard-code Field Manual hex values or class names will look wrong. Subsequent tasks fix those.

- [ ] **Step 1: Replace `index.css` end-to-end**

```css
/* Inter + JetBrains Mono. Must precede @import "tailwindcss" — Tailwind v4
   expands its import inline, which pushes any later @import past other rules
   and triggers a PostCSS error. */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap");

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-success: var(--success);
  --color-warning: var(--warning);

  /* per-metric accents */
  --color-accent-cyan: var(--accent-cyan);
  --color-accent-magenta: var(--accent-magenta);
  --color-accent-lime: var(--accent-lime);
  --color-accent-amber: var(--accent-amber);

  --color-stage-awake: var(--stage-awake);
  --color-stage-rem: var(--stage-rem);
  --color-stage-core: var(--stage-core);
  --color-stage-deep: var(--stage-deep);

  --color-border: var(--border);
  --color-hairline: var(--hairline);

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;

  /* type scale */
  --text-display: 2.25rem;   /* 36px */
  --text-h1: 1.5rem;         /* 24px */
  --text-h2: 1.125rem;       /* 18px */
  --text-h3: 1rem;           /* 16px */
  --text-body: 0.9375rem;    /* 15px */
  --text-sm: 0.8125rem;      /* 13px */
  --text-xs: 0.75rem;        /* 12px */
  --text-eyebrow: 0.6875rem; /* 11px */

  --animate-marquee: marquee var(--duration) infinite linear;
  --animate-marquee-vertical: marquee-vertical var(--duration) linear infinite;
  @keyframes marquee {
    from { transform: translateX(0); }
    to { transform: translateX(calc(-100% - var(--gap))); }
  }
  @keyframes marquee-vertical {
    from { transform: translateY(0); }
    to { transform: translateY(calc(-100% - var(--gap))); }
  }
  --animate-shimmer-slide: shimmer-slide var(--speed) ease-in-out infinite alternate;
  --animate-spin-around: spin-around calc(var(--speed) * 2) infinite linear;
  @keyframes shimmer-slide { to { transform: translate(calc(100cqw - 100%), 0); } }
  @keyframes spin-around {
    0% { transform: translateZ(0) rotate(0); }
    15%, 35% { transform: translateZ(0) rotate(90deg); }
    65%, 85% { transform: translateZ(0) rotate(270deg); }
    100% { transform: translateZ(0) rotate(360deg); }
  }
  --animate-gradient: gradient 8s linear infinite;
  @keyframes gradient { to { background-position: var(--bg-size, 300%) 0; } }
  --animate-shiny-text: shiny-text 8s infinite;
  @keyframes shiny-text {
    0%, 90%, 100% { background-position: calc(-100% - var(--shiny-width)) 0; }
    30%, 60% { background-position: calc(100% + var(--shiny-width)) 0; }
  }
}

:root, .dark {
  /* Pulse — dark only. The .dark selector is kept so legacy `:is(.dark *)`
     descendants of dark theme still resolve, but root is dark too. */
  --background: #000000;
  --foreground: #FFFFFF;

  --card: rgba(28, 28, 30, 0.7);
  --card-foreground: #FFFFFF;
  --popover: rgba(20, 20, 22, 0.95);
  --popover-foreground: #FFFFFF;

  --primary: #FFFFFF;
  --primary-foreground: #000000;
  --secondary: rgba(255, 255, 255, 0.06);
  --secondary-foreground: #FFFFFF;
  --muted: rgba(255, 255, 255, 0.04);
  --muted-foreground: #8E8E93;
  --accent: rgba(255, 255, 255, 0.06);
  --accent-foreground: #FFFFFF;

  --destructive: #FF2D6E;
  --destructive-foreground: #FFFFFF;
  --success: #BBFF38;
  --warning: #FFA42B;

  /* per-metric accents */
  --accent-cyan: #00DCFF;
  --accent-magenta: #FF2D6E;
  --accent-lime: #BBFF38;
  --accent-amber: #FFA42B;

  --border: rgba(255, 255, 255, 0.08);
  --hairline: rgba(255, 255, 255, 0.05);
  --input: rgba(255, 255, 255, 0.12);
  --ring: #00DCFF;

  /* Hypnogram stage colors */
  --stage-awake: #FF2D6E;
  --stage-rem: #00DCFF;
  --stage-core: #5C8AC7;
  --stage-deep: #6B6CC5;
}

* { box-sizing: border-box; margin: 0; }
:root { color-scheme: dark; }

html, body, #root {
  height: 100%;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  color: var(--foreground);
  background: var(--background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.font-mono,
code,
kbd,
samp,
pre {
  font-family: var(--font-mono);
  font-feature-settings: "calt" 0, "liga" 0, "zero" 1;
}

/* Small-caps eyebrow */
.eyebrow {
  font-family: var(--font-sans);
  font-size: var(--text-eyebrow);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--muted-foreground);
}

/* Hairline divider — used for masthead bottom + sticky tab strip */
.rule-hair { border-top: 1px solid var(--hairline); }
.rule-hair-b { border-bottom: 1px solid var(--hairline); }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

:focus-visible {
  outline: 1.5px solid var(--ring);
  outline-offset: 2px;
  border-radius: 4px;
}

button:focus:not(:focus-visible),
input:focus:not(:focus-visible),
[tabindex]:focus:not(:focus-visible) { outline: none; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

::selection {
  background: var(--accent-cyan);
  color: #000;
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

Expected: succeeds. Any utility class that depended on Field-Manual-only tokens (`bg-paper`, `rule-strong`, `font-display*`) will not error at compile time — Tailwind v4 only generates utilities for classes it finds, and removed-utility consumers just render with no styles. We fix consumer files in later tasks.

- [ ] **Step 3: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/index.css && git commit -m "inspector(pulse): foundation — Inter + JBM, pitch-black + 4 accents, dark-only"
```

---

## Task 2: Primitives, Card, form chrome

**Files:**
- Modify: `apps/inspector/src/components/primitives.tsx` (full rewrite)
- Modify: `apps/inspector/src/components/ui/card.tsx`
- Modify: `apps/inspector/src/components/ui/badge.tsx`
- Modify: `apps/inspector/src/components/ui/button.tsx`
- Modify: `apps/inspector/src/components/ui/input.tsx`

- [ ] **Step 1: Rewrite `primitives.tsx`**

```tsx
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type AccentKey = "cyan" | "magenta" | "lime" | "amber"
export type Status = "ok" | "warn" | "error" | "stale"

const ACCENT_TEXT: Record<AccentKey, string> = {
  cyan: "text-[var(--accent-cyan)]",
  magenta: "text-[var(--accent-magenta)]",
  lime: "text-[var(--accent-lime)]",
  amber: "text-[var(--accent-amber)]",
}

const STATUS_DOT: Record<Status, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  stale: "bg-muted-foreground",
}

const STATUS_TEXT: Record<Status, string> = {
  ok: "text-[var(--accent-lime)]",
  warn: "text-[var(--accent-amber)]",
  error: "text-[var(--accent-magenta)]",
  stale: "text-muted-foreground",
}

export function SectionHead({
  children,
  meta,
  className,
}: {
  children: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex items-baseline justify-between gap-4 mb-3", className)}>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {children}
      </h2>
      {meta && (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {meta}
        </span>
      )}
    </header>
  )
}

export function Eyebrow({
  children,
  status,
  className,
}: {
  children: ReactNode
  status?: Status
  className?: string
}) {
  return (
    <p className={cn("eyebrow flex items-center gap-1.5", className)}>
      {status && <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />}
      {children}
    </p>
  )
}

export type Delta = { kind: "up" | "down" | "same"; text: ReactNode }

export function DeltaChip({ kind, children }: { kind: Delta["kind"]; children: ReactNode }) {
  const cls = {
    up: "bg-[rgba(187,255,56,0.12)] text-[var(--accent-lime)]",
    down: "bg-[rgba(255,45,110,0.12)] text-[var(--accent-magenta)]",
    same: "bg-white/[0.04] text-muted-foreground",
  }[kind]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold tabular-nums",
        cls,
      )}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  sub,
  unit,
  accent,
  delta,
  status,
  size = "md",
  className,
}: {
  label: string
  value: string | number
  sub?: ReactNode
  unit?: string
  accent?: AccentKey
  delta?: Delta | null
  status?: Status
  size?: "lg" | "md" | "sm"
  className?: string
}) {
  const valueColor = accent ? ACCENT_TEXT[accent] : "text-foreground"
  const valueClass =
    size === "lg"
      ? "text-[2rem] leading-none"
      : size === "md"
      ? "text-[1.625rem] leading-none"
      : "text-[1.25rem] leading-none"
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Eyebrow status={status}>{label}</Eyebrow>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(valueClass, valueColor, "font-bold tabular-nums tracking-tight")}>
          {value}
        </span>
        {unit && (
          <span className="font-mono text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      {delta && <DeltaChip kind={delta.kind}>{delta.text}</DeltaChip>}
      {sub && !delta && (
        <p className="text-xs text-muted-foreground font-mono tabular-nums">{sub}</p>
      )}
    </div>
  )
}

export function FieldLine({
  k,
  v,
  dense,
  highlight,
  className,
}: {
  k: string
  v: ReactNode
  dense?: boolean
  highlight?: Status
  className?: string
}) {
  const padding = dense ? "py-2" : "py-2.5"
  const valueColor = highlight ? STATUS_TEXT[highlight] : ""
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 rule-hair-b last:border-b-0",
        padding,
        className,
      )}
    >
      <span className="text-sm text-muted-foreground shrink-0">{k}</span>
      <span className={cn("text-sm text-right max-w-[60%] truncate tabular-nums", valueColor)}>
        {v}
      </span>
    </div>
  )
}

export function Marginalia({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <aside className={cn("text-xs font-mono text-muted-foreground leading-relaxed", className)}>
      {children}
    </aside>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "neutral"
  children: ReactNode
}) {
  const cls =
    tone === "green"
      ? "bg-[rgba(187,255,56,0.12)] text-[var(--accent-lime)]"
      : tone === "yellow"
      ? "bg-[rgba(255,164,43,0.14)] text-[var(--accent-amber)]"
      : tone === "red"
      ? "bg-[rgba(255,45,110,0.12)] text-[var(--accent-magenta)]"
      : "bg-white/[0.04] text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 eyebrow px-2 py-0.5 rounded-full",
        cls,
      )}
    >
      {children}
    </span>
  )
}

/* Legacy aliases — keep prior call sites working. */
export const Num = Stat
export const Row = FieldLine
```

- [ ] **Step 2: Rewrite `card.tsx`** — glass card with optional accent trace

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"
import type { AccentKey } from "@/components/primitives"

const ACCENT_VAR: Record<AccentKey, string> = {
  cyan: "var(--accent-cyan)",
  magenta: "var(--accent-magenta)",
  lime: "var(--accent-lime)",
  amber: "var(--accent-amber)",
}

function Card({
  className,
  accent,
  style,
  ...props
}: React.ComponentProps<"div"> & { accent?: AccentKey }) {
  const inlineStyle = accent
    ? ({ ["--card-accent" as never]: ACCENT_VAR[accent], ...style } as React.CSSProperties)
    : style
  return (
    <div
      data-slot="card"
      data-accent={accent}
      style={inlineStyle}
      className={cn(
        "relative flex flex-col gap-2 rounded-[14px] bg-card backdrop-blur-lg border border-white/[0.06] p-3.5 text-card-foreground",
        accent &&
          "after:content-[''] after:absolute after:left-3.5 after:right-3.5 after:bottom-1.5 after:h-[1.5px] after:rounded-[1px] after:bg-[var(--card-accent)] after:opacity-75 pb-5",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-baseline gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-sm font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center", className)} {...props} />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

- [ ] **Step 3: Rewrite `badge.tsx`** — chip-style pills

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap tabular-nums rounded-full transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background",
        secondary: "bg-white/[0.06] text-foreground",
        destructive: "bg-[rgba(255,45,110,0.12)] text-[var(--accent-magenta)]",
        outline: "border border-white/15 text-foreground",
        ghost: "[a&]:hover:bg-white/[0.06]",
        link: "text-[var(--accent-cyan)] underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 4: Rewrite `button.tsx`** — restore rounded corners

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        destructive: "bg-[var(--accent-magenta)] text-white hover:bg-[var(--accent-magenta)]/85",
        outline:
          "border border-white/15 bg-transparent hover:border-white/30 hover:bg-white/[0.04]",
        secondary: "bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
        ghost: "hover:bg-white/[0.06]",
        link: "text-[var(--accent-cyan)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 5: Rewrite `input.tsx`** — restore subtle bg + radius

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--accent-cyan)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/40",
        "aria-invalid:border-[var(--accent-magenta)] aria-invalid:ring-[var(--accent-magenta)]/40",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 6: Build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

Expected: build passes. `noUnusedLocals` may flag any old import in these files; remove on the spot.

- [ ] **Step 7: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/components/primitives.tsx apps/inspector/src/components/ui/card.tsx apps/inspector/src/components/ui/badge.tsx apps/inspector/src/components/ui/button.tsx apps/inspector/src/components/ui/input.tsx && git commit -m "inspector(pulse): glass Card, DeltaChip, Stat with accent, restored Button/Badge/Input chrome"
```

---

## Task 3: Re-tone components — `StatusBadge`, `MetricChip`, `SyncTrail`, `Hypnogram`, `SignIn`, `HelpModal`

**Files:**
- Modify: `apps/inspector/src/components/StatusBadge.tsx`
- Modify: `apps/inspector/src/components/MetricChip.tsx`
- Modify: `apps/inspector/src/components/SyncTrail.tsx`
- Modify: `apps/inspector/src/components/Hypnogram.tsx`
- Modify: `apps/inspector/src/screens/SignIn.tsx`
- Modify: `apps/inspector/src/shell/HelpModal.tsx`

- [ ] **Step 1: Rewrite `StatusBadge.tsx`** — glass card with `delta` slot

```tsx
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import type { AccentKey } from "@/components/primitives"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type StatusTone = "ok" | "warn" | "error" | "neutral"

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  neutral: "bg-white/30",
}

const TONE_ACCENT: Record<StatusTone, AccentKey | undefined> = {
  ok: "lime",
  warn: "amber",
  error: "magenta",
  neutral: undefined,
}

export function StatusBadge({
  tone,
  label,
  detail,
  action,
  size = "md",
}: {
  tone: StatusTone
  label: ReactNode
  detail?: ReactNode
  action?: { label: string; onClick: () => void }
  size?: "sm" | "md" | "lg"
}) {
  const titleClass =
    size === "lg"
      ? "text-base font-semibold"
      : size === "sm"
      ? "text-xs font-semibold"
      : "text-sm font-semibold"
  return (
    <Card accent={TONE_ACCENT[tone]} role="status">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
        <div className={cn("flex-1 min-w-0 leading-tight tracking-tight", titleClass)}>
          {label}
        </div>
        {action && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={action.onClick}
            className="shrink-0 h-auto px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10"
          >
            {action.label}
          </Button>
        )}
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{detail}</p>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Rewrite `MetricChip.tsx`** — glass card with hero number + trace + delta

```tsx
import { NumberTicker } from "@/components/magicui/number-ticker"
import { Card } from "@/components/ui/card"
import type { AccentKey, Delta } from "@/components/primitives"
import { DeltaChip } from "@/components/primitives"
import { cn } from "@/lib/utils"

const ACCENT_TEXT: Record<AccentKey, string> = {
  cyan: "text-[var(--accent-cyan)]",
  magenta: "text-[var(--accent-magenta)]",
  lime: "text-[var(--accent-lime)]",
  amber: "text-[var(--accent-amber)]",
}

export function MetricChip({
  label,
  value,
  unit,
  avg14d,
  baseline,
  accent,
}: {
  label: string
  value: number | null
  unit?: string
  avg14d?: number | null
  baseline?: number | null
  accent?: AccentKey
}) {
  const decimalPlaces = value != null && !Number.isInteger(value) ? 1 : 0
  const color = accent ? ACCENT_TEXT[accent] : "text-foreground"

  const delta: Delta | null = ((): Delta | null => {
    if (value == null) return null
    const ref = baseline ?? avg14d
    if (ref == null) return null
    const diff = value - ref
    if (Math.abs(diff) < 0.05) return { kind: "same", text: "— at base" }
    const sign = diff > 0 ? "+" : ""
    const magnitude = Math.abs(diff) >= 10 ? diff.toFixed(0) : diff.toFixed(1)
    return diff > 0
      ? { kind: "up", text: `${sign}${magnitude} vs base` }
      : { kind: "down", text: `${magnitude} vs base` }
  })()

  return (
    <Card accent={accent}>
      <p className="eyebrow">{label}</p>
      <div className="flex items-baseline gap-1.5">
        {value == null ? (
          <p className="font-mono text-[1.5rem] leading-none text-muted-foreground/60 tabular-nums">
            —
          </p>
        ) : (
          <>
            <p className={cn("text-[1.625rem] leading-none font-bold tabular-nums tracking-tight", color)}>
              <NumberTicker value={value} decimalPlaces={decimalPlaces} />
            </p>
            {unit && (
              <span className="font-mono text-xs text-muted-foreground">{unit}</span>
            )}
          </>
        )}
      </div>
      {delta && <DeltaChip kind={delta.kind}>{delta.text}</DeltaChip>}
    </Card>
  )
}
```

- [ ] **Step 3: Rewrite `SyncTrail.tsx`** — glass nodes, palette retoned

```tsx
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  neutral: "bg-white/30",
}

export type TrailNode = {
  name: string
  detail: ReactNode
  timestamp: string | null
  tone: Tone
}

export function SyncTrail({ nodes }: { nodes: TrailNode[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {nodes.map((node, i) => (
        <Card key={node.name}>
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", DOT[node.tone])} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
              {String(i + 1).padStart(2, "0")} · {node.name}
            </span>
          </div>
          <p className="text-sm text-foreground mt-1 truncate font-medium">
            {node.detail}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {node.timestamp ? relativeTime(node.timestamp) : "—"}
          </p>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Retone `Hypnogram.tsx` stage colors**

Use `Edit` on `apps/inspector/src/components/Hypnogram.tsx`:

```tsx
old_string:
const STAGES = {
  awake: { pos: 0, label: "Awake", color: "#C0392B" },
  rem: { pos: 1, label: "REM", color: "#7B5E3F" },
  core: { pos: 2, label: "Core", color: "#3A4F6B" },
  deep: { pos: 3, label: "Deep", color: "#1B2D4A" },
} as const

new_string:
const STAGES = {
  awake: { pos: 0, label: "Awake", color: "#FF2D6E" },
  rem: { pos: 1, label: "REM", color: "#00DCFF" },
  core: { pos: 2, label: "Core", color: "#5C8AC7" },
  deep: { pos: 3, label: "Deep", color: "#6B6CC5" },
} as const
```

- [ ] **Step 5: Rewrite `SignIn.tsx`** — single-column glass form

```tsx
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import { API_BASE_URL, emailStorage, signIn, signUp, tokenStorage } from "../api"
import { Logo } from "../components/Logo"

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type FormValues = z.infer<typeof schema>

export function SignIn({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: emailStorage.get() ?? "", password: "" },
  })

  const onSubmit = async (data: FormValues) => {
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === "signin"
          ? await signIn(data.email, data.password)
          : await signUp(data.email, data.password)
      tokenStorage.set(result.token)
      emailStorage.set(result.email)
      onAuthed(result.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card accent="cyan" className="w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Logo variant="badge" className="size-9 rounded-md" />
          <div>
            <p className="text-base font-semibold leading-tight">Noop Inspector</p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5 tabular-nums">
              {API_BASE_URL.replace(/^https?:\/\//, "")}
            </p>
          </div>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="eyebrow">Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="eyebrow">Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Form>

        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-4 px-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin")
            setError(null)
          }}
        >
          {mode === "signin"
            ? "No account yet? Create one."
            : "Already have an account? Sign in."}
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Rewrite `HelpModal.tsx`**

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Shortcut = { keys: string; action: string }

const NAV: Shortcut[] = [
  { keys: "1 – 7", action: "Jump to tab" },
  { keys: "⌘ K", action: "Open command palette" },
  { keys: "?", action: "Show this help" },
  { keys: "Esc", action: "Close any modal or menu" },
]
const ACTIONS: Shortcut[] = [
  { keys: "R", action: "Refresh data" },
  { keys: "P", action: "Open run-pipeline menu" },
  { keys: "L", action: "Toggle live tail" },
  { keys: "/", action: "Focus current tab's search" },
]
const DATE: Shortcut[] = [
  { keys: "[", action: "Previous day" },
  { keys: "]", action: "Next day" },
  { keys: "T", action: "Jump to today" },
  { keys: "D", action: "Focus date picker" },
]

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-card backdrop-blur-lg border border-white/10 rounded-[14px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Reference for keyboard shortcuts available in the inspector
          </DialogDescription>
        </DialogHeader>
        <Section title="Navigation" items={NAV} />
        <Section title="Actions" items={ACTIONS} />
        <Section title="Date" items={DATE} />
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <section>
      <p className="eyebrow text-[var(--accent-cyan)] mb-2">{title}</p>
      <div className="space-y-1">
        {items.map((s) => (
          <div key={s.keys} className="flex items-center justify-between rule-hair-b py-1.5 last:border-b-0">
            <span className="text-sm">{s.action}</span>
            <kbd className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-foreground tabular-nums">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

- [ ] **Step 8: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/components/StatusBadge.tsx apps/inspector/src/components/MetricChip.tsx apps/inspector/src/components/SyncTrail.tsx apps/inspector/src/components/Hypnogram.tsx apps/inspector/src/screens/SignIn.tsx apps/inspector/src/shell/HelpModal.tsx && git commit -m "inspector(pulse): retone StatusBadge, MetricChip, SyncTrail, Hypnogram, SignIn, HelpModal"
```

---

## Task 4: Masthead — drop ThemeToggle, retone, cyan tab underline

**Files:**
- Modify: `apps/inspector/src/shell/Masthead.tsx`

- [ ] **Step 1: Read current Masthead.tsx**

Note the import block — `ThemeToggle` is imported and rendered. We'll drop both the import and the JSX.

- [ ] **Step 2: Remove `ThemeToggle` import**

Use `Edit`:

```tsx
old_string:
import { Logo } from "../components/Logo"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { ThemeToggle } from "../components/ThemeToggle"
import { relativeTime } from "../format"

new_string:
import { Logo } from "../components/Logo"
import { RunPipelineMenu } from "../components/RunPipelineMenu"
import { relativeTime } from "../format"
```

- [ ] **Step 3: Remove `<ThemeToggle />` from JSX**

Use `Edit`:

```tsx
old_string:
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-border">
          <ThemeToggle />

          <span className="text-muted-foreground text-xs tabular-nums hidden lg:inline">

new_string:
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-border">
          <span className="text-muted-foreground text-xs tabular-nums hidden lg:inline">
```

(The `Masthead.tsx` may have a different surrounding context if the prior Field Manual edit shifted things; if `Edit` fails to find that exact string, search for `<ThemeToggle />` and remove just that line plus its surrounding whitespace.)

- [ ] **Step 4: Change tab underline color**

Find `bg-[var(--vermillion)]` inside the tab strip's active state and replace with `bg-[var(--accent-cyan)]`:

```bash
cd /Users/nish/Documents/noop && grep -n "vermillion" apps/inspector/src/shell/Masthead.tsx
```

For every line that uses `var(--vermillion)`, change it to `var(--accent-cyan)`. Replace all occurrences:

Use `Edit` with `replace_all: true`:

```tsx
old_string: var(--vermillion)
new_string: var(--accent-cyan)
```

- [ ] **Step 5: Drop serif date treatment**

Find the date display inside Masthead's date scrubber. The Field Manual rebuild used `font-display` on the date. Find and replace:

```bash
cd /Users/nish/Documents/noop && grep -n "font-display\|font-mono.*date\|tracking-tight.*text-foreground" apps/inspector/src/shell/Masthead.tsx | head -5
```

For any `font-display`, `font-display-tight` class in this file, replace with `font-medium`. For example:

Use `Edit` with `replace_all: true`:

```tsx
old_string: font-display text-h2
new_string: text-base font-semibold
```

If the exact string doesn't exist (Masthead may have evolved), use the file content from a fresh `Read` and adapt — the goal is: any serif/display references → plain Inter `text-base font-semibold` or similar.

- [ ] **Step 6: Build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

- [ ] **Step 7: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/shell/Masthead.tsx && git commit -m "inspector(pulse): masthead drops ThemeToggle, serif date, vermillion → cyan tab underline"
```

---

## Task 5: Tab cleanups — strip `n`/`kicker` from SectionHead, assign accents, retone Trends palette

**Files:**
- Modify: `apps/inspector/src/tabs/Home.tsx`
- Modify: `apps/inspector/src/tabs/Sleep.tsx`
- Modify: `apps/inspector/src/tabs/Insights.tsx`
- Modify: `apps/inspector/src/tabs/Trends.tsx`
- Modify: `apps/inspector/src/tabs/Telemetry.tsx`
- Modify: `apps/inspector/src/tabs/Raw.tsx`
- Modify: `apps/inspector/src/tabs/Pipeline.tsx`

The new `SectionHead({ children, meta })` signature drops `n` and `kicker` props. Existing call sites use those props heavily — they need to be stripped or merged into `meta`.

For each tab:

1. Find all `<SectionHead n={...} kicker="...">` calls.
2. Replace the `n` prop with nothing (drop it).
3. Move `kicker` content into `meta` if it adds value, otherwise drop. Most kickers are explanatory body text that can be dropped because the section is self-evident.
4. Assign `accent` props to `MetricChip` / `Stat` per the metric color map.

**Metric → accent color map:**
- Duration, Sleep duration, Sleep avg → `cyan`
- HRV (any flavor) → `magenta`
- Recovery, Resting HR, RHR → `lime`
- Respiratory, Strain, Stress, Training, SpO2, Consistency → `amber`

- [ ] **Step 1: `Home.tsx` — strip SectionHead props, assign accents**

Read the file, then for each `<SectionHead n={N} kicker="...">…</SectionHead>` rewrite to `<SectionHead>…</SectionHead>` or `<SectionHead meta="…">…</SectionHead>` if the kicker has a useful meta.

For the metric chip grid, assign accents:

```tsx
old_string:
    {
      label: "Duration",
      value: detection?.durationHours ?? null,
      unit: "h",
      avg14d: avgOfLastN(durationSeries, 14),
      baseline: null,
      info: {

new_string:
    {
      label: "Duration",
      value: detection?.durationHours ?? null,
      unit: "h",
      avg14d: avgOfLastN(durationSeries, 14),
      baseline: null,
      accent: "cyan" as const,
      info: {
```

Repeat for HRV → magenta, Resting HR → lime, Respiratory → amber. Then pass `accent={c.accent}` to the `<MetricChip>` render inside the map.

The chip type definition needs the accent field — extend it:

```tsx
old_string:
  const chips: Array<{
    label: string
    value: number | null
    unit: string
    avg14d: number | null
    baseline: number | null
    info: MetricInfoProps
  }> = [

new_string:
  const chips: Array<{
    label: string
    value: number | null
    unit: string
    avg14d: number | null
    baseline: number | null
    accent: "cyan" | "magenta" | "lime" | "amber"
    info: MetricInfoProps
  }> = [
```

For SectionHead calls — use `Edit` repeatedly with the actual existing strings. Example:

```tsx
old_string:
        <SectionHead
          n={1}
          kicker={
            detection
              ? `${detection.durationHours.toFixed(1)}h sleep · ${detection.bedtime ? new Date(detection.bedtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"} bed → ${detection.wakeTime ? new Date(detection.wakeTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"} wake`
              : undefined
          }
          meta={
            detection?.confidence != null
              ? `confidence ${(detection.confidence * 100).toFixed(0)}%`
              : undefined
          }
        >
          The night of{" "}
          <span className="font-display italic">
            {formatDate(sleep?.selectedNightDate ?? date)}
          </span>
        </SectionHead>

new_string:
        <SectionHead
          meta={
            detection?.confidence != null
              ? `confidence ${(detection.confidence * 100).toFixed(0)}%`
              : detection
              ? `${detection.durationHours.toFixed(1)}h sleep`
              : undefined
          }
        >
          The night of{" "}
          <span className="font-medium">
            {formatDate(sleep?.selectedNightDate ?? date)}
          </span>
        </SectionHead>
```

Apply the same pattern to every SectionHead call in Home.tsx — drop `n`, drop `kicker` (fold useful info into `meta`), remove `font-display italic` styling and use plain emphasis. The editorial pull-quote (`<blockquote className="font-display ...">`) for journal correlations becomes a glass Card:

```tsx
old_string:
      {topCorrelation && (
        <section className="rule-strong pt-4">
          <p className="eyebrow text-[var(--vermillion)] mb-3">a note from the data</p>
          <blockquote className="font-display text-[1.5rem] leading-snug max-w-[640px] text-foreground">
            <AnimatedShinyText className="text-inherit leading-inherit max-w-none">
              {topCorrelation}
            </AnimatedShinyText>
          </blockquote>
        </section>
      )}

new_string:
      {topCorrelation && (
        <Card accent="cyan">
          <p className="eyebrow text-[var(--accent-cyan)] mb-2">a note from the data</p>
          <p className="text-base leading-snug text-foreground max-w-[640px]">
            <AnimatedShinyText className="text-inherit leading-inherit max-w-none">
              {topCorrelation}
            </AnimatedShinyText>
          </p>
        </Card>
      )}
```

Add `Card` to the import block at the top of Home.tsx if not already present:

```tsx
import { Card } from "@/components/ui/card"
```

- [ ] **Step 2: `Sleep.tsx` — same pattern**

For every `<SectionHead n=... kicker=...>` call, drop the props (keep `meta` if useful). Assign accents to the four vitals `<Num>` calls:

- Duration → `accent="cyan"`
- Resting HR → `accent="lime"`
- HRV (RMSSD) → `accent="magenta"`
- Respiratory → `accent="amber"`

Drop the `font-display italic` styling on the date.

- [ ] **Step 3: `Insights.tsx` — strip SectionHead, accent DeltaTile and DirectionCard**

DeltaTile and DirectionCard live in Insights.tsx. They already render rule-strong sections; refactor them to use `<Card accent={...}>` instead. Map labels to accents:

- "HRV (RMSSD)" → magenta
- "Resting HR" → lime
- "SDNN" → magenta
- "Sleep duration" → cyan
- "HRV" (DirectionCard) → magenta
- "Resting HR" (DirectionCard) → lime
- "Avg sleep duration" (DirectionCard) → cyan

Drop the editorial pull-quote pattern same as Home.

- [ ] **Step 4: `Trends.tsx` — strip SectionHead, retone CHART_COLORS, accent SummaryStat**

Retone the chart palette:

```tsx
old_string:
const CHART_COLORS = {
  hrv: "#3A4F6B",
  rhr: "#C0392B",
  sleep: "#1B2D4A",
  recovery: "#5F6B4E",
  consistency: "#4A5D7A",
  strain: "#B57F2A",
  spo2: "#7B5E3F",
  resp: "#A0577A",
  stress: "#A23B2D",
  training: "#6B5F52",
} as const

new_string:
const CHART_COLORS = {
  hrv: "#FF2D6E",
  rhr: "#BBFF38",
  sleep: "#00DCFF",
  recovery: "#BBFF38",
  consistency: "#5C8AC7",
  strain: "#FFA42B",
  spo2: "#FFA42B",
  resp: "#FFA42B",
  stress: "#FF2D6E",
  training: "#6B6CC5",
} as const
```

Strip `n` / `kicker` from SectionHead calls. Add accent props to the three SummaryStat usages (HRV → magenta, Resting HR → lime, Sleep avg → cyan). The SummaryStat helper function inside Trends.tsx needs an `accent` prop forwarded to its inner Stat-like render.

- [ ] **Step 5: `Telemetry.tsx`, `Raw.tsx`, `Pipeline.tsx` — strip SectionHead `n`/`kicker`**

For each, find `<SectionHead n="..." kicker="...">` calls and remove the `n`/`kicker` props. Keep `meta` if present. No accent assignment needed in these tabs (they're not metric-row-driven).

- [ ] **Step 6: Build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

Fix any `noUnusedLocals` errors that pop up (e.g. if dropping kicker references removes the need for a helper import).

- [ ] **Step 7: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/tabs/ && git commit -m "inspector(pulse): tabs strip chapter heads, assign per-metric accents, retone Trends palette"
```

---

## Task 6: Push and verify deploy

- [ ] **Step 1: Push**

```bash
cd /Users/nish/Documents/noop && git push
```

- [ ] **Step 2: Find run id**

```bash
gh run list --limit 1 --json databaseId,status,headSha
```

- [ ] **Step 3: Watch deploy**

```bash
gh run watch <databaseId> --exit-status
```

Expected: `success`. If build fails on CI but passed locally, it's almost always a `noUnusedLocals` flag — read the log, fix the import, repush.

- [ ] **Step 4: Manual visual check**

Open `https://noop.enform.co`. Sign in. For each tab:

- Background is pitch black, no cream.
- Sticky masthead is a glass row, tab underline is cyan, no ThemeToggle button.
- Metric cards have a hairline at the bottom in the accent color.
- Numbers are bold sans (Inter) in their accent color, no serif.
- Delta chips appear under each metric with a value + baseline.
- No "01 — TITLE" chapter formatting anywhere.

If anything is off, capture screenshot, report; do not declare done.

---

## Self-review

**1. Spec coverage:**
- §Foundation (palette, fonts, type scale) → Task 1 ✓
- §Surface / glass cards → Task 2 step 2 ✓
- §Trace hairline → Task 2 step 2 (Card `after:` rules) ✓
- §Type (Inter + JBM, drop Fraunces) → Task 1 ✓
- §Accent palette → Task 1 ✓
- §Delta chips → Task 2 step 1 (`DeltaChip`) ✓
- §Card primitive (`accent` prop) → Task 2 step 2 ✓
- §Stat / Number primitive → Task 2 step 1 ✓
- §SectionHead new signature → Task 2 step 1 ✓
- §DeltaChip component → Task 2 step 1 ✓
- §Per-tab cleanup → Task 5 ✓
- §Theme toggle removed → Task 4 step 2 ✓
- §Light mode dropped → Task 1 (`:root, .dark` selectors merged) ✓
- §Drop chapter numbering — every tab → Task 5 ✓
- §Drop paper-grain noise overlay → Task 1 (omitted from new index.css) ✓
- §Drop `--paper`, `--ink`, `--vermillion`, `--sage` → Task 1 ✓
- §Build verification → every task ends with `pnpm run build` ✓
- §Rollout → Task 6 ✓

**2. Placeholder scan:** No TBDs, no "TODO", no "implement later", no "similar to Task N". Every step shows the exact replacement string.

**3. Type consistency:**
- `AccentKey` defined in Task 2 step 1; consumed in Task 2 step 2 (Card), Task 3 (StatusBadge, MetricChip), Task 5 (chip arrays). ✓
- `Delta` type defined alongside `DeltaChip`; consumed in MetricChip and Stat. ✓
- `StatusBadge`'s legacy `StatusTone` (`ok|warn|error|neutral`) stays — call sites are unchanged. ✓
- `Pill`'s `tone` (`green|yellow|red|neutral`) stays — Insights and Home call this. ✓

No issues found.
