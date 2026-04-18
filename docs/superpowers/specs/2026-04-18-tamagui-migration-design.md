# Tamagui Migration Design

**Date:** 2026-04-18
**Goal:** Replace the Ignite-derived theme + primitive component layer with Tamagui, in a single big-bang migration. Use Tamagui's stock themes and fonts with zero product overrides. Keep Skia-based charts untouched. Delete unused Ignite demo screens.

---

## Overview

Today the app uses an Ignite template scaffold: a handwritten theme system (`app/theme/{colors,colorsDark,spacing,spacingDark,typography,timing,styles,theme}.ts`) and primitive components (`Text`, `Screen`, `Card`, `Button`, `Icon`, `TextField`, `ListItem`, `Toggle`, `Header`) that consume it. Every screen imports these directly.

This migration moves the entire surface to Tamagui in one cut:

- Adopt `tamagui` with its stock `light` / `dark` themes and default font config. No product-specific token overrides.
- Replace every Ignite primitive with Tamagui equivalents (`<YStack>`, `<XStack>`, `<Stack>`, `<Text>`, `<Button>`, `<Card>`, `<Input>`, `<Switch>`, etc.).
- Restyle every product screen against Tamagui.
- Rewrite domain UI components (`GlassCard`, `StatusPill`, `DetailScreenHeader`, `MetricRing`'s wrapper) on Tamagui primitives. Keep their public APIs stable.
- Delete unused Ignite demo screens (`DemoCommunityScreen`, `DemoDebugScreen`, `DemoPodcastListScreen`, `DemoShowroomScreen/`, `ErrorScreen/`).
- Leave Skia-based chart components (`BarSeriesChart`, `InlineLineChart`, `HypnogramChart`, `SleepHeartRateChart`) untouched — canvas rendering doesn't benefit from Tamagui.

Motivation (confirmed in brainstorming): performance (compile-time style extraction), design-system rigor (typed tokens), and DX (JSX style props). All three at once; treated as a foundational platform move.

---

## Section 1: Library Choices

| Concern | Pick |
|---|---|
| Core library | `tamagui` (batteries-included — ships `<YStack>`, `<Button>`, `<Sheet>`, `<Dialog>`, `<Input>`, `<Switch>`, etc.) |
| Themes | `@tamagui/themes` stock `light` + `dark`. **No overrides.** |
| Fonts | Tamagui default font config. **No product fonts.** `@expo-google-fonts/space-grotesk` is removed from dependencies. |
| Compiler | `@tamagui/babel-plugin` enabled in `babel.config.js`. Required to realize the performance benefit; runs flat-style extraction at build time. |
| Icons | Keep `@expo/vector-icons` (used today), used directly from JSX. Tamagui plays fine with it. |
| Navigation theme | Thin adapter in `app/navigators/` that feeds Tamagui's active theme object into `@react-navigation/native`'s `ThemeProvider` so nav/tab bar colors track the app theme. |

**Not chosen:**
- `@tamagui/core` alone — loses the batteries; we'd have to bring our own `<Button>`, etc.
- Custom font/token overrides — explicitly out per brainstorming decision.
- Leaving the Babel plugin disabled — defeats one of the three stated reasons for this move.

---

## Section 2: What Changes, What Stays

### Deleted

- `app/theme/` entire directory (colors, colorsDark, spacing, spacingDark, typography, timing, styles, theme, context, types, and all their imports)
- `app/components/Text.tsx`
- `app/components/Screen.tsx`
- `app/components/Card.tsx`
- `app/components/Button.tsx`
- `app/components/Icon.tsx`
- `app/components/TextField.tsx`
- `app/components/ListItem.tsx`
- `app/components/Header.tsx`
- `app/components/Toggle/` (Switch, Radio, Checkbox wrappers)
- `app/components/EmptyState.tsx`
- `app/components/AutoImage.tsx`
- `app/components/Text.test.tsx`
- `app/screens/DemoCommunityScreen.tsx`
- `app/screens/DemoDebugScreen.tsx`
- `app/screens/DemoPodcastListScreen.tsx`
- `app/screens/DemoShowroomScreen/` (entire directory)
- `app/screens/ErrorScreen/`
- `@expo-google-fonts/space-grotesk` dependency
- Any `app/i18n/` / font-loader wiring tied to Space Grotesk (if present)

### Added

- `tamagui` + `@tamagui/themes` + `@tamagui/babel-plugin` dependencies
- `app/tamagui.config.ts` — single-line re-export of stock themes + default config
- `app/app.tsx` top-level `<TamaguiProvider config={...} defaultTheme="dark">` wrapper
- `@tamagui/babel-plugin` entry in `babel.config.js`
- Navigation theme adapter: `app/navigators/useNavigationTheme.ts`

### Rewritten (public API preserved where it exists)

- `app/components/GlassCard.tsx` — internals switch to Tamagui primitives; continues wrapping `expo-glass-effect` / `expo-blur`. Props unchanged.
- `app/components/StatusPill.tsx` — Tamagui internals. Props unchanged.
- `app/components/DetailScreenHeader.tsx` — Tamagui internals. Props unchanged.
- `app/components/MetricRing.tsx` — Skia canvas stays; only the surrounding label/container switches to Tamagui. Props unchanged.

### Untouched

- `app/components/BarSeriesChart.tsx`
- `app/components/InlineLineChart.tsx`
- `app/components/HypnogramChart.tsx`
- `app/components/SleepHeartRateChart.tsx`
- `app/components/reactx/` (whatever that contains)
- All BLE / decoder / service / store code
- All `app/services/` (API, BLE, storage)
- All navigators (shape unchanged; only theme wiring adjusted)

### Screens restyled (all of them)

Every file in `app/screens/` that isn't a deletion target: `HomeScreen`, `HomeDetailsScreen`, `HomeMetricScreen`, `HomeScreen.utils.ts` (probably untouched — it's utils), `SleepDetailScreen`, `SleepPlannerScreen`, `TrendsScreen`, `DeviceScreen`, `DeviceSettingsScreen`, `JournalEntryScreen`, `JournalHistoryScreen`, `LoginScreen`, `WelcomeScreen`, `StrainActivityScreen`, `DebugInspectorScreen`.

