# Inspector layout fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clamp the inspector dashboard to a 1200px-wide centered column on wide screens, and fix the invisible empty-value rendering in `MetricChip` so days with no detection don't look broken.

**Architecture:** Two-file change. The masthead `<header>` gets its own `max-w-[1200px] mx-auto w-full` so the sticky band centers within wide viewports while still rendering as a coherent strip. The content column already has its own `max-w-[1200px] mx-auto` in `Inspector.tsx`. Padding is normalized to `px-12` on both so left/right edges align. `MetricChip`'s null branch swaps Fraunces display em-dash for a mono em-dash at 28px in muted color, and the unit chip is hidden when there is no value.

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind v4 (arbitrary values + custom utilities via `@theme inline`). Production build runs `tsc -b && vite build` and enforces `noUnusedLocals` — local `tsc --noEmit` does not, so always verify with `pnpm run build` before committing.

**Specs:** `docs/superpowers/specs/2026-05-19-inspector-layout-fixes-design.md`

---

## File map

- `apps/inspector/src/shell/Masthead.tsx` — modify outermost `<header>` className: add `max-w-[1200px] mx-auto w-full`, change inner `px-6` to `px-12` on row 1 and tab strip nav.
- `apps/inspector/src/components/MetricChip.tsx` — rewrite the null branch of the value render and conditionally render the unit.

No new files. No tests added (no behavioral logic changed — these are presentation tweaks; verification is visual + build).

---

## Task 1: Clamp Masthead to 1200px and align padding

**Files:**
- Modify: `apps/inspector/src/shell/Masthead.tsx`

The `<header>` element currently spans the full viewport. Add a max-width clamp and centered margins so the masthead band sits inside a 1200px column. Change horizontal padding from `px-6` to `px-12` on the row-1 grid and on the inner `<nav>` of the tab strip so the masthead's content edges align with the content column below (which already uses `px-12` inside a `max-w-[1200px] mx-auto` wrapper in `Inspector.tsx`).

- [ ] **Step 1: Read the current `<header>` opening tag**

Current `Masthead.tsx` line ~88:

```tsx
<header className="bg-paper sticky top-0 z-30 shrink-0 rule-hair-b">
```

- [ ] **Step 2: Add the clamp classes to `<header>`**

Use `Edit`:

```tsx
old_string:
    <header className="bg-paper sticky top-0 z-30 shrink-0 rule-hair-b">

new_string:
    <header className="bg-paper sticky top-0 z-30 shrink-0 rule-hair-b max-w-[1200px] mx-auto w-full">
```

- [ ] **Step 3: Find the row-1 grid container and bump padding**

Current line ~92:

```tsx
<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 h-16">
```

Use `Edit`:

```tsx
old_string:
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 h-16">

new_string:
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-12 h-16">
```

- [ ] **Step 4: Find the tab strip `<nav>` and bump padding**

The tab strip is inside the `TabStrip` component, also in `Masthead.tsx`. Its `<nav>` currently:

```tsx
<nav
  aria-label="Inspector sections"
  className="rule-hair flex items-center justify-center h-11 px-6 gap-0"
>
```

Use `Edit`:

```tsx
old_string:
    <nav
      aria-label="Inspector sections"
      className="rule-hair flex items-center justify-center h-11 px-6 gap-0"
    >

new_string:
    <nav
      aria-label="Inspector sections"
      className="rule-hair flex items-center justify-center h-11 px-12 gap-0"
    >
```

- [ ] **Step 5: Run the production build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

Expected: build completes without errors, ends with `Tasks: 2 successful, 2 total`.

If `noUnusedLocals` flags anything, fix that import before continuing — do not commit a broken build.

