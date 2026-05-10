# Tab Bar Redesign (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat custom tab bar with a floating glass pill + solid-orange FAB tab bar with Reanimated v3 spring animations.

**Architecture:** One `AppTabBar` component split into four focused files (`AppTabBar`, `TabPill`, `TabCell`, `PlusFab`) plus a `tokens.ts` and a tiny `pathUtils.ts`. Routes stay at three (`index`, `health`, `settings`); the `+` is a non-route action that calls `router.push("/journal-entry")` directly. Mounted via the `tabBar` render prop on expo-router's `<Tabs>`.

**Tech Stack:** React Native, expo-router 4 (JS `<Tabs>`), `@react-navigation/bottom-tabs`, react-native-reanimated v4, expo-blur, react-native-safe-area-context, Ionicons.

**Spec:** `docs/superpowers/specs/2026-05-11-tab-bar-redesign-design.md`

**Testing strategy:** Project uses Jest + `jest-expo` for logic tests; there is no `@testing-library/react-native` in the repo and Reanimated component tests would require non-trivial mock setup. We TDD the one pure logic piece (`pathUtils.isJournalEntryPath`) and rely on TypeScript + manual visual verification for the animated components. This matches the project's existing testing style (utils have tests; UI components don't).

---

## File Structure

Files to create / modify / delete:

- **Create:** `apps/app/app/components/AppTabBar/tokens.ts` — layout sizes & spring configs (constants only)
- **Create:** `apps/app/app/components/AppTabBar/pathUtils.ts` — `isJournalEntryPath(pathname)` helper
- **Create:** `apps/app/app/components/AppTabBar/pathUtils.test.ts` — Jest test (the only TDD test)
- **Create:** `apps/app/app/components/AppTabBar/TabCell.tsx` — single cell: icon swap + scale + press feedback
- **Create:** `apps/app/app/components/AppTabBar/PlusFab.tsx` — FAB: press scale, rotate to ×, pulse halo
- **Create:** `apps/app/app/components/AppTabBar/TabPill.tsx` — glass pill: 3 cells + sliding chip (owns chip shared value)
- **Create:** `apps/app/app/components/AppTabBar/AppTabBar.tsx` — orchestrator: bar wrapper, mount entry, wires navigator props
- **Create:** `apps/app/app/components/AppTabBar/index.ts` — barrel re-export (`export { AppTabBar } from "./AppTabBar"`)
- **Modify:** `apps/app/app/utils/localTheme.ts` — add `tabPillBg`, `tabPillBorder`, `tabChipBg` tokens to both `LIGHT_COLORS` and `DARK_COLORS`
- **Delete:** `apps/app/app/components/AppTabBar.tsx` (old single-file flat bar)

The layout file `apps/app/src/app/(app)/(tabs)/_layout.tsx` imports `@/components/AppTabBar`, which resolves to the new folder's `index.ts` once the old single file is deleted. **The old file must remain in place until the very last task** so that intermediate commits typecheck and run.

---

## Task 1: Constants — sizes & spring configs

**Files:**
- Create: `apps/app/app/components/AppTabBar/tokens.ts`

- [ ] **Step 1: Create the tokens file**

```ts
// apps/app/app/components/AppTabBar/tokens.ts
import type { WithSpringConfig } from "react-native-reanimated"

export const BAR_MARGIN_X = 24
export const BAR_BOTTOM_GAP = 30
export const PILL_FAB_GAP = 14
export const PILL_HEIGHT = 66
export const PILL_RADIUS = 33
export const PILL_PADDING = 5
export const FAB_SIZE = 66
export const CHIP_RADIUS = 28
export const ICON_SIZE = 24
export const LABEL_SIZE = 11

export const SPRING_DEFAULT: WithSpringConfig = {
  damping: 18,
  stiffness: 220,
  mass: 1,
}

export const SPRING_PUNCHY: WithSpringConfig = {
  damping: 14,
  stiffness: 260,
  mass: 0.8,
}

export const PULSE_DURATION_MS = 600
export const MOUNT_DELAY_MS = 80
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/AppTabBar/tokens.ts
git commit -m "feat(tab-bar): add tokens for new floating tab bar"
```

---

