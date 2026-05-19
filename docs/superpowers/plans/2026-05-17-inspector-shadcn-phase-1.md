# Inspector Component Library Migration — Phase 1: Foundation

> Phase 1 of a multi-phase migration. Phase 1 = install shadcn/ui + Magic UI + DiceUI, reconcile tokens, wire light/dark theme. **No screen rewrites in this phase** — those land in Phase 2.

**Goal:** Stand up shadcn/ui + Magic UI + DiceUI as the primary toolkit for the Inspector, reconcile the token system without breaking existing screens, and ship a light/dark theme infrastructure ready for Phase 2.

**Decisions locked (from brainstorm):**
- Library: **shadcn/ui + Magic UI + DiceUI** (all three).
- Tokens: **adopt shadcn names as primary** (`--background`, `--foreground`, `--primary`, `--muted`, ...) with existing names (`--color-surface`, `--color-text-*`) kept as aliases pointing at the new vars. Stage colors (`--color-stage-*`) and `--font-size-dense` survive as domain tokens.
- Theme: **light + dark from Phase 1**, controlled by a class on `<html>`, with system-preference default and a toggle in the TopBar.

**Non-goals for Phase 1:**
- Rewriting tabs (Home, Sleep, Pipeline, Raw, Trends, Insights, Telemetry). Done in Phase 2.
- Replacing custom domain components (Hypnogram, DayTimeline, StageHrScatter, TrendChart, PipelineRunsChart, VirtualTable, SyncTrail, StatusBadge, MetricChip). These stay; Phase 2 may slot some onto shadcn `Card` chrome.
- Changing data layer / routing.
- Logo migration (Phase 3) and better-auth audit (Phase 4).

---

## Architecture

shadcn copies component source into `apps/inspector/src/components/ui/`. We own the code — easy to customise without forking. shadcn's CLI handles install + tailwind config + token wiring.

Magic UI components installable via the same CLI (`npx shadcn add "https://magicui.design/r/<name>.json"`), copied into `src/components/magicui/`.

DiceUI installs differently — `pnpm add @diceui/<component>`. Stays as an npm package, not copied source.

Tailwind v4 + shadcn integration uses the new `@theme inline` syntax. Both light and dark token sets live in `index.css` under `:root` and `.dark` respectively, and `@theme inline` maps them into Tailwind utility names.

**Path aliases**: shadcn CLI assumes `@/components` etc. We add `@/*` → `./src/*` in `tsconfig.app.json` and `vite.config.ts`.

**Theme provider**: a small React context that reads `localStorage("noop.inspector.theme")` (or system default), writes the `.dark` class to `<html>`, and persists changes. Triggered from a TopBar toggle.

---

## File Structure

```
apps/inspector/
├── components.json                 [NEW — shadcn config]
├── package.json                    [+ tailwind-merge, clsx, class-variance-authority,
│                                     lucide-react, motion, @diceui/* ]
├── tsconfig.app.json               [+ paths: @/* → src/*]
├── vite.config.ts                  [+ resolve.alias @ → src]
└── src/
    ├── index.css                   [REWRITE token block]
    ├── lib/
    │   └── utils.ts                [NEW — shadcn's cn() helper]
    ├── hooks/
    │   └── useTheme.ts             [NEW — theme provider + hook]
    └── components/
        ├── ui/                     [NEW — shadcn-installed components]
        │   ├── button.tsx
        │   ├── input.tsx
        │   ├── select.tsx
        │   ├── dialog.tsx
        │   ├── sheet.tsx
        │   ├── drawer.tsx
        │   ├── dropdown-menu.tsx
        │   ├── tooltip.tsx
        │   ├── tabs.tsx
        │   ├── sonner.tsx          [toast]
        │   ├── command.tsx
        │   ├── popover.tsx
        │   ├── table.tsx
        │   ├── scroll-area.tsx
        │   ├── resizable.tsx
        │   ├── badge.tsx
        │   ├── card.tsx
        │   ├── alert.tsx
        │   ├── separator.tsx
        │   ├── skeleton.tsx
        │   ├── label.tsx
        │   ├── checkbox.tsx
        │   ├── switch.tsx
        │   ├── slider.tsx
        │   └── collapsible.tsx
        ├── magicui/                [NEW — Magic UI components]
        │   ├── number-ticker.tsx
        │   ├── animated-beam.tsx
        │   ├── marquee.tsx
        │   ├── blur-fade.tsx
        │   ├── animated-list.tsx
        │   ├── shimmer-button.tsx
        │   ├── animated-gradient-text.tsx
        │   └── animated-shiny-text.tsx
        └── ThemeToggle.tsx         [NEW — sun/moon button for TopBar]
```

DiceUI components stay as imported packages — no source copy.

---

## Tasks

