# Inspector layout fixes — design

**Date:** 2026-05-19
**Status:** Approved (approach A)

## Problem

After the Field Manual rebuild landed, the inspector renders edge-to-edge on wide screens (e.g. 2000px Mac display). Reported issues from screenshot review:

1. The whole dashboard (masthead, tab strip, status row, sections, sync trail) stretches the full viewport width. Status badges and section rules feel sprawled and disconnected.
2. **Night metrics empty value**: when a date has no sleep detection, the big serif em-dash placeholder in `MetricChip` renders so thin it's invisible. The eyebrow ("DURATION") and unit ("h") appear stranded with a void between them, looking like a layout bug.
3. (Implied) The masthead's right-side action cluster is dense at any width — eight items packed into the right rail.

## Goals

- Constrain the entire dashboard chrome and content to a single max width.
- Give the inspector a printed-page feel — fixed measure regardless of viewport.
- Restore a coherent empty state in `MetricChip` so days without data don't look broken.
- Preserve all existing functionality (sticky masthead, keyboard shortcuts, drag-reorder, etc.).

## Non-goals

- No font, palette, or typography changes — the Field Manual aesthetic stays.
- No restructuring of any tab's information architecture.
- No mobile/responsive overhaul. The inspector remains a desktop tool.
- No new components.

## Design

### 1. Width clamp (Approach A — single 1200px container)

**Decision:** wrap each piece of the shell in its own `max-w-[1200px] mx-auto` container, so both the masthead and the content column share the same measure but stay independent.

**Implementation:**

- `Masthead.tsx` — change the outermost `<header>` so the visible band is centered and clamped:
  ```tsx
  <header className="bg-paper sticky top-0 z-30 shrink-0 rule-hair-b max-w-[1200px] mx-auto w-full">
    {/* row 1 — masthead */}
    {/* row 2 — tab strip */}
  </header>
  ```
  Sticky positioning still works inside a centered, max-width container. The `bg-paper` background covers the masthead band; outside the 1200px column the page background (also paper) is visible. The bottom hairline ends at the 1200px boundary on both sides — that's the intended look.

- `Inspector.tsx` — the content area is already `max-w-[1200px] mx-auto w-full`; no change needed:
  ```tsx
  <main className="flex-1">
    <div className="px-12 py-8 max-w-[1200px] mx-auto w-full">…</div>
  </main>
  ```

**Padding adjustments:** masthead currently uses `px-6` (24px), content uses `px-12` (48px). At 1200px max, keep `px-12` on content (=> 1104px effective measure for body), and bump masthead to `px-12` so both align flush on the left and right edges. The Inspector heading, tab strip, and content rules will then line up vertically.

**Tab strip:** sits inside `<Masthead>` so it inherits the same max-width. No separate change required.

### 2. `MetricChip` empty state

**Decision:** when `value == null`, render a muted em-dash that is actually visible. Use `font-mono` (not `font-display-tight`) at a moderate size so the dash glyph is a clear stroke instead of a hairline.

**Before:**
```tsx
{value == null ? (
  <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">—</p>
) : (
  <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
    <NumberTicker value={value} decimalPlaces={decimalPlaces} />
  </p>
)}
```

**After:**
```tsx
{value == null ? (
  <p className="font-mono text-[1.75rem] leading-none text-muted-foreground/60 tabular-nums">
    —
  </p>
) : (
  <p className="font-display-tight text-[2.5rem] leading-none tabular-nums">
    <NumberTicker value={value} decimalPlaces={decimalPlaces} />
  </p>
)}
```

The unit (`h` / `ms` / `bpm` / `rpm`) is hidden when the value is null — it has no meaning without a number, and showing it floating next to an invisible dash is what makes the layout look broken.

**Implementation:** wrap the unit render in `value != null && unit && ...` so it only appears alongside a real value.

### 3. Masthead right-side cluster

The 8-item cluster (`pipeline · live · refreshed-at · refresh · theme · run · seed · logout`) is acceptable inside a 1200px column on screens ≥1280px wide. With the width clamp in place, no structural change is needed for now. If it still feels dense after deploy, fold seed + logout into an overflow menu in a follow-up — keep that out of scope here.

## Architecture / files touched

- `apps/inspector/src/shell/Masthead.tsx` — add `max-w-[1200px] mx-auto w-full` to the `<header>`, change `px-6` to `px-12` to match content padding.
- `apps/inspector/src/components/MetricChip.tsx` — change null-value placeholder rendering; hide unit when value is null.

No other files change.

## Risks

- **Sticky behavior in centered container**: `position: sticky` works within max-width centered containers in all modern browsers (Chrome, Safari, Firefox). Confirmed compatible.
- **Tab strip alignment**: tab strip lives inside `<Masthead>`, so it inherits the clamp automatically. Verified by code reading.
- **Paper grain seam at edges**: the body `::before` SVG noise overlay is fixed to viewport. Inside the 1200px column the grain shows; outside the column the same grain continues. No visible seam at the column boundary.

## Testing

- Visual: load `noop.enform.co` on a wide screen (≥1600px). Confirm content sits centered, max 1200px wide. Bottom rule under masthead ends at the same edges as the body content rules below.
- Visual: load the dashboard on a date with no sleep detection (existing scenario from the screenshot). Confirm Night metrics shows a visible muted em-dash in each column with no floating units.
- Functional: confirm sticky masthead still sticks on scroll. Confirm date picker, tab switching, refresh, run-pipeline menu, theme toggle still work.
- Build: `pnpm exec tsc -b && pnpm exec vite build` passes (CI uses `tsc -b` with `noUnusedLocals` so this is the right check, not `tsc --noEmit`).

## Rollout

Single commit, ship via the existing GitHub Actions → Cloud Run pipeline.