Restyling means: replace imported Ignite primitives with Tamagui primitives, replace `StyleSheet.create(...)` objects with Tamagui style props / inline tokens, delete any `useAppTheme` / Ignite theme consumers.

---

## Section 3: Migration Plan — One Cut, One PR

Big-bang per brainstorming. The change happens on a dedicated branch, lands as one PR (or a tight back-to-back series if PR size forces it — but functionally atomic; no "half-migrated" state ever shipped).

**Branch:** `feat/tamagui-migration`

**Order of work on the branch** (each step keeps the branch buildable):

1. **Install deps, wire providers.** Add `tamagui`, `@tamagui/themes`, `@tamagui/babel-plugin`. Write `tamagui.config.ts`. Wrap `app.tsx` in `<TamaguiProvider>`. Add Babel plugin. At this point Tamagui is loaded but unused; the app still runs on Ignite. Verify `npx expo start` + `expo run:ios` succeed.
2. **Delete demo screens + ErrorScreen.** Remove files. Remove any route references in navigators. `tsc --noEmit` must pass.
3. **Rewrite domain UI components.** `GlassCard`, `StatusPill`, `DetailScreenHeader`, `MetricRing` wrapper. Keep props identical; screens keep working because Ignite primitives still exist.
4. **Restyle screens.** One pass through `app/screens/`. Each screen's Ignite imports → Tamagui imports; `StyleSheet.create` → Tamagui style props. Adapt navigation theme.
5. **Delete Ignite primitives.** `Text`, `Screen`, `Card`, `Button`, `Icon`, `TextField`, `ListItem`, `Header`, `Toggle/`, `EmptyState`, `AutoImage`. `tsc --noEmit` must now pass — no screen still imports them.
6. **Delete theme directory.** `app/theme/` gone. Remove `@expo-google-fonts/space-grotesk` from `package.json`. Any leftover imports caught by `tsc`.
7. **Regression sweep.** Run the app in iOS + Android simulators. Visit every screen. Verify no runtime errors, no missing icons, no unreadable text, no broken layouts. Capture screenshots for PR description.