### Task 1: path aliases + cn() helper

**Files:**
- Modify: `apps/inspector/tsconfig.app.json`
- Modify: `apps/inspector/vite.config.ts`
- Create: `apps/inspector/src/lib/utils.ts`

- [ ] **Step 1: Add `@/*` path to tsconfig.app.json**

Add under `compilerOptions`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 2: Add resolve alias in `vite.config.ts`**

```ts
import path from "node:path"
// ...
export default defineConfig({
  // ...
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
```

- [ ] **Step 3: Install dep + create `lib/utils.ts`**

```bash
cd apps/inspector
pnpm add clsx tailwind-merge
```

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: Type-check + commit**

```bash
pnpm exec tsc -b
git add apps/inspector/{tsconfig.app.json,vite.config.ts,src/lib/utils.ts,package.json} pnpm-lock.yaml
git commit -m "inspector(shadcn-phase-1): path aliases + cn() helper"
```

---

### Task 2: token system rewrite + light/dark

**Files:**
- Modify: `apps/inspector/src/index.css`

- [ ] **Step 1: Rewrite the token block**

Replace `index.css` token block with shadcn's pattern. Both light and dark variants, plus our domain tokens preserved:

```css
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
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* domain tokens */
  --color-stage-awake: var(--stage-awake);
  --color-stage-rem: var(--stage-rem);
  --color-stage-core: var(--stage-core);
  --color-stage-deep: var(--stage-deep);

  /* semantic status (used in StatusBadge, Num, Row, PipelineRunsChart) */
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);

  /* aliases — keep existing screens compiling until Phase 2 sweep */
  --color-surface: var(--background);
  --color-surface-1: var(--card);
  --color-surface-raised: var(--card);
  --color-surface-2: var(--muted);
  --color-surface-3: var(--accent);
  --color-text-0: var(--foreground);
  --color-text-1: var(--muted-foreground);
  --color-text-2: var(--muted-foreground);
  --color-border-strong: var(--ring);
  --color-green: var(--success);
  --color-green-soft: color-mix(in oklch, var(--success) 15%, transparent);
  --color-red: var(--destructive);
  --color-red-soft: color-mix(in oklch, var(--destructive) 15%, transparent);
  --color-yellow: var(--warning);
  --color-yellow-soft: color-mix(in oklch, var(--warning) 15%, transparent);
  --color-accent-soft: color-mix(in oklch, var(--primary) 15%, transparent);

  --font-size-dense: 13px;
}

:root {
  /* light theme (default) */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(0.98 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.6 0.182 252);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.96 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.94 0 0);
  --muted-foreground: oklch(0.45 0 0);
  --accent: oklch(0.92 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.6 0.21 27);
  --destructive-foreground: oklch(0.985 0 0);
  --success: oklch(0.6 0.18 145);
  --success-foreground: oklch(0.985 0 0);
  --warning: oklch(0.75 0.18 80);
  --warning-foreground: oklch(0.205 0 0);
  --border: oklch(0.88 0 0);
  --input: oklch(0.88 0 0);
  --ring: oklch(0.78 0 0);

  /* stage colors — same across themes, picked for AA contrast on
     both light and dark surfaces */
  --stage-awake: #FE8A73;
  --stage-rem: #3FB1E7;
  --stage-core: #5BA8FF;
  --stage-deep: #7B78D6;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.65 0.182 252);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.22 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.24 0 0);
  --muted-foreground: oklch(0.7 0 0);
  --accent: oklch(0.28 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.7 0.22 27);
  --destructive-foreground: oklch(0.145 0 0);
  --success: oklch(0.7 0.18 145);
  --success-foreground: oklch(0.145 0 0);
  --warning: oklch(0.8 0.18 80);
  --warning-foreground: oklch(0.145 0 0);
  --border: oklch(0.3 0 0);
  --input: oklch(0.3 0 0);
  --ring: oklch(0.4 0 0);
}

* { box-sizing: border-box; margin: 0; }
:root { color-scheme: light dark; }

html, body, #root {
  height: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.55;
  color: var(--foreground);
  background: var(--background);
  -webkit-font-smoothing: antialiased;
}

/* keep existing focus + scrollbar styles unchanged */
```

- [ ] **Step 2: Install `tw-animate-css`**

```bash
pnpm add -D tw-animate-css
```

- [ ] **Step 3: Build verification**

```bash
pnpm exec vite build
```
Expected: build succeeds. Existing screens look ~the same (now driven by the alias chain).

- [ ] **Step 4: Visual smoke test in dev**