- [ ] **Step 6: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/shell/Masthead.tsx && git commit -m "inspector(masthead): clamp to 1200px centered, normalize px-12 with content column"
```

---

## Task 2: Make `MetricChip` empty value visible, hide unit when value is null

**Files:**
- Modify: `apps/inspector/src/components/MetricChip.tsx`

The current null branch renders an em-dash in Fraunces display at 40px (`font-display-tight text-[2.5rem]`). At display size, Fraunces' em-dash renders as a hairline stroke that is essentially invisible against the cream/ink page. Replace with `font-mono` at 28px and `text-muted-foreground/60`. Additionally hide the unit when the value is null — without a number, the unit is meaningless and floating it alone next to an invisible dash is what makes the column look broken.

- [ ] **Step 1: Read the current value-rendering block**

Lines ~27–36 of `MetricChip.tsx`:

```tsx
<div className="flex items-baseline gap-1.5">
  {value == null ? (
    <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">—</p>
  ) : (
    <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
      <NumberTicker value={value} decimalPlaces={decimalPlaces} />
    </p>
  )}
  {unit && (
    <p className="font-mono text-xs text-muted-foreground tabular-nums">
      {unit}
    </p>
  )}
</div>
```

- [ ] **Step 2: Replace the block with the new null-state treatment**

Use `Edit`:

```tsx
old_string:
      <div className="flex items-baseline gap-1.5">
        {value == null ? (
          <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">—</p>
        ) : (
          <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
            <NumberTicker value={value} decimalPlaces={decimalPlaces} />
          </p>
        )}
        {unit && (
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {unit}
          </p>
        )}
      </div>

new_string:
      <div className="flex items-baseline gap-1.5">
        {value == null ? (
          <p className="font-mono text-[1.75rem] leading-none text-muted-foreground/60 tabular-nums">
            —
          </p>
        ) : (
          <>
            <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
              <NumberTicker value={value} decimalPlaces={decimalPlaces} />
            </p>
            {unit && (
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {unit}
              </p>
            )}
          </>
        )}
      </div>
```

- [ ] **Step 3: Run the production build**

```bash
cd /Users/nish/Documents/noop/apps/inspector && pnpm run build
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nish/Documents/noop && git add apps/inspector/src/components/MetricChip.tsx && git commit -m "inspector(metric-chip): visible empty-state em-dash, hide unit when value is null"
```

---

## Task 3: Push to deploy and verify

- [ ] **Step 1: Push to main**

```bash
cd /Users/nish/Documents/noop && git push
```

Expected: pushes both commits from Tasks 1–2 to origin/main, which triggers the GitHub Actions Deploy Inspector workflow.

- [ ] **Step 2: Wait for the deploy**

```bash
gh run list --limit 1 --json databaseId,status,headSha
```

Capture the `databaseId` of the most recent "Deploy Inspector" run, then watch it:

```bash
gh run watch <databaseId> --exit-status
```

Expected: workflow finishes with `success`. If it fails on build (most common cause: a stray unused import flagged by `noUnusedLocals`), read `gh run view <id> --log-failed | grep -i error`, fix, recommit, repush.

- [ ] **Step 3: Visual verify on `noop.enform.co`**

Open `https://noop.enform.co` on a screen wider than 1200px. Confirm:

1. Masthead, tab strip, status row, and all body content sit centered with paper background visible on both sides of a single ~1200px-wide column.
2. The bottom hairline under the tab strip ends at the 1200px column boundary (not at the viewport edge).
3. Navigate to a date with no detection (today, `2026-05-18`, has none — date `2026-05-18` in the screenshot showed the broken state). Confirm Night metrics now shows a visible muted em-dash in each of the four columns (Duration, HRV, Resting HR, Respiratory), with no floating unit text beside the dash.
4. Confirm date with detection (any prior night with sleep) still renders the large Fraunces numerals followed by the small mono unit (no regression on the populated path).

If anything is off, do not declare done. Capture the observation and report it for follow-up.

---

## Self-review (completed by plan author)

**1. Spec coverage:**
- Spec §"Width clamp (Approach A — single 1200px container)" → Task 1 ✓
- Spec §"`MetricChip` empty state" → Task 2 ✓
- Spec §"Masthead right-side cluster" → out of scope per spec; not a task ✓
- Spec §"Testing" — build verification + visual verification → Tasks 1.5, 2.3, 3.3 ✓
- Spec §"Rollout" — single push to main → Task 3 ✓

**2. Placeholder scan:** no TBDs, no "implement later", no "similar to Task N", no "add appropriate error handling". All code blocks show the actual replacement.

**3. Type consistency:** `MetricChip` props (`value`, `unit`, `decimalPlaces`) are unchanged; only the render output differs. No new types introduced. `NumberTicker` continues to receive `value` and `decimalPlaces` as before.

No issues found.