## Task 2: Theme tokens — pill + chip backgrounds

**Files:**
- Modify: `apps/app/app/utils/localTheme.ts` — add three new color tokens to both palettes

- [ ] **Step 1: Add `tabPillBg`, `tabPillBorder`, `tabChipBg` to `LIGHT_COLORS`**

In `apps/app/app/utils/localTheme.ts`, find the `LIGHT_COLORS` object (starts at line 7) and add these three keys right after `tabBarBlur`:

```ts
  tabPillBg: "rgba(245,245,247,0.65)",
  tabPillBorder: "rgba(0,0,0,0.06)",
  tabChipBg: "rgba(0,0,0,0.08)",
```

- [ ] **Step 2: Add the same three keys to `DARK_COLORS`**

In the same file, find the `DARK_COLORS` object and add right after its `tabBarBlur`:

```ts
  tabPillBg: "rgba(28,28,30,0.55)",
  tabPillBorder: "rgba(255,255,255,0.10)",
  tabChipBg: "rgba(255,255,255,0.10)",
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0. `DARK_COLORS` is typed as `typeof LIGHT_COLORS`, so adding a key to only one would have failed.

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/utils/localTheme.ts
git commit -m "feat(theme): add tabPillBg/tabPillBorder/tabChipBg tokens"
```

---

## Task 3: `pathUtils.isJournalEntryPath` (TDD)

**Files:**
- Create: `apps/app/app/components/AppTabBar/pathUtils.ts`
- Create: `apps/app/app/components/AppTabBar/pathUtils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/app/app/components/AppTabBar/pathUtils.test.ts
import { isJournalEntryPath } from "./pathUtils"

describe("isJournalEntryPath", () => {
  it("matches the bare journal-entry route", () => {
    expect(isJournalEntryPath("/journal-entry")).toBe(true)
  })

  it("matches journal-entry with a trailing param segment", () => {
    expect(isJournalEntryPath("/journal-entry/123")).toBe(true)
  })

  it("does not match journal-history", () => {
    expect(isJournalEntryPath("/journal-history")).toBe(false)
  })

  it("does not match the home tab", () => {
    expect(isJournalEntryPath("/")).toBe(false)
  })

  it("does not match a partial prefix match", () => {
    expect(isJournalEntryPath("/journal-entry-list")).toBe(false)
  })

  it("treats null / undefined / empty as false", () => {
    expect(isJournalEntryPath(null)).toBe(false)
    expect(isJournalEntryPath(undefined)).toBe(false)
    expect(isJournalEntryPath("")).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/app && pnpm jest app/components/AppTabBar/pathUtils.test.ts`
Expected: FAIL with `Cannot find module './pathUtils'`.

- [ ] **Step 3: Implement the helper**

```ts
// apps/app/app/components/AppTabBar/pathUtils.ts
export function isJournalEntryPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (pathname === "/journal-entry") return true
  if (pathname.startsWith("/journal-entry/")) return true
  return false
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/app && pnpm jest app/components/AppTabBar/pathUtils.test.ts`
Expected: PASS, 6 assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/AppTabBar/pathUtils.ts apps/app/app/components/AppTabBar/pathUtils.test.ts
git commit -m "feat(tab-bar): pathUtils.isJournalEntryPath helper"
```

---

## Task 4: `TabCell` — single cell with icon swap + scale + press feedback

**Files:**
- Create: `apps/app/app/components/AppTabBar/TabCell.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/app/app/components/AppTabBar/TabCell.tsx
import { useEffect } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Ionicons from "@expo/vector-icons/Ionicons"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import { ICON_SIZE, LABEL_SIZE, SPRING_DEFAULT, SPRING_PUNCHY } from "./tokens"

export type TabCellProps = {
  label: string
  iconOutline: keyof typeof Ionicons.glyphMap
  iconFilled: keyof typeof Ionicons.glyphMap
  focused: boolean
  onPress: () => void
}

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons)