`pnpm dev`, open the inspector. The light theme is active by default. Confirm nothing is broken visually. (Some Pill colours will look slightly different — that's expected; the migration to shadcn semantic colours is intentional.)

- [ ] **Step 5: Commit**

```bash
git add apps/inspector/src/index.css apps/inspector/package.json pnpm-lock.yaml
git commit -m "inspector(shadcn-phase-1): rewrite tokens — shadcn primary + light/dark + domain"
```

---

### Task 3: theme provider + toggle

**Files:**
- Create: `apps/inspector/src/hooks/useTheme.ts`
- Create: `apps/inspector/src/components/ThemeToggle.tsx`
- Modify: `apps/inspector/src/main.tsx` (add `<ThemeProvider>` wrap)
- Modify: `apps/inspector/src/shell/TopBar.tsx` (add toggle button)

- [ ] **Step 1: Hook**

```ts
// src/hooks/useTheme.ts
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type Ctx = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (t: Theme) => void
}

const ThemeCtx = createContext<Ctx | null>(null)
const STORAGE_KEY = "noop.inspector.theme"

function getSystem(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system",
  )
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    theme === "system" ? getSystem() : theme,
  )

  useEffect(() => {
    const resolved = theme === "system" ? getSystem() : theme
    setResolvedTheme(resolved)
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const r = mq.matches ? "dark" : "light"
      setResolvedTheme(r)
      document.documentElement.classList.toggle("dark", r === "dark")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }

  return <ThemeCtx.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error("useTheme must be used inside ThemeProvider")
  return v
}
```

- [ ] **Step 2: Toggle component**

```tsx
// src/components/ThemeToggle.tsx
import { useTheme } from "@/hooks/useTheme"

const ICON: Record<string, string> = {
  light: "M12 3v1.5M12 19.5V21M21 12h-1.5M4.5 12H3M18.364 5.636l-1.06 1.06M6.696 17.304l-1.06 1.06M18.364 18.364l-1.06-1.06M6.696 6.696l-1.06-1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z",
  dark: "M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z",
  system: "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25",
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"]
  const next = order[(order.indexOf(theme) + 1) % order.length]
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${theme} (click for ${next})`}
      aria-label="Toggle theme"
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
    >
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON[theme]} />
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Wrap app in `<ThemeProvider>`**

In `src/main.tsx`:

```tsx
import { ThemeProvider } from "./hooks/useTheme"

createRoot(...).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Add `<ThemeToggle />` to TopBar**

In `src/shell/TopBar.tsx`, insert in the right-action cluster between the live toggle and "last refreshed" text.

- [ ] **Step 5: Manual smoke test**

`pnpm dev` → toggle theme through Light → Dark → System. Verify class on `<html>` and background colour update. Verify localStorage persists across reload.

- [ ] **Step 6: Commit**

```bash
git add apps/inspector/src/{hooks/useTheme.ts,components/ThemeToggle.tsx,main.tsx,shell/TopBar.tsx}
git commit -m "inspector(shadcn-phase-1): theme provider + light/dark/system toggle"
```

---

### Task 4: shadcn CLI init

**Files:**
- Create: `apps/inspector/components.json`

- [ ] **Step 1: Run shadcn init**

```bash
cd apps/inspector
pnpm dlx shadcn@latest init
```

Answer prompts:
- Style: New York
- Base colour: Neutral
- CSS variables: yes
- Path aliases: `@/components`, `@/lib/utils`, `@/hooks`, `@/components/ui`, `@/lib`

This creates `components.json` and (re-)writes some token boilerplate into `index.css`. Diff carefully — we want to keep our existing tokens, not have shadcn overwrite them. Reconcile manually if needed.

- [ ] **Step 2: Verify**

`components.json` exists with `tailwind: { cssVariables: true }` and correct `aliases`.

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/components.json
git commit -m "inspector(shadcn-phase-1): shadcn init"
```

---

### Task 5: install core shadcn primitives

**Files:**
- Create: `apps/inspector/src/components/ui/*` (~25 files)

- [ ] **Step 1: Batch install**

```bash
cd apps/inspector
pnpm dlx shadcn@latest add \
  button input select dialog sheet drawer dropdown-menu tooltip \
  tabs sonner command popover table scroll-area resizable badge \
  card alert separator skeleton label checkbox switch slider \
  collapsible
```

- [ ] **Step 2: Build check**

