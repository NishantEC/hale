# Tab Bar Redesign (M1) — Design Spec

## Goal

Replace the current full-width custom tab bar with a floating "pill + FAB" tab
bar (variant M1: neutral glass pill, solid-orange FAB, sliding active-chip
indicator), backed by smooth Reanimated v3 spring animations. The `+` button
is a non-route action that opens the journal-entry modal — no flicker, no
phantom routes.

## Why

The previous full-width custom bar (commit `86021b39`) was visually flat,
felt squeezed, and the `+` sat awkwardly as a fourth tab cell. Brainstorming
sessions converged on the M1 variant: a floating glass pill (Apple-system
feel) paired with a confident solid-orange FAB (clear primary action).
Animations sell the polish: a chip that slides between tabs, a FAB that
springs/pulses on press, and a `+` icon that rotates to `×` while the modal
is open.

NativeTabs was already ruled out earlier in the session: expo-router fires
tabPress with `canPreventDefault: false`, so a tab press cannot be
intercepted to open a modal. A custom bar is required, and once we own the
bar we can fully art-direct it.

## Architecture

One component, `AppTabBar`, mounted via the `tabBar` render prop on the
expo-router `<Tabs>` layout. Three route screens (`index`, `health`,
`settings`) — the `+` is *not* a route. The bar is positioned via
`tabBarStyle: { position: "absolute" }` so scenes scroll under the glass.

Animations driven by `react-native-reanimated` v3 shared values, derived
from the navigator's `state.index` (chip slide) and an
`expo-router`-derived `isJournalOpen` boolean (FAB rotate).

```
apps/app/app/components/AppTabBar/
├── AppTabBar.tsx           # top-level component, owns shared values
├── TabPill.tsx             # the glass pill (3 cells + sliding chip)
├── TabCell.tsx             # single cell with icon swap + scale
├── PlusFab.tsx             # the FAB with press, rotate, pulse
└── tokens.ts               # bar/pill/fab numeric constants
```

The existing single-file `AppTabBar.tsx` is split into four focused files
because the animation logic and styling are too much for one. Each file has
one job, well-defined props, and is independently testable.

## Layout

| Token             | Value                                  |
| ----------------- | -------------------------------------- |
| `BAR_MARGIN_X`    | 24                                     |
| `BAR_BOTTOM_GAP`  | 30 (above safe-area bottom)            |
| `PILL_FAB_GAP`    | 14                                     |
| `PILL_HEIGHT`     | 66                                     |
| `PILL_RADIUS`     | 33                                     |
| `PILL_PADDING`    | 5                                      |
| `FAB_SIZE`        | 66                                     |
| `CHIP_RADIUS`     | 28                                     |
| `ICON_SIZE`       | 24                                     |
| `LABEL_SIZE`      | 11 (weight 600)                        |

The pill takes `flex: 1`; the FAB is fixed-size on the right.

## Visual Treatment

### Glass pill (neutral)

- Background: `rgba(28,28,30,0.55)` in dark mode, `rgba(245,245,247,0.65)` in light mode
- Backdrop: `BlurView intensity={60}`, tint matches theme
- Border: 1px `rgba(255,255,255,0.10)` (dark) / `rgba(0,0,0,0.06)` (light)
- Inset top highlight: `0 1px 0 rgba(255,255,255,0.06) inset`
- Drop shadow: `0 16px 40px rgba(0,0,0,0.35)`

### Solid orange FAB

- Background: linear gradient `#d4754f → #C76542 → #9a4b30` at 140°
- Inset rim light: `0 1px 0 rgba(255,255,255,0.20) inset`
- Inset edge: `0 0 0 1px rgba(255,255,255,0.08) inset`
- Outer shadow: `0 12px 30px rgba(199,101,66,0.50)`
- Outer glow: `0 0 24px rgba(199,101,66,0.30)`

### Sliding active chip

A single absolutely-positioned `Animated.View` inside the pill. Width =
`(pillInnerWidth) / 3`, height = `PILL_HEIGHT - 2 * PILL_PADDING`. Background
`rgba(255,255,255,0.10)`, radius `CHIP_RADIUS`. Slides by `translateX`.

### Active-tab icon + label

- Outline + filled SVG icon both rendered, opacity cross-fades on focus (200ms)
- Icon scale `1.0 → 1.06` when active (spring, 240ms)
- Label color cross-fades `colors.textDim → colors.text` (200ms)

## Animations

All animations use `react-native-reanimated` v3 shared values + `withSpring`
or `withTiming`. The chosen spring config sits in `tokens.ts`:

```ts
export const SPRING_DEFAULT = { damping: 18, stiffness: 220, mass: 1 }
export const SPRING_PUNCHY  = { damping: 14, stiffness: 260, mass: 0.8 }
```

### A1 — Chip slide (tab change)

- Trigger: `state.index` changes
- Driver: shared value `chipX` (derived from `state.index * cellWidth`)
- Effect: chip `translateX` animates with `SPRING_DEFAULT`
- Duration: ~320ms, spring

### A2 — Icon swap + scale