export function TabCell({ label, iconOutline, iconFilled, focused, onPress }: TabCellProps) {
  const colors = LOCAL_THEME.colors
  const reduced = useReducedMotion()

  const focus = useDerivedValue(() => {
    return reduced ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, SPRING_DEFAULT)
  }, [focused, reduced])

  const press = useSharedValue(1)
  const onPressIn = () => {
    press.value = reduced ? 0.92 : withSpring(0.92, SPRING_PUNCHY)
  }
  const onPressOut = () => {
    press.value = reduced ? 1 : withSpring(1, SPRING_PUNCHY)
  }

  const iconStackStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(focus.value, [0, 1], [1, 1.06]) * press.value },
    ],
  }))
  const fillStyle = useAnimatedStyle(() => ({ opacity: focus.value }))
  const lineStyle = useAnimatedStyle(() => ({ opacity: 1 - focus.value }))

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : undefined}
      style={styles.cell}
    >
      <Animated.View style={[styles.iconStack, iconStackStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconWrap, lineStyle]}>
          <Ionicons name={iconOutline} size={ICON_SIZE} color={focused ? colors.text : colors.textDim} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconWrap, fillStyle]}>
          <Ionicons name={iconFilled} size={ICON_SIZE} color={colors.text} />
        </Animated.View>
      </Animated.View>
      <Text
        text={label}
        style={[
          styles.label,
          { fontSize: LABEL_SIZE, color: focused ? colors.text : colors.textDim },
        ]}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cell: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingVertical: 6,
  },
  iconStack: {
    height: ICON_SIZE,
    width: ICON_SIZE,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "600",
    marginTop: 4,
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/AppTabBar/TabCell.tsx
git commit -m "feat(tab-bar): TabCell — icon swap + scale + press feedback"
```

---

## Task 5: `PlusFab` — scale, rotate, pulse halo

**Files:**
- Create: `apps/app/app/components/AppTabBar/PlusFab.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/app/app/components/AppTabBar/PlusFab.tsx
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Ionicons from "@expo/vector-icons/Ionicons"

import { LOCAL_THEME } from "@/utils/localTheme"

import { FAB_SIZE, PULSE_DURATION_MS, SPRING_DEFAULT, SPRING_PUNCHY } from "./tokens"

export type PlusFabProps = {
  isOpen: boolean
  onPress: () => void
}

const HALO_INSET = -10

export function PlusFab({ isOpen, onPress }: PlusFabProps) {
  const colors = LOCAL_THEME.colors
  const reduced = useReducedMotion()

  const scale = useSharedValue(1)
  const pulse = useSharedValue(0)

  const openness = useDerivedValue(() => {
    return reduced ? (isOpen ? 1 : 0) : withSpring(isOpen ? 1 : 0, SPRING_DEFAULT)
  }, [isOpen, reduced])

  const onPressIn = () => {
    scale.value = reduced ? 0.92 : withSpring(0.92, SPRING_PUNCHY)
  }
  const onPressOut = () => {
    scale.value = reduced ? 1 : withSpring(1, SPRING_PUNCHY)
  }

  const triggerPress = () => {
    if (!reduced) {
      pulse.value = 0
      pulse.value = withTiming(1, { duration: PULSE_DURATION_MS })
    }
    onPress()
  }

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(openness.value, [0, 1], [0, 45])}deg` }],
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.8, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.15]) }],
  }))

  return (
    <Animated.View style={[styles.wrap, fabStyle]}>
      {!reduced && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            { borderColor: colors.tint },
            haloStyle,
          ]}
        />
      )}
      <Pressable
        onPress={triggerPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Log a journal entry"
        style={styles.button}
      >
        <LinearOrangeBackground />
        <Animated.View style={iconStyle}>
          <Ionicons name="add" size={26} color={colors.onPrimary} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

function LinearOrangeBackground() {
  // Plain View with a solid orange fallback. A future task can swap this for
  // a real gradient via `expo-linear-gradient` once we add the dep — solid
  // ships fine and matches the M1 spec's intent.
  const colors = LOCAL_THEME.colors
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.gradientFallback, { backgroundColor: colors.tint }]}
    />
  )
}

const styles = StyleSheet.create({
  wrap: {
    height: FAB_SIZE,
    width: FAB_SIZE,
  },
  halo: {
    borderRadius: FAB_SIZE,
    borderWidth: 2,
    bottom: HALO_INSET,
    left: HALO_INSET,
    position: "absolute",
    right: HALO_INSET,
    top: HALO_INSET,
  },
  button: {
    alignItems: "center",
    borderRadius: FAB_SIZE / 2,
    height: FAB_SIZE,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#C76542",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    width: FAB_SIZE,
  },
  gradientFallback: {
    borderRadius: FAB_SIZE / 2,
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/AppTabBar/PlusFab.tsx
git commit -m "feat(tab-bar): PlusFab — press scale, rotate to x, pulse halo"
```

---

## Task 6: `TabPill` — pill with 3 cells + sliding chip

**Files:**
- Create: `apps/app/app/components/AppTabBar/TabPill.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/app/app/components/AppTabBar/TabPill.tsx
import { useEffect, useState } from "react"
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import { BlurView } from "expo-blur"
import Ionicons from "@expo/vector-icons/Ionicons"

import { LOCAL_THEME } from "@/utils/localTheme"

import { TabCell } from "./TabCell"
import {
  CHIP_RADIUS,
  PILL_HEIGHT,
  PILL_PADDING,
  PILL_RADIUS,
  SPRING_DEFAULT,
} from "./tokens"

export type PillRoute = {
  key: string
  label: string
  iconOutline: keyof typeof Ionicons.glyphMap
  iconFilled: keyof typeof Ionicons.glyphMap
}

export type TabPillProps = {
  routes: PillRoute[]
  focusedIndex: number
  onSelect: (index: number) => void
}

export function TabPill({ routes, focusedIndex, onSelect }: TabPillProps) {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark
  const reduced = useReducedMotion()

  const [pillWidth, setPillWidth] = useState(0)
  const cellWidth = pillWidth > 0 ? (pillWidth - 2 * PILL_PADDING) / routes.length : 0

  const chipX = useSharedValue(0)

  useEffect(() => {
    const target = focusedIndex * cellWidth
    chipX.value = reduced ? target : withSpring(target, SPRING_DEFAULT)
  }, [focusedIndex, cellWidth, reduced])

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chipX.value }],
    width: cellWidth,
  }))

  const onLayout = (e: LayoutChangeEvent) => {
    setPillWidth(e.nativeEvent.layout.width)
  }

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.tabPillBg,
          borderColor: colors.tabPillBorder,
        },
      ]}
      onLayout={onLayout}
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 0}
        tint={isDark ? "dark" : "light"}
        style={[StyleSheet.absoluteFill, { borderRadius: PILL_RADIUS }]}
      />
      {cellWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chip,
            { backgroundColor: colors.tabChipBg },
            chipStyle,
          ]}
        />
      )}
      <View style={styles.row}>
        {routes.map((r, i) => (
          <TabCell
            key={r.key}
            label={r.label}
            iconOutline={r.iconOutline}
            iconFilled={r.iconFilled}
            focused={i === focusedIndex}
            onPress={() => onSelect(i)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    flex: 1,
    height: PILL_HEIGHT,
    overflow: "hidden",
    padding: PILL_PADDING,
    position: "relative",
  },
  chip: {
    borderRadius: CHIP_RADIUS,
    bottom: PILL_PADDING,
    left: PILL_PADDING,
    position: "absolute",
    top: PILL_PADDING,
  },
  row: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/AppTabBar/TabPill.tsx
git commit -m "feat(tab-bar): TabPill — 3 cells + sliding chip on layout-measured width"
```

---

## Task 7: `AppTabBar` orchestrator + barrel re-export

**Files:**
- Create: `apps/app/app/components/AppTabBar/AppTabBar.tsx`
- Create: `apps/app/app/components/AppTabBar/index.ts`

> Note: `index.ts` will collide with `apps/app/app/components/AppTabBar.tsx` (the old file). Create the new orchestrator at `AppTabBar/AppTabBar.tsx` in this task, but **do not create `index.ts` yet** — that lives in Task 8 along with the deletion of the old file, atomically.

- [ ] **Step 1: Create `AppTabBar.tsx` inside the folder**

```tsx
// apps/app/app/components/AppTabBar/AppTabBar.tsx
import { useEffect, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { router, usePathname } from "expo-router"

import { isJournalEntryPath } from "./pathUtils"
import { PlusFab } from "./PlusFab"
import { TabPill, type PillRoute } from "./TabPill"
import {
  BAR_BOTTOM_GAP,
  BAR_MARGIN_X,
  MOUNT_DELAY_MS,
  PILL_FAB_GAP,
  SPRING_DEFAULT,
} from "./tokens"

const ROUTES: PillRoute[] = [
  { key: "index", label: "Home", iconOutline: "home-outline", iconFilled: "home" },
  { key: "health", label: "Health", iconOutline: "pulse-outline", iconFilled: "pulse" },
  { key: "settings", label: "Settings", iconOutline: "settings-outline", iconFilled: "settings" },
]

export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const reduced = useReducedMotion()
  const bottomInset = Math.max(insets.bottom, 8)

  const focusedRouteName = state.routes[state.index]?.name
  const focusedIndex = useMemo(
    () => Math.max(0, ROUTES.findIndex((r) => r.key === focusedRouteName)),
    [focusedRouteName],
  )

  const pathname = usePathname()
  const isJournalOpen = isJournalEntryPath(pathname)

  const mounted = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      mounted.value = 1
      return
    }
    mounted.value = withDelay(MOUNT_DELAY_MS, withSpring(1, SPRING_DEFAULT))
  }, [reduced])

  const barStyle = useAnimatedStyle(() => ({
    opacity: mounted.value,
    transform: [{ translateY: interpolate(mounted.value, [0, 1], [40, 0]) }],
  }))

  const onSelect = (index: number) => {
    const route = state.routes.find((r) => r.name === ROUTES[index].key)
    if (!route) return
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    })
    if (!event.defaultPrevented) {
      navigation.navigate(route.name, route.params)
    }
  }

  const onPressPlus = () => {
    router.push("/journal-entry" as never)
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          left: BAR_MARGIN_X,
          right: BAR_MARGIN_X,
          bottom: bottomInset + BAR_BOTTOM_GAP,
        },
        barStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.row, { gap: PILL_FAB_GAP }]}>
        <TabPill routes={ROUTES} focusedIndex={focusedIndex} onSelect={onSelect} />
        <PlusFab isOpen={isJournalOpen} onPress={onPressPlus} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0. (The new orchestrator is unimported at this point — the layout still points to the old `AppTabBar.tsx` file, which still exists. Both files coexist.)

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/AppTabBar/AppTabBar.tsx
git commit -m "feat(tab-bar): AppTabBar orchestrator — bar wrapper, mount entry, navigator wiring"
```

---

## Task 8: Cut over — delete the old file, add the barrel

**Files:**
- Create: `apps/app/app/components/AppTabBar/index.ts`
- Delete: `apps/app/app/components/AppTabBar.tsx` (old single-file flat bar)

> This is the cut-over. Both actions must happen in the same commit so the import `@/components/AppTabBar` continues to resolve at all times (the old `.tsx` file flips to the new `./AppTabBar/index.ts` barrel).

- [ ] **Step 1: Delete the old file**

```bash
rm apps/app/app/components/AppTabBar.tsx
```

- [ ] **Step 2: Create the barrel `index.ts`**

```ts
// apps/app/app/components/AppTabBar/index.ts
export { AppTabBar } from "./AppTabBar"
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/app && pnpm tsc --noEmit`
Expected: exit 0. The layout's import `@/components/AppTabBar` now resolves to `./AppTabBar/index.ts` → `./AppTabBar/AppTabBar.tsx`.

- [ ] **Step 4: Run jest**

Run: `cd apps/app && pnpm jest`
Expected: all existing tests still pass + the new `pathUtils.test.ts` passes (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/AppTabBar/index.ts
git add -u apps/app/app/components/AppTabBar.tsx
git commit -m "refactor(tab-bar): cut over to AppTabBar/ folder, drop flat single-file bar"
```

---

## Task 9: Visual verification on device / simulator

**Files:** None — manual smoke test.

> No device automation in this plan. This task is the human (or follow-up agent) actually using the app and confirming each item below. If anything fails, fix and add a new commit; do not silently move on.

- [ ] **Step 1: Start Metro**

Run: `cd apps/app && pnpm start`
Expected: Metro starts on port 8081.

- [ ] **Step 2: Launch on iOS simulator**

In a second terminal: `cd apps/app && pnpm ios`
Expected: app launches in the simulator.

- [ ] **Step 3: Verify the bar appears with the mount animation**

Expected: on first paint, the bar rises into view from below (translateY 40 → 0, opacity 0 → 1). Pill on the left, orange FAB on the right.

- [ ] **Step 4: Verify chip slide**

Tap Health, then Settings, then Home. The filled-chip background should smoothly slide between cells with a spring. Icons should swap outline → filled, and label colors should crossfade dim → bright.

- [ ] **Step 5: Verify FAB press feedback**

Tap and hold the `+`. The FAB should scale down to ~0.92. Release — it should spring back to 1.0 with the brand-orange halo ring expanding outward and fading.

- [ ] **Step 6: Verify rotate on open / close**

Tap the `+`. The journal-entry modal should slide up. The `+` icon should rotate 45° into an `×` while the modal is open. Dismiss the modal — icon should rotate back to `+`.

- [ ] **Step 7: Verify dark mode + light mode**

Settings → toggle theme. Bar should re-tint instantly (pill becomes light-mode glass, chip becomes black-8%, FAB stays orange).

- [ ] **Step 8: Verify safe-area + reduced-motion**

Bar should clear the home indicator at the bottom. Enable iOS "Reduce Motion" in simulator (Features → Toggle Reduce Motion). Re-run from step 3 — animations should be instant (no spring, no halo).

- [ ] **Step 9: Final commit if any fixes were needed**

If steps 3–8 required code tweaks, commit those with a `fix(tab-bar): ...` message. Otherwise, no commit needed.

---

## Self-Review (already done by author)

**Spec coverage:**
- Layout numbers (BAR_MARGIN_X / PILL_HEIGHT / FAB_SIZE / etc.) → Task 1 (tokens.ts).
- Glass pill visual tokens → Task 2 (theme tokens) + Task 6 (TabPill uses them).
- Solid orange FAB visual treatment → Task 5 (PlusFab + LinearOrangeBackground).
- A1 Chip slide → Task 6 (TabPill `chipX` shared value + spring).
- A2 Icon swap + scale → Task 4 (TabCell `focus` derived value).
- A3 Cell press feedback → Task 4 (TabCell `press` shared value).
- A4 FAB press + pulse → Task 5 (PlusFab `scale` + `pulse`).
- A5 FAB rotate → Task 5 (PlusFab `openness` derived from `isOpen` prop) + Task 7 (AppTabBar passes `isJournalOpen` via `usePathname` + `isJournalEntryPath`).
- A6 Bar mount entry → Task 7 (AppTabBar `mounted` shared value).
- Routes wiring → Task 7 (ROUTES array + `onSelect` emits tabPress with `canPreventDefault: true`).
- `+` action → Task 7 (`onPressPlus` calls `router.push("/journal-entry")`).
- Theme support → Task 2 (tokens in both palettes) + components reading from `LOCAL_THEME.colors`.
- Accessibility → Task 4 (TabCell role/label/state, hitSlop 8) + Task 5 (PlusFab role/label, hitSlop 8).
- `useReducedMotion` everywhere → Tasks 4 / 5 / 6 / 7 all branch on `reduced`.
- Pure logic tested → Task 3 (`isJournalEntryPath` TDD).
- Layout wiring → unchanged (Task 8 just swaps the underlying module; `_layout.tsx` import path stays `@/components/AppTabBar`).

**Placeholder scan:** No TBDs, no "similar to Task N", no "implement later". Every code step is complete code.

**Type consistency:**
- `PillRoute` (Task 6) used by `AppTabBar.tsx` (Task 7).
- `TabCellProps` (Task 4) consumed by `TabPill` (Task 6).
- `PlusFabProps` (Task 5) consumed by `AppTabBar` (Task 7).
- `isJournalEntryPath` (Task 3) consumed by `AppTabBar` (Task 7).
- All spring/timing constants from `tokens.ts` (Task 1) referenced everywhere.

**Non-goals from spec are honored:** No `@callstack/liquid-glass`, no auto-collapse-on-scroll, no haptics, no badges, no gradient FAB lib (solid orange fallback noted in PlusFab).