```bash
pnpm exec tsc -b
pnpm exec vite build
```
Expected: clean. No tab content changes yet — just new modules sitting unused.

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/components/ui apps/inspector/package.json pnpm-lock.yaml
git commit -m "inspector(shadcn-phase-1): install core shadcn primitives (25)"
```

---

### Task 6: install Magic UI components

**Files:**
- Create: `apps/inspector/src/components/magicui/*` (~8 files)

- [ ] **Step 1: Install motion**

```bash
pnpm add motion
```

- [ ] **Step 2: Install Magic UI components via registry URLs**

```bash
pnpm dlx shadcn@latest add "https://magicui.design/r/number-ticker.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/animated-beam.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/marquee.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/blur-fade.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/animated-list.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/shimmer-button.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/animated-gradient-text.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/animated-shiny-text.json"
```

- [ ] **Step 3: Build check**

```bash
pnpm exec vite build
```

- [ ] **Step 4: Commit**

```bash
git add apps/inspector/src/components/magicui apps/inspector/package.json pnpm-lock.yaml
git commit -m "inspector(shadcn-phase-1): install Magic UI animated components"
```

---

### Task 7: install DiceUI components

**Files:**
- Modify: `apps/inspector/package.json`

- [ ] **Step 1: Install**

```bash
pnpm add @diceui/mention @diceui/sortable @diceui/combobox @diceui/tags-input @diceui/editable
```

Note: as of writing, DiceUI doesn't ship a multi-select primitive — shadcn's `Combobox` + `Badge` pattern handles that.

- [ ] **Step 2: Build check**

```bash
pnpm exec vite build
```

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/package.json pnpm-lock.yaml
git commit -m "inspector(shadcn-phase-1): install DiceUI advanced components"
```

---

### Task 8: smoke test — swap one element to verify the pipeline

**Files:**
- Modify: `apps/inspector/src/shell/CommandPalette.tsx`

A small, low-risk swap: replace our custom `CommandPalette` modal with shadcn's `Command` primitive. Same behaviour, but proves the shadcn install actually renders, themes, and keyboard-navigates correctly. If this works end-to-end, Phase 2 has green-light.

- [ ] **Step 1: Rewrite CommandPalette using shadcn `Command` + `Dialog`**

Use `CommandDialog` (already exports from `@/components/ui/command`). Same `commands: Command[]` external API so Inspector.tsx doesn't change.

```tsx
// src/shell/CommandPalette.tsx
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

export type Command = {
  id: string
  label: string
  hint?: string
  shortcut?: string
  group: "Navigate" | "Actions" | "Data" | "Date"
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const groups = ["Navigate", "Actions", "Data", "Date"] as const

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput placeholder="Search or run a command..." />
      <CommandList>
        <CommandEmpty>No commands match.</CommandEmpty>
        {groups.map((g, i) => {
          const items = commands.filter((c) => c.group === g)
          if (items.length === 0) return null
          return (
            <div key={g}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={g}>
                {items.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    onSelect={() => {
                      onClose()
                      cmd.run()
                    }}
                  >
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.hint && <span className="text-muted-foreground text-xs">{cmd.hint}</span>}
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
```

- [ ] **Step 2: Build + smoke test**

```bash
pnpm exec tsc -b
pnpm exec vite build
pnpm dev
```
Open inspector, press ⌘K, verify: opens, search filters, arrow keys navigate, Enter fires, Esc closes, focus restores.

- [ ] **Step 3: Commit**

```bash
git add apps/inspector/src/shell/CommandPalette.tsx
git commit -m "inspector(shadcn-phase-1): port CommandPalette to shadcn Command — smoke test"
```

---

### Task 9: Phase 2 readiness — token map document

**Files:**
- Create: `apps/inspector/src/components/TOKEN_MAP.md`

- [ ] **Step 1: Write the migration table**

```markdown
# Token Migration Map (Phase 1 → Phase 2)

Old class            → New class                  → Notes
---------------------|-----------------------------|-----------
bg-surface           → bg-background              | page bg only
bg-surface-1         → bg-card                    | chart/table cards
bg-surface-raised    → bg-card                    | stat cards
bg-surface-2         → bg-muted                   | hover, tooltip
bg-surface-3         → bg-accent                  | focused inputs
text-text-0          → text-foreground            | primary text
text-text-1          → text-muted-foreground      | secondary text
text-text-2          → text-muted-foreground      | tertiary text
border-border        → border                     | default border
border-border-strong → border-ring                | strong border (rare)
text-accent          → text-primary               | accent / link text
bg-accent            → bg-primary                 | primary buttons
text-green / bg-green-soft     → text-success / bg-success/10
text-red   / bg-red-soft       → text-destructive / bg-destructive/10
text-yellow/ bg-yellow-soft    → text-warning / bg-warning/10

Stage tokens unchanged: text-stage-awake / rem / core / deep.
```

- [ ] **Step 2: Commit**

```bash
git add apps/inspector/src/components/TOKEN_MAP.md
git commit -m "inspector(shadcn-phase-1): Phase 2 token migration map"
```

---

## Done

All 9 tasks complete = Phase 1 shipped. Inspector boots with shadcn + Magic UI + DiceUI installed, light/dark theme working, command palette running on shadcn primitives end-to-end, existing tabs unchanged but compiling against the new token aliases.

**Phase 2** will follow with its own plan covering tab-by-tab rewrite using these primitives.