- Trigger: a cell becomes active / inactive
- Driver: each cell owns a shared value `focus` (0 → 1) tied to `state.index === cellIndex`
- Effects:
  - `iconScale = interpolate(focus, [0, 1], [1, 1.06])` via `withSpring`
  - filled icon `opacity = focus`, outline icon `opacity = 1 - focus`, both `withTiming(200)`

### A3 — Cell press feedback

- Trigger: `onPressIn` / `onPressOut`
- Driver: per-cell `pressScale` shared value
- Effect: `transform: scale(pressScale)` springs to 0.92 on press, back to 1.0 on release

### A4 — FAB press + pulse

- Trigger: tap on FAB
- Drivers: `fabScale`, `pulseProgress`
- Effects:
  - `fabScale` springs to 0.92 then back to 1.0 (SPRING_PUNCHY)
  - `pulseProgress` runs `withTiming(1, { duration: 600 })` then resets:
    - a sibling `Animated.View` with 2pt orange border ring scales `0.85 → 1.15` and fades `0.8 → 0` driven by `pulseProgress`

### A5 — FAB rotate (open → close)

- Trigger: pathname change. `useSegments()` or `usePathname()` from expo-router; `isJournalOpen = path.includes("journal-entry")`
- Driver: shared value `openness` (0 → 1)
- Effect: plus icon `rotate` interpolated `0deg → 45deg` (SPRING_DEFAULT)

### A6 — Bar mount entry

- Trigger: mount
- Driver: shared value `mounted` (0 → 1) animated on mount via `withDelay(80, withSpring(1, SPRING_DEFAULT))`
- Effects: bar `translateY` interpolated `40 → 0`, `opacity` interpolated `0 → 1`

## Wiring

### Routes

`apps/app/src/app/(app)/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router"
import { AppTabBar } from "@/components/AppTabBar/AppTabBar"
import { useColorMode } from "@/context/ThemeContext"

export default function TabsLayout() {
  useColorMode()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: "absolute" },
      }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="settings" />
    </Tabs>
  )
}
```

### Tab press

A tab press emits `tabPress` with `canPreventDefault: true` (default for the
JS bottom-tab navigator). If not prevented, `navigation.navigate(route.name)`.
This is what `AppTabBar` already does; preserved exactly.

### + press

`router.push("/journal-entry")` directly. The journal-entry screen is an
existing modal-presented stack screen at
`apps/app/src/app/(app)/journal-entry.tsx`. When it's pushed, the FAB
rotation triggers via the pathname listener.

## Theme

Both light and dark modes are first-class. All colors source from
`LOCAL_THEME.colors`. Specifically these tokens (some already exist, some
need to be added):

| Token              | Dark                      | Light                     |
| ------------------ | ------------------------- | ------------------------- |
| `tabPillBg`        | `rgba(28,28,30,0.55)`     | `rgba(245,245,247,0.65)`  |
| `tabPillBorder`    | `rgba(255,255,255,0.10)`  | `rgba(0,0,0,0.06)`        |
| `tabChipBg`        | `rgba(255,255,255,0.10)`  | `rgba(0,0,0,0.08)`        |
| `tint` (existing)  | `#C76542`                 | `#C76542`                 |

The FAB gradient is the same in both modes (brand orange is brand orange).

## Accessibility

- Each tab cell has `accessibilityRole="button"`, `accessibilityLabel` = tab name, `accessibilityState={ selected: focused }`
- The FAB has `accessibilityRole="button"`, `accessibilityLabel="Log a journal entry"`
- Press feedback respects `prefers-reduced-motion` via Reanimated's
  `useReducedMotion()` — when enabled, all springs become instant transitions
  and the pulse halo doesn't render
- `hitSlop={8}` on every Pressable

## Testing

Unit tests with Jest + React Native Testing Library:

1. `AppTabBar.test.tsx` — renders 3 cells + 1 FAB; tapping a cell calls `navigation.navigate(name)`; tapping the FAB calls `router.push("/journal-entry")`; chip translateX derives from `state.index`
2. `TabCell.test.tsx` — outline icon visible when inactive, filled icon visible when active; `accessibilityState.selected` reflects focus
3. `PlusFab.test.tsx` — rotation shared value transitions on `isOpen` flip; halo ring renders on press; reduced-motion skips the halo

No tests for the actual animation timings (we trust Reanimated); we test the
*driving inputs* and the visible accessibility/structure outcomes.

## Non-goals

- iOS 26 liquid glass via `@callstack/liquid-glass` — postpone; ship with
  `expo-blur` first, swap later if motivated
- Auto-collapse on scroll — postpone; needs a shared scrollY context and is
  an independent design decision
- Long-press / haptic feedback on FAB — not in scope
- Tab badges (notification dots) — not in scope

## Migration

The current `AppTabBar.tsx` (the flat full-width bar with 4 cells including
`+`) gets replaced. No other files change: route names stay (`index`,
`health`, `settings`), no `journal` tab is added back, no screens are
modified. Existing screen `paddingBottom` values (100–132pt) already
accommodate a floating bar of this size + safe-area.

The journal `+` button on HomeScreen has already been removed (commit
`86021b39`). Nothing to revert.