The PR is mechanical in the middle (step 4 is the bulk) and the buildable-at-every-step ordering means any reviewer can `git checkout` mid-stack and smoke-test.

---

## Section 4: Theme & Dark Mode

- Use `@tamagui/themes`' stock `dark` theme as the app default (matches the current visual tone: deep neutrals, colored accents).
- `<TamaguiProvider config={config} defaultTheme="dark">` in `app.tsx`.
- A settings toggle for light/dark can be added later via Tamagui's `Theme` component — out of scope for this migration.
- No sub-themes, no product-specific token overrides. If a screen needs a specific color that isn't in Tamagui's scale (e.g., the ring colors for sleep/recovery/strain), use hex inline at the usage site. These are three sites total; a proper token is premature.

---

## Section 5: Testing

- **Static:** `tsc --noEmit` must pass after each step of §3. The type system catches every Ignite import left over.
- **Runtime:** manual regression sweep on iOS simulator and one Android device/emulator at PR time. Every screen visited once. Every interactive element tapped once.
- **Visual:** before/after screenshots of each non-demo screen attached to the PR description. No pixel-perfect assertion — this is a platform migration, not a pixel refactor.
- **Jest:** existing snapshot tests will break (they reference Ignite components). Update or delete snapshots as part of the migration. The `Text.test.tsx` file goes with the `Text.tsx` deletion.
- **BLE smoke test:** with the app running on the simulator, connect to a WHOOP strap and verify ingestion still works end-to-end. Confirms no accidental damage to service-layer wiring.

---

## Section 6: Open Questions (resolve during implementation)

1. **Space Grotesk removal affects brand feel.** Stock Tamagui uses its default font. If the change reads as a regression when the PR lands, the fix is a 1-line font config override — not worth pre-solving.
2. **`expo-glass-effect` inside `GlassCard` under a Tamagui parent.** Expected to work (both render into standard RN view hierarchy) but must be verified on-device during step 3. If it doesn't, `GlassCard` stays as a plain RN wrapper around `expo-glass-effect` with Tamagui only outside it.
3. **Reanimated compatibility.** Tamagui's animation driver can be backed by Reanimated (`@tamagui/animations-moti` or `@tamagui/animations-react-native`). Pick `react-native` by default (simpler); switch to Moti/Reanimated only if animations look laggy.
4. **Babel plugin vs Metro caches.** After enabling the plugin, a `npx expo start --clear` will be required. Document in PR.
5. **Bundle size.** Tamagui adds ~100–150KB gzipped after tree-shaking. Acceptable given it replaces the ~80KB theme + primitive layer. Net ~+70KB. Track.

---

## Section 7: Non-Goals

- Porting Ignite's palette or typography into Tamagui. Explicitly out (per brainstorming).
- Redesigning any screen's layout, hierarchy, or visual language. This is a platform migration, not a UX pass.
- Adding light-mode theme switching UI.
- Migrating Skia charts to any Tamagui-adjacent chart library.
- Replacing `react-navigation`. Navigation stays exactly as-is; only its theme adapter changes.
- Replacing `victory-native` (already used for chart axes/scales).
- Coordinating with the local-SQLite-mirror spec. That work touches `app/services/` — this work touches `app/components/` + `app/screens/`. Zero file overlap; the two branches can progress independently and merge in either order.

---

## Interaction With the SQLite Mirror Spec

These two efforts are intentionally file-disjoint:

- SQLite spec touches: `app/services/db/*`, `app/services/sync/*`, `app/services/api/noopClient.ts`, BLE ingestion hooks, screen data-fetch calls (swap `fetch*View(...)` for repository reads).
- Tamagui spec touches: `app/components/*`, `app/theme/*` (deleted), `app/screens/*` (restyled), `app/tamagui.config.ts`, `app/app.tsx` provider wiring, `babel.config.js`, `package.json` deps.

Only `app/screens/*` is touched by both, and in orthogonal ways (one changes data-fetch calls, the other changes JSX + style props). Whichever merges first takes the merge conflict tax — trivial either way. Neither blocks the other.
