# Activity Feed Frontend Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the activity surfaces in the mobile app — Strain tab, Home tape, Candidate cards, and a new bout-detail screen — with the Rich-10 visual language: per-class icon + tint, single `BoutCard` shared across surfaces, stacked candidate deck, bottom-sheet class picker modeled on the existing `DateOfBirthSheet`.

**Architecture:** Pure-data icon/tint table → small visual primitives (`GapRule`, `DayTimeline`) → core card (`BoutCard`) → candidate variants (`CandidateCard`, `CandidateDeck`) → bottom sheet (`ClassPickerSheet`) → screen rewrites (`StrainActivityScreen`, `TodayCard`) → new `BoutDetailScreen` + route. Files are kept small and focused so each is reviewable and replaceable.

**Tech Stack:** React Native + Expo SDK 55, expo-router 5, `expo-symbols` (SF Symbols), `react-native-reanimated` (sheet animation), `phosphor-react-native` (already used for icons in non-bout chrome), Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-05-19-activity-feed-frontend-revamp-design.md`

---

## File Map

| Path | Role |
|---|---|
| `apps/app/app/components/activity/bout-icons.ts` | Rich-10 + sentinels → `{ sfSymbol, tintHex }`. Pure data + helper. |
| `apps/app/app/components/activity/GapRule.tsx` | Thin Off-Wrist / No-Data rule row. |
| `apps/app/app/components/activity/DayTimeline.tsx` | 24-hour horizontal strip with class-colored blocks. |
| `apps/app/app/components/activity/BoutCard.tsx` | Rich named-bout card (icon + title + meta + strain pill). |
| `apps/app/app/components/activity/ClassPickerSheet.tsx` | Bottom sheet, Rich-10 list, modeled on `DateOfBirthSheet`. |
| `apps/app/app/components/activity/CandidateCard.tsx` | Rich candidate-tier card with HR sparkline + chip + confirm. |
| `apps/app/app/components/activity/CandidateDeck.tsx` | Stack-of-N for 2+ candidates with counter pill + pager. |
| `apps/app/app/components/activity/index.ts` | Barrel re-exports. |
| `apps/app/test/components/activity/bout-icons.test.ts` | Predicate tests for the icon/tint table. |
| `apps/app/test/components/activity/CandidateDeck.test.tsx` | Behavior test for the deck. |
| `apps/app/app/screens/BoutDetailScreen.tsx` | New detail screen for tap-into-bout. |
| `apps/app/src/app/(app)/bout-detail.tsx` | Route file. |
| `apps/app/src/app/(app)/_layout.tsx` | Register `bout-detail` Stack.Screen entry. |
| `apps/app/app/screens/StrainActivityScreen.tsx` | Rewrite per spec. |
| `apps/app/app/components/home/PendingActivityCards.tsx` | Replace internals with `CandidateCard` / `CandidateDeck`. |
| `apps/app/app/components/home/TodayCard.tsx` | Workouts → `BoutCard`; Off-Wrist / No-Data → `GapRule`. |
| `apps/app/app/utils/buildTodayTape.ts` | Extend `TapeEvent.payload` with bout metadata. |
| `apps/app/app/services/api/noopClient.ts` | Extend `PendingActivityCard` + `ActivityFeedEntry` types. |
| `apps/app/app/screens/HomeScreen.tsx` | `handleTapePress` for workout events navigates to `/bout-detail`. |

---

## Task 1 — `bout-icons.ts` (Rich-10 + sentinel → SF Symbol + tint)

**Files:**
- Create: `apps/app/app/components/activity/bout-icons.ts`
- Test: `apps/app/test/components/activity/bout-icons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/test/components/activity/bout-icons.test.ts`:

```ts
import { ACTIVITY_VISUALS, visualForType, type ActivityVisual } from "../../../app/components/activity/bout-icons"

describe("ACTIVITY_VISUALS", () => {
  const expected = [
    "Running", "Walking", "Hiking", "Cycling", "Strength", "HIIT",
    "Stair Climb", "Cardio", "Mixed", "Light Activity",
    "Candidate", "Off-Wrist", "No Data",
  ]

  it("has an entry for every Rich-10 class and sentinel", () => {
    for (const t of expected) {
      const v: ActivityVisual = (ACTIVITY_VISUALS as Record<string, ActivityVisual>)[t]
      expect(v).toBeDefined()
      expect(typeof v.sfSymbol).toBe("string")
      expect(v.tintHex).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(typeof v.backgroundHex).toBe("string")
    }
  })

  it("visualForType falls back to Light Activity for unknown class", () => {
    expect(visualForType("Some Unknown Class")).toEqual(ACTIVITY_VISUALS["Light Activity"])
  })

  it("visualForType returns the matching entry for a known class", () => {
    expect(visualForType("Running")).toBe(ACTIVITY_VISUALS["Running"])
  })

  it("Stair Climb maps to a stair SF Symbol", () => {
    expect(ACTIVITY_VISUALS["Stair Climb"].sfSymbol).toContain("stair")
  })

  it("Candidate uses indigo tint", () => {
    expect(ACTIVITY_VISUALS["Candidate"].tintHex.toUpperCase()).toBe("#5E5CE6")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && pnpm exec jest test/components/activity/bout-icons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/app/app/components/activity/bout-icons.ts`:

```ts
/**
 * Rich-10 named classes + sentinels → SF Symbol + tint colors.
 * The tint is used at full opacity for the icon glyph and at 18% opacity
 * for the icon background pill. Background hex is precomputed for cheap
 * RN rendering (no rgba() string allocation per render).
 */

export type ActivityVisual = {
  sfSymbol: string
  tintHex: string
  /** Same color as tintHex but with ~18% alpha baked in as `rgba(...)`. */
  backgroundHex: string
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function entry(sfSymbol: string, tintHex: string): ActivityVisual {
  return { sfSymbol, tintHex, backgroundHex: withAlpha(tintHex, 0.18) }
}

export const ACTIVITY_VISUALS = {
  // Rich-10 named classes
  "Running":        entry("figure.run", "#FF8A8A"),
  "Walking":        entry("figure.walk", "#4ADE80"),
  "Hiking":         entry("figure.hiking", "#A78BFA"),
  "Cycling":        entry("bicycle", "#64D2FF"),
  "Strength":       entry("figure.strengthtraining.functional", "#FFA42B"),
  "HIIT":           entry("bolt.fill", "#FBBF24"),
  "Stair Climb":    entry("figure.stair.stepper", "#C48BF8"),
  "Cardio":         entry("heart.fill", "#9492F5"),
  "Mixed":          entry("square.grid.2x2", "#C7C7CC"),
  "Light Activity": entry("figure.walk.motion", "#AEAEB2"),

  // Tier + sentinels
  "Candidate":      entry("questionmark.circle.fill", "#5E5CE6"),
  "Off-Wrist":      entry("wave.3.left.slash", "#6B6B70"),
  "No Data":        entry("wifi.slash", "#6B6B70"),
} as const satisfies Record<string, ActivityVisual>

export type ActivityVisualKey = keyof typeof ACTIVITY_VISUALS

export function visualForType(type: string): ActivityVisual {
  return (ACTIVITY_VISUALS as Record<string, ActivityVisual>)[type]
    ?? ACTIVITY_VISUALS["Light Activity"]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && pnpm exec jest test/components/activity/bout-icons.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/components/activity/bout-icons.ts apps/app/test/components/activity/bout-icons.test.ts
git commit -m "app: Rich-10 activity icon/tint table"
```

---

## Task 2 — `GapRule.tsx` (Off-Wrist / No-Data line)

**Files:**
- Create: `apps/app/app/components/activity/GapRule.tsx`

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/activity/GapRule.tsx`:

```tsx
import { FC } from "react"
import { StyleSheet, View } from "react-native"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

type Props = {
  kind: "Off-Wrist" | "No Data"
  startTime: Date
  endTime: Date
  source?: string | null
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export const GapRule: FC<Props> = ({ kind, startTime, endTime, source }) => {
  const colors = LOCAL_THEME.colors
  const v = visualForType(kind)
  const reason = source === "ChargingOn"
    ? "charging"
    : source === "WristOff"
    ? "strap off"
    : kind === "No Data"
    ? "no data"
    : "off-wrist"
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: v.backgroundHex }]}>
        <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <Text
        text={`${fmt(startTime)} – ${fmt(endTime)} · ${reason}`}
        style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }}
        numberOfLines={1}
      />
      <View style={[styles.dashLine, { backgroundColor: "transparent", borderColor: colors.divider }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  iconWrap: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  dashLine: {
    flex: 1,
    height: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/activity/GapRule.tsx
git commit -m "app: GapRule component for Off-Wrist / No-Data rows"
```

---

## Task 3 — `DayTimeline.tsx` (24-hour strip)

**Files:**
- Create: `apps/app/app/components/activity/DayTimeline.tsx`

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/activity/DayTimeline.tsx`:

```tsx
import { FC, useMemo } from "react"
import { StyleSheet, View } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

export type DayTimelineBout = {
  startTime: Date
  endTime: Date
  /** Rich-10 class, "Candidate", "Off-Wrist", or "No Data". */
  activityType: string
}

type Props = {
  /** Bouts to render. May span anywhere; clipped to the dayDate window. */
  bouts: DayTimelineBout[]
  /** Local-time day boundaries (start = 00:00 of dayDate, end = 23:59:59.999). */
  dayStart: Date
  dayEnd: Date
}

export const DayTimeline: FC<Props> = ({ bouts, dayStart, dayEnd }) => {
  const colors = LOCAL_THEME.colors
  const spanMs = dayEnd.getTime() - dayStart.getTime()

  const blocks = useMemo(() => {
    if (spanMs <= 0) return []
    return bouts
      .map((b) => {
        const start = Math.max(b.startTime.getTime(), dayStart.getTime())
        const end = Math.min(b.endTime.getTime(), dayEnd.getTime())
        if (end <= start) return null
        return {
          left: ((start - dayStart.getTime()) / spanMs) * 100,
          width: ((end - start) / spanMs) * 100,
          type: b.activityType,
        }
      })
      .filter((x): x is { left: number; width: number; type: string } => x != null)
  }, [bouts, dayStart, dayEnd, spanMs])

  const labels = ["4a", "8a", "12p", "4p", "8p"]

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text="DAY TIMELINE"
        style={{
          color: colors.textDim, fontSize: 10, fontWeight: "700",
          letterSpacing: 1.4, marginBottom: 8,
        }}
      />
      <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}>
        {blocks.map((b, i) => {
          const v = visualForType(b.type)
          const isCandidate = b.type === "Candidate"
          const isGap = b.type === "Off-Wrist" || b.type === "No Data"
          return (
            <View
              key={i}
              style={[
                styles.block,
                {
                  left: `${b.left}%`,
                  width: `${Math.max(0.5, b.width)}%`,
                  backgroundColor: isGap ? "transparent" : v.tintHex,
                  borderWidth: isCandidate ? 1 : 0,
                  borderColor: isCandidate ? v.tintHex : "transparent",
                  borderStyle: isCandidate ? "dashed" : "solid",
                  opacity: isGap ? 0.45 : 1,
                },
                isGap && {
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  borderStyle: "dashed",
                },
              ]}
            />
          )
        })}
      </View>
      <View style={styles.axis}>
        {labels.map((l) => (
          <Text key={l} text={l} style={{ color: colors.textMuted, fontSize: 9, fontVariant: ["tabular-nums"] }} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { padding: 12, borderRadius: 12 },
  track: { position: "relative", height: 18, borderRadius: 5, overflow: "hidden" },
  block: { position: "absolute", top: 0, bottom: 0, borderRadius: 3 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/activity/DayTimeline.tsx
git commit -m "app: DayTimeline 24h strip"
```

---

## Task 4 — `BoutCard.tsx` (shared rich card)

**Files:**
- Create: `apps/app/app/components/activity/BoutCard.tsx`

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/activity/BoutCard.tsx`:

```tsx
import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

type Intensity = "light" | "moderate" | "hard"

type Props = {
  activityType: string
  startTime: Date
  durationMinutes: number
  heartRateAvg: number
  intensity: Intensity
  strainScore: number
  /** Optional: when set, pressing the card calls this. */
  onPress?: () => void
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export const BoutCard: FC<Props> = ({
  activityType,
  startTime,
  durationMinutes,
  heartRateAvg,
  intensity,
  strainScore,
  onPress,
}) => {
  const colors = LOCAL_THEME.colors
  const v = visualForType(activityType)
  const body = (
    <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
      <View style={[styles.iconWrap, { backgroundColor: v.backgroundHex }]}>
        <SymbolView name={v.sfSymbol as never} size={18} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.body}>
        <Text
          text={activityType}
          style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
          numberOfLines={1}
        />
        <Text
          text={`${fmt(startTime)} · ${Math.round(durationMinutes)} min · HR ${Math.round(heartRateAvg)} · ${intensity}`}
          style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}
          numberOfLines={1}
        />
      </View>
      <View style={styles.right}>
        <Text
          text={strainScore.toFixed(1)}
          style={{
            color: colors.text, fontSize: 17, fontWeight: "800",
            lineHeight: 17, fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          text="STRAIN"
          style={{
            color: colors.textMuted, fontSize: 9, fontWeight: "700",
            letterSpacing: 1, marginTop: 2,
          }}
        />
      </View>
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  } as ViewStyle,
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  body: { flex: 1 } as ViewStyle,
  right: { alignItems: "flex-end" } as ViewStyle,
  pressed: { opacity: 0.7 },
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/activity/BoutCard.tsx
git commit -m "app: BoutCard shared rich card component"
```

---

## Task 5 — `ClassPickerSheet.tsx` (bottom sheet, modeled on `DateOfBirthSheet`)

**Files:**
- Create: `apps/app/app/components/activity/ClassPickerSheet.tsx`

Models `DateOfBirthSheet` (Modal + reanimated `translateY` + backdrop opacity + grabber + header row) but the body is a Rich-10 list of pickable rows.

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/activity/ClassPickerSheet.tsx`:

```tsx
import { FC, useEffect, useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { ACTIVITY_VISUALS, type ActivityVisualKey } from "./bout-icons"

const RICH_10_ORDER: ActivityVisualKey[] = [
  "Stair Climb",
  "Running",
  "HIIT",
  "Cycling",
  "Strength",
  "Hiking",
  "Walking",
  "Cardio",
  "Mixed",
  "Light Activity",
]

type Props = {
  visible: boolean
  /** Currently-selected class to seed the check-mark. Pass null for "no current". */
  currentType: string | null
  onCancel: () => void
  onPick: (type: string) => void
}

export const ClassPickerSheet: FC<Props> = ({ visible, currentType, onCancel, onPick }) => {
  const colors = LOCAL_THEME.colors

  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = withTiming(0, { duration: 220 })
      backdropOpacity.value = withTiming(0.55, { duration: 220 })
    } else if (mounted) {
      translateY.value = withTiming(600, { duration: 180 })
      backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible, mounted, translateY, backdropOpacity])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }))

  if (!visible && !mounted) return null

  // Bump the suggested class to the top of the sheet.
  const sortedOrder: ActivityVisualKey[] =
    currentType && RICH_10_ORDER.includes(currentType as ActivityVisualKey)
      ? [
          currentType as ActivityVisualKey,
          ...RICH_10_ORDER.filter((c) => c !== (currentType as ActivityVisualKey)),
        ]
      : RICH_10_ORDER

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.surfaceCardBorder,
            },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.textMuted }]} />
          </View>

          <View style={styles.headerRow}>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.headerBtn}>
              <Text text="Cancel" style={[styles.headerBtnText, { color: colors.textDim }]} />
            </Pressable>
            <Text text="Pick a class" style={[styles.headerTitle, { color: colors.text }]} />
            <View style={styles.headerBtn} />
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: 12 }}>
            {sortedOrder.map((cls) => {
              const v = ACTIVITY_VISUALS[cls]
              const isCurrent = cls === currentType
              return (
                <Pressable
                  key={cls}
                  onPress={() => onPick(cls)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: v.backgroundHex }]}>
                    <SymbolView name={v.sfSymbol as never} size={15} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
                  </View>
                  <Text text={cls} style={[styles.rowName, { color: colors.text }]} />
                  {isCurrent ? (
                    <SymbolView name="checkmark" size={14} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, paddingTop: 8, paddingBottom: 28,
  },
  grabber: { alignItems: "center", paddingVertical: 8 },
  grabberBar: { width: 40, height: 4, borderRadius: 2, opacity: 0.6 },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12,
  },
  headerBtn: { paddingVertical: 4, minWidth: 60 },
  headerBtnText: { fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 15, fontWeight: "700" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  rowIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { flex: 1, fontSize: 15, fontWeight: "600" },
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/activity/ClassPickerSheet.tsx
git commit -m "app: ClassPickerSheet bottom-sheet picker (Rich-10)"
```

---

## Task 6 — `CandidateCard.tsx` (rich candidate)

**Files:**
- Create: `apps/app/app/components/activity/CandidateCard.tsx`

- [ ] **Step 1: Write the component**

Create `apps/app/app/components/activity/CandidateCard.tsx`:

```tsx
import { FC, useState } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { SymbolView } from "expo-symbols"
import Svg, { Path } from "react-native-svg"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"
import { ClassPickerSheet } from "./ClassPickerSheet"

export type CandidatePayload = {
  id: string
  startTime: Date
  endTime: Date
  durationMinutes: number
  heartRateAvg: number
  heartRateMax: number
  confidence: number
  suggestedType: string
  /** Normalised HR series [0..1] sampled at ~24 points for the mini sparkline. */
  hrSparkline?: number[]
}

type Props = {
  card: CandidatePayload
  onConfirm: (id: string, finalType: string) => Promise<unknown> | void
  onDismiss: (id: string) => Promise<unknown> | void
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function sparkPath(samples: number[], width = 280, height = 44): string {
  if (samples.length === 0) return ""
  const step = width / Math.max(1, samples.length - 1)
  return samples
    .map((v, i) => {
      const x = i * step
      const y = height - v * height
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
}

export const CandidateCard: FC<Props> = ({ card, onConfirm, onDismiss }) => {
  const colors = LOCAL_THEME.colors
  const [chosenType, setChosenType] = useState(card.suggestedType)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const v = visualForType(chosenType)
  const conf = Math.round(card.confidence * 100)
  const confLow = card.confidence < 0.5
  const verdictPrefix = confLow ? "This might be" : "This was"

  const run = async (fn: () => Promise<unknown> | void) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const samples = card.hrSparkline ?? []
  const sparkD = sparkPath(samples)
  const sparkArea = sparkD
    ? `${sparkD} L 280 44 L 0 44 Z`
    : ""

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: visualForType("Candidate").tintHex,
        },
      ]}
    >
      <View style={styles.metaRow}>
        <Text
          text={`${fmt(card.startTime)} → ${fmt(card.endTime)}`}
          style={{ color: colors.text, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}
        />
        <View style={[styles.metaDot, { backgroundColor: colors.divider }]} />
        <Text text={`${Math.round(card.durationMinutes)} min`} style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }} />
        <View style={[styles.metaDot, { backgroundColor: colors.divider }]} />
        <Text
          text={`HR ${Math.round(card.heartRateAvg)} avg · ${Math.round(card.heartRateMax)} max`}
          style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }}
        />
        <View style={{ flex: 1 }} />
        <View
          style={[
            styles.confChip,
            { backgroundColor: confLow ? "rgba(255, 164, 43, 0.18)" : "rgba(94, 92, 230, 0.18)" },
          ]}
        >
          <Text
            text={`${conf}%`}
            style={{ color: confLow ? "#FFA42B" : "#9492F5", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}
          />
        </View>
      </View>

      {samples.length >= 2 ? (
        <View style={styles.sparkWrap}>
          <Svg width="100%" height="44" viewBox="0 0 280 44" preserveAspectRatio="none">
            <Path d={sparkArea} fill={v.tintHex} fillOpacity={0.18} />
            <Path d={sparkD} stroke={v.tintHex} strokeWidth={1.6} fill="none" />
          </Svg>
        </View>
      ) : null}

      <View style={styles.verdictRow}>
        <Text text={verdictPrefix} style={{ color: colors.textDim, fontSize: 12 }} />
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={[styles.chip, { backgroundColor: v.backgroundHex }]}
        >
          <View style={[styles.chipIcon, { backgroundColor: v.tintHex + "44" }]}>
            <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
          </View>
          <Text text={chosenType} style={{ color: v.tintHex, fontSize: 12, fontWeight: "700" }} />
          <Text text="▾" style={{ color: v.tintHex, fontSize: 9, opacity: 0.7 }} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => run(() => onConfirm(card.id, chosenType))}
          disabled={busy}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.text, opacity: busy || pressed ? 0.65 : 1 },
          ]}
        >
          <Text text="Confirm" style={{ color: colors.background, fontSize: 13, fontWeight: "800" }} />
        </Pressable>
        <Pressable
          onPress={() => run(() => onDismiss(card.id))}
          disabled={busy}
          style={{ paddingVertical: 6, paddingHorizontal: 4 }}
        >
          <Text
            text="Not an activity"
            style={{ color: colors.textDim, fontSize: 12, textDecorationLine: "underline" }}
          />
        </Pressable>
      </View>

      <ClassPickerSheet
        visible={sheetOpen}
        currentType={chosenType}
        onCancel={() => setSheetOpen(false)}
        onPick={(t) => {
          setChosenType(t)
          setSheetOpen(false)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  } as ViewStyle,
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 } as ViewStyle,
  confChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 } as ViewStyle,
  sparkWrap: { marginTop: 12, height: 44 } as ViewStyle,
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999,
  } as ViewStyle,
  chipIcon: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" } as ViewStyle,
  actions: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  primary: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center", justifyContent: "center",
  } as ViewStyle,
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/activity/CandidateCard.tsx
git commit -m "app: CandidateCard with HR sparkline + class picker sheet"
```

---

## Task 7 — `CandidateDeck.tsx` (2+ candidates → stack)

**Files:**
- Create: `apps/app/app/components/activity/CandidateDeck.tsx`
- Test: `apps/app/test/components/activity/CandidateDeck.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/test/components/activity/CandidateDeck.test.tsx`:

```tsx
import { render, fireEvent, act } from "@testing-library/react-native"
import { CandidateDeck } from "../../../app/components/activity/CandidateDeck"

const makeCard = (id: string) => ({
  id,
  startTime: new Date("2026-05-17T09:15:00"),
  endTime: new Date("2026-05-17T09:33:00"),
  durationMinutes: 18,
  heartRateAvg: 132,
  heartRateMax: 158,
  confidence: 0.72,
  suggestedType: "Strength",
  hrSparkline: [0.2, 0.4, 0.5, 0.6, 0.5, 0.7, 0.8, 0.7, 0.6],
})

describe("CandidateDeck", () => {
  it("renders nothing when cards is empty", () => {
    const { toJSON } = render(
      <CandidateDeck cards={[]} onConfirm={async () => {}} onDismiss={async () => {}} />,
    )
    expect(toJSON()).toBeNull()
  })

  it("renders single card without deck chrome", () => {
    const { queryByText } = render(
      <CandidateDeck cards={[makeCard("c1")]} onConfirm={async () => {}} onDismiss={async () => {}} />,
    )
    expect(queryByText(/of /)).toBeNull()
  })

  it("renders counter pill and pager when cards.length >= 2", () => {
    const { getByText } = render(
      <CandidateDeck cards={[makeCard("a"), makeCard("b"), makeCard("c")]} onConfirm={async () => {}} onDismiss={async () => {}} />,
    )
    expect(getByText("3")).toBeTruthy()
    expect(getByText(/1 of 3/i)).toBeTruthy()
  })

  it("calls onConfirm with the top card id and chosen type", async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <CandidateDeck
        cards={[makeCard("a"), makeCard("b")]}
        onConfirm={onConfirm}
        onDismiss={async () => {}}
      />,
    )
    await act(async () => {
      fireEvent.press(getByText("Confirm"))
    })
    expect(onConfirm).toHaveBeenCalledWith("a", "Strength")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/app && pnpm exec jest test/components/activity/CandidateDeck.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `apps/app/app/components/activity/CandidateDeck.tsx`:

```tsx
import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { CandidateCard, type CandidatePayload } from "./CandidateCard"
import { visualForType } from "./bout-icons"

type Props = {
  cards: CandidatePayload[]
  onConfirm: (id: string, finalType: string) => Promise<unknown> | void
  onDismiss: (id: string) => Promise<unknown> | void
}

export const CandidateDeck: FC<Props> = ({ cards, onConfirm, onDismiss }) => {
  const colors = LOCAL_THEME.colors
  if (cards.length === 0) return null

  // 1 candidate → render the bare card. No deck chrome.
  if (cards.length === 1) {
    return (
      <CandidateCard card={cards[0]} onConfirm={onConfirm} onDismiss={onDismiss} />
    )
  }

  const candidateTint = visualForType("Candidate").tintHex
  const total = cards.length
  const top = cards[0]
  const hasTwoBehind = cards.length >= 3

  return (
    <View style={styles.wrap}>
      <Text
        text={`1 of ${total} — swipe up for next`}
        style={{
          color: colors.textMuted, fontSize: 10, fontWeight: "700",
          letterSpacing: 1.2, textAlign: "center", marginBottom: 6,
          textTransform: "uppercase",
        }}
      />

      <View style={styles.stack}>
        <View style={[styles.counterPill, { backgroundColor: candidateTint }]}>
          <Text
            text={String(total)}
            style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}
          />
        </View>

        {hasTwoBehind ? (
          <View
            style={[
              styles.behind2,
              { backgroundColor: colors.surfaceCard, borderColor: candidateTint },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.behind1,
            { backgroundColor: colors.surfaceCard, borderColor: candidateTint },
          ]}
        />
        <CandidateCard card={top} onConfirm={onConfirm} onDismiss={onDismiss} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 8 } as ViewStyle,
  stack: { position: "relative" } as ViewStyle,
  counterPill: {
    position: "absolute",
    top: -8, right: 24,
    zIndex: 5,
    paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999,
    minWidth: 22, alignItems: "center", justifyContent: "center",
  } as ViewStyle,
  behind1: {
    position: "absolute",
    left: 24, right: 24, top: -4, height: 110,
    borderRadius: 14, borderWidth: 1, borderStyle: "dashed",
    opacity: 0.7, transform: [{ scale: 0.96 }], zIndex: 2,
  } as ViewStyle,
  behind2: {
    position: "absolute",
    left: 32, right: 32, top: -8, height: 110,
    borderRadius: 14, borderWidth: 1, borderStyle: "dashed",
    opacity: 0.45, transform: [{ scale: 0.92 }], zIndex: 1,
  } as ViewStyle,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/app && pnpm exec jest test/components/activity/CandidateDeck.test.tsx`
Expected: PASS — 4/4 tests green.

- [ ] **Step 5: Create barrel export**

Create `apps/app/app/components/activity/index.ts`:

```ts
export { ACTIVITY_VISUALS, visualForType } from "./bout-icons"
export type { ActivityVisual, ActivityVisualKey } from "./bout-icons"
export { BoutCard } from "./BoutCard"
export { CandidateCard } from "./CandidateCard"
export type { CandidatePayload } from "./CandidateCard"
export { CandidateDeck } from "./CandidateDeck"
export { ClassPickerSheet } from "./ClassPickerSheet"
export { DayTimeline } from "./DayTimeline"
export type { DayTimelineBout } from "./DayTimeline"
export { GapRule } from "./GapRule"
```

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/components/activity/CandidateDeck.tsx apps/app/app/components/activity/index.ts apps/app/test/components/activity/CandidateDeck.test.tsx
git commit -m "app: CandidateDeck (stack for 2+ candidates) + barrel"
```

---

## Task 8 — Extend API types for the richer fields

**Files:**
- Modify: `apps/app/app/services/api/noopClient.ts`
- Modify: `apps/app/app/utils/buildTodayTape.ts`

The richer card needs `endTime`, `heartRateMax`, `confidence`, `source`, and optionally `hrSparkline`. The Today tape needs to carry bout id + activity type so HomeScreen can route on tap.

- [ ] **Step 1: Find the current types**

Run: `grep -n 'PendingActivityCard\|activityFeed' apps/app/app/services/api/noopClient.ts | head`

Locate `PendingActivityCard` (the type used by `PendingActivityCards`) and the `activityFeed` array type on `HomeViewModel`.

- [ ] **Step 2: Extend `PendingActivityCard`**

In `apps/app/app/services/api/noopClient.ts`, find the `PendingActivityCard` type and add the new optional fields:

```ts
export type PendingActivityCard = {
  id: string
  startTime: string         // ISO
  endTime: string           // ISO  — NEW
  durationMinutes: number
  activityType: string       // suggested type
  intensity: "light" | "moderate" | "hard"
  confidence: number         // 0..1
  heartRateAvg: number
  heartRateMax: number       // NEW
  /** Normalised HR samples for the inline sparkline. May be empty. */
  hrSparkline?: number[]     // NEW
}
```

(If the type currently lives in a different exact shape, preserve every existing property — only add the three NEW fields. The backend may not populate them yet; `?` makes the addition non-breaking on the wire.)

- [ ] **Step 3: Extend `activityFeed` entry shape**

Find the `activityFeed` entry type on `HomeViewModel`. Add the fields the new card needs:

```ts
// before
type ActivityFeedEntry = {
  time: string         // "HH:MM"
  type: string
  duration: string     // "32 min"
  strain: number
}

// after
type ActivityFeedEntry = {
  id: string                 // NEW — for routing
  startTime: string          // ISO  — NEW
  endTime: string            // ISO  — NEW
  time: string               // "HH:MM" — KEEP for backwards compatibility
  type: string
  duration: string           // "32 min" — KEEP
  durationMinutes: number    // NEW
  heartRateAvg: number       // NEW
  intensity: "light" | "moderate" | "hard"  // NEW
  strain: number
  source: "detected" | "candidate" | "healthkit" | "manual"  // NEW
}
```

Backend already emits these fields per the activity-detector spec; we're just declaring them on the client.

- [ ] **Step 4: Extend `TapeEvent.payload` and the workout builder**

In `apps/app/app/utils/buildTodayTape.ts`, update the `TapeEvent` type and the workout-event push:

```ts
export type TapeEvent = {
  id: string
  time: string
  ts: number
  title: string
  desc?: string
  dotColor: string
  type: TapeEventType
  payload?: {
    journalEntryId?: string
    /** Activity-only — propagated from HomeViewModel.activities.activityFeed. */
    boutId?: string
    activityType?: string
    intensity?: "light" | "moderate" | "hard"
    durationMinutes?: number
    heartRateAvg?: number
    strain?: number
    startIso?: string
  }
}
```

In the workout loop inside `buildTodayTape`, attach the payload fields:

```ts
events.push({
  id: `workout-${i}`,
  time: a.time,
  ts,
  title: a.type,
  desc: `${a.duration} · Strain ${a.strain}`,
  dotColor: colors.ringStrain,
  type: "workout",
  payload: {
    boutId: a.id,
    activityType: a.type,
    intensity: a.intensity,
    durationMinutes: a.durationMinutes,
    heartRateAvg: a.heartRateAvg,
    strain: a.strain,
    startIso: a.startTime,
  },
})
```

- [ ] **Step 5: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS. Any callers reading the old field names continue to work.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/services/api/noopClient.ts apps/app/app/utils/buildTodayTape.ts
git commit -m "app: extend activity API types with id/endTime/hrMax/source"
```

---

## Task 9 — Replace `PendingActivityCards` internals

**Files:**
- Modify: `apps/app/app/components/home/PendingActivityCards.tsx`

The public API stays — `<PendingActivityCards cards={...} onResolved={...} />` — but the internals now compose `CandidateDeck`.

- [ ] **Step 1: Replace the file body**

Open `apps/app/app/components/home/PendingActivityCards.tsx`. Replace the whole file with:

```tsx
import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { CandidateDeck, type CandidatePayload } from "@/components/activity"
import { confirmActivity, dismissActivity, PendingActivityCard } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  cards: PendingActivityCard[]
  onResolved?: () => void
}

function toPayload(card: PendingActivityCard): CandidatePayload {
  return {
    id: card.id,
    startTime: new Date(card.startTime),
    endTime: new Date(card.endTime ?? card.startTime),
    durationMinutes: card.durationMinutes,
    heartRateAvg: card.heartRateAvg,
    heartRateMax: card.heartRateMax ?? card.heartRateAvg,
    confidence: card.confidence,
    suggestedType: card.activityType,
    hrSparkline: card.hrSparkline,
  }
}

export const PendingActivityCards: FC<Props> = ({ cards, onResolved }) => {
  if (cards.length === 0) return null
  const payloads = cards.map(toPayload)
  return (
    <View style={styles.wrap}>
      <Text
        text="NEW ACTIVITY"
        style={{
          color: LOCAL_THEME.colors.textDim, fontSize: 11, fontWeight: "700",
          letterSpacing: 1.8, marginBottom: 10,
        }}
      />
      <CandidateDeck
        cards={payloads}
        onConfirm={async (id, finalType) => {
          await confirmActivity(id, finalType)
          onResolved?.()
        }}
        onDismiss={async (id) => {
          await dismissActivity(id)
          onResolved?.()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 } as ViewStyle,
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/PendingActivityCards.tsx
git commit -m "app: PendingActivityCards now composes CandidateDeck"
```

---

## Task 10 — Update `TodayCard` to use `BoutCard` for workouts and `GapRule` for gaps

**Files:**
- Modify: `apps/app/app/components/home/TodayCard.tsx`

- [ ] **Step 1: Replace the `Row` rendering switch**

In `TodayCard.tsx`, locate the `Row` component. We will branch by `event.type`. Replace the `Row` function with:

```tsx
import { BoutCard, GapRule } from "@/components/activity"

// ... existing imports preserved

const Row: FC<{ event: TapeEvent; onPress?: () => void }> = ({ event, onPress }) => {
  const { colors } = LOCAL_THEME

  // Activity bouts get the new BoutCard shape — only when payload metadata is present.
  if (event.type === "workout" && event.payload?.activityType) {
    const p = event.payload
    const isGap = p.activityType === "Off-Wrist" || p.activityType === "No Data"
    if (isGap && p.startIso && p.durationMinutes != null) {
      const start = new Date(p.startIso)
      const end = new Date(start.getTime() + p.durationMinutes * 60_000)
      return (
        <GapRule
          kind={p.activityType as "Off-Wrist" | "No Data"}
          startTime={start}
          endTime={end}
        />
      )
    }
    return (
      <View style={{ marginHorizontal: -12 }}>
        <BoutCard
          activityType={p.activityType}
          startTime={p.startIso ? new Date(p.startIso) : new Date(event.ts)}
          durationMinutes={p.durationMinutes ?? 0}
          heartRateAvg={p.heartRateAvg ?? 0}
          intensity={p.intensity ?? "light"}
          strainScore={p.strain ?? 0}
          onPress={onPress}
        />
      </View>
    )
  }

  // Everything else (sleep / recovery / journal / vital) keeps the existing
  // dot + text row.
  const inner = (
    <View style={styles.row}>
      <Text
        text={event.time}
        style={{
          color: colors.textMuted, fontSize: 12, fontWeight: "600",
          minWidth: 46, paddingTop: 3, fontVariant: ["tabular-nums"],
        }}
      />
      <View style={[styles.dot, { backgroundColor: event.dotColor }]} />
      <View style={styles.body}>
        <Text
          text={event.title}
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 }}
        />
        {event.desc ? (
          <Text
            text={event.desc}
            numberOfLines={2}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
        ) : null}
      </View>
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {inner}
    </Pressable>
  )
}
```

(Keep the rest of `TodayCard.tsx` exactly as it was — the outer `TodayCard` map and the `styles` block. Sleep / recovery / journal rows continue to render via the existing dot-and-text branch.)

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/TodayCard.tsx
git commit -m "app: TodayCard renders workouts as BoutCard and gaps as GapRule"
```

---

## Task 11 — Rewrite `StrainActivityScreen`

**Files:**
- Modify: `apps/app/app/screens/StrainActivityScreen.tsx`

Goal: replace the current vertical stack (hero + line chart + 4 vital cards + sparklines + labs) with **hero (compact ring + counts) → DayTimeline → CandidateDeck → bout feed → Strain 7-day sparkline → Labs accordion (now absorbing vitals + sparklines below the day detail)**.

- [ ] **Step 1: Replace the file**

Replace `apps/app/app/screens/StrainActivityScreen.tsx` with:

```tsx
import { FC, useMemo, useRef } from "react"
import { RefreshControl, View, ViewStyle, useWindowDimensions } from "react-native"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"

import { BoutCard, DayTimeline, GapRule, type DayTimelineBout } from "@/components/activity"
import { PendingActivityCards } from "@/components/home/PendingActivityCards"
import { InlineLineChart } from "@/components/InlineLineChart"
import { LabsAccordion } from "@/components/LabsAccordion"
import { MetricHero } from "@/components/MetricHero"
import { ScreenHeader, SCREEN_HEADER_HEIGHT } from "@/components/ScreenHeader"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { TrendSparkline } from "@/components/TrendSparkline"
import { VitalCard } from "@/components/VitalCard"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

const STRAIN_TINT = "#ffa42b"
const STRESS_TINT = "#f87171"

export const StrainActivityScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const {
    homeView,
    isRefreshing,
    refreshDashboard,
    error,
    clearError,
    selectedDate,
    setSelectedDate,
  } = useDashboard()
  const { realtimeHeartRate } = useBle()

  const lastShownError = useRef<string | null>(null)
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  const scrollTopPadding = insets.top + SCREEN_HEADER_HEIGHT + 8

  if (error && error !== lastShownError.current) {
    lastShownError.current = error
    Toast.show(error, { type: "error", position: "top", duration: 4000 })
    clearError()
  } else if (!error) {
    lastShownError.current = null
  }

  const chartWidth = width - 48

  const formattedDate = (() => {
    const [y, m, d] = selectedDate.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
      .format(new Date(y, m - 1, d, 12))
  })()

  const strainValue = homeView?.rings.strain.value ?? "--"
  const strainNumeric = parseFloat(strainValue)
  const validStrain = Number.isFinite(strainNumeric)

  const classification = (() => {
    if (!validStrain) return { label: "No data", tint: colors.textMuted }
    if (strainNumeric >= 18) return { label: "All-out", tint: "#ef4444" }
    if (strainNumeric >= 14) return { label: "Strenuous", tint: "#ffa42b" }
    if (strainNumeric >= 10) return { label: "Moderate", tint: "#fbbf24" }
    if (strainNumeric >= 6) return { label: "Light", tint: "#4ade80" }
    return { label: "Minimal", tint: colors.textDim }
  })()

  const trendPoints = homeView?.strainTrend ?? []
  const sevenDayStrain = trendPoints.map((p) => ({ date: p.timestamp.slice(0, 10), value: p.value }))
  const sevenDayStress = (homeView?.stressTrend ?? []).map((p) => ({
    date: p.timestamp.slice(0, 10), value: p.value,
  }))

  const strainDelta = (() => {
    const priors = trendPoints
      .filter((p) => !p.timestamp.startsWith(selectedDate))
      .map((p) => p.value)
      .filter((v) => Number.isFinite(v))
    if (priors.length < 3 || !validStrain) return null
    const mean = priors.reduce((a, b) => a + b, 0) / priors.length
    return Math.round((strainNumeric - mean) * 10) / 10
  })()

  const feed = homeView?.activities.activityFeed ?? []
  const candidates = homeView?.pendingActivityCards ?? []

  const dayBounds = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number)
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0)
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999)
    return { dayStart, dayEnd }
  }, [selectedDate])

  const timelineBouts: DayTimelineBout[] = useMemo(
    () => [
      ...feed.map((a) => ({
        startTime: new Date(a.startTime),
        endTime: new Date(a.endTime),
        activityType: a.type,
      })),
      ...candidates.map((c) => ({
        startTime: new Date(c.startTime),
        endTime: new Date(c.endTime ?? c.startTime),
        activityType: "Candidate",
      })),
    ],
    [feed, candidates],
  )

  const namedCount = feed.filter((a) => a.source === "detected").length
  const candidateCount = candidates.length
  const offWristCount = feed.filter((a) => a.type === "Off-Wrist" || a.type === "No Data").length
  const activeMinutes = homeView?.activities.totalActiveMinutes ?? "--"

  const labsRows = [
    { label: "Training Load Ratio", value: homeView?.activities.trainingLoad ?? "--" },
    { label: "Load Risk Zone", value: homeView?.activities.trainingLoadRiskZone ?? "--" },
    { label: "Stress Load", value: homeView?.activities.stress ?? "--" },
    { label: "SpO₂", value: homeView?.activities.spo2 ?? "--" },
    { label: "SpO₂ Dips", value: homeView?.activities.spo2Dips ?? "--" },
    { label: "Active Minutes", value: activeMinutes },
  ]

  return (
    <View style={themed($screenWrap)}>
      <ScreenHeader title="Strain" subtitle={formattedDate} scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={[themed($container), { paddingTop: scrollTopPadding }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <MetricHero
          value={validStrain ? strainNumeric.toFixed(1) : "--"}
          valueDetail="0 – 21 scale"
          badge={{ label: classification.label, tint: classification.tint }}
          delta={strainDelta}
          deltaUnit=""
          detail={`${namedCount} named · ${candidateCount} candidate · ${offWristCount} off-wrist · ${activeMinutes} active min`}
        />

        <DayTimeline bouts={timelineBouts} dayStart={dayBounds.dayStart} dayEnd={dayBounds.dayEnd} />

        <PendingActivityCards cards={candidates} onResolved={refreshDashboard} />

        <Text
          text="TODAY"
          style={{
            color: colors.textDim, fontSize: 11, fontWeight: "700",
            letterSpacing: 1.8, marginTop: 18, marginHorizontal: 16,
          }}
        />
        {feed.length === 0 ? (
          <Text
            text="No confirmed activities yet."
            style={{ color: colors.textMuted, fontSize: 13, marginHorizontal: 16, marginTop: 6 }}
          />
        ) : (
          feed.map((a) => {
            if (a.type === "Off-Wrist" || a.type === "No Data") {
              return (
                <GapRule
                  key={a.id}
                  kind={a.type as "Off-Wrist" | "No Data"}
                  startTime={new Date(a.startTime)}
                  endTime={new Date(a.endTime)}
                />
              )
            }
            return (
              <BoutCard
                key={a.id}
                activityType={a.type}
                startTime={new Date(a.startTime)}
                durationMinutes={a.durationMinutes}
                heartRateAvg={a.heartRateAvg}
                intensity={a.intensity}
                strainScore={a.strain}
                onPress={() => router.push({ pathname: "/bout-detail", params: { id: a.id } })}
              />
            )
          })
        )}

        {sevenDayStrain.length ? (
          <View style={{ marginTop: 24, padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12, marginHorizontal: 16 }}>
            <Text
              text="STRAIN · 7-DAY"
              size="xxs"
              style={{ color: colors.textDim, letterSpacing: 0.6, marginBottom: 8 }}
            />
            <InlineLineChart
              points={homeView?.strainTrend ?? []}
              width={chartWidth - 28}
              height={120}
              stroke={STRAIN_TINT}
            />
          </View>
        ) : null}

        <View style={{ marginTop: 18, marginHorizontal: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <VitalCard label="Live HR" value={realtimeHeartRate ? `${realtimeHeartRate}` : "--"} unit="bpm" delta={null} />
            <VitalCard label="Stress" value={homeView?.activities.stress ?? "--"} delta={null} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <VitalCard label="Recovery" value={homeView?.todayOverview.dailyBalance ?? "--"} unit="%" delta={null} />
            <VitalCard label="Load Pressure" value={homeView?.todayOverview.loadPressure ?? "--"} delta={null} />
          </View>
        </View>

        <View style={{ marginTop: 18, marginHorizontal: 16, padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
          <TrendSparkline
            label="Strain · 7-day"
            points={sevenDayStrain}
            currentDate={selectedDate}
            color={STRAIN_TINT}
            onPressPoint={(d) => setSelectedDate(d)}
          />
          <View style={{ height: 12 }} />
          <TrendSparkline
            label="Stress · 7-day"
            points={sevenDayStress}
            currentDate={selectedDate}
            color={STRESS_TINT}
            onPressPoint={(d) => setSelectedDate(d)}
          />
        </View>

        <LabsAccordion rows={labsRows} />
      </Animated.ScrollView>
    </View>
  )
}

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 18,
  paddingBottom: 80,
  paddingTop: 12,
})
```

- [ ] **Step 2: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/screens/StrainActivityScreen.tsx
git commit -m "app: StrainActivityScreen rewrite — bout feed + day timeline + candidates"
```

---

## Task 12 — `BoutDetailScreen` + route + HomeScreen navigation

**Files:**
- Create: `apps/app/app/screens/BoutDetailScreen.tsx`
- Create: `apps/app/src/app/(app)/bout-detail.tsx`
- Modify: `apps/app/src/app/(app)/_layout.tsx`
- Modify: `apps/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/app/app/screens/BoutDetailScreen.tsx`:

```tsx
import { FC, useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { SymbolView } from "expo-symbols"
import Svg, { Path, Line } from "react-native-svg"

import { ClassPickerSheet, visualForType } from "@/components/activity"
import { Text } from "@/components/Text"
import { fetchActivityBout, type ActivityBoutDetail, confirmActivity, dismissActivity, deleteActivity } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

function fmtRange(start: Date, end: Date): string {
  const t = (d: Date) => {
    const h = d.getHours(), m = d.getMinutes()
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
  }
  return `${t(start)} → ${t(end)}`
}

export const BoutDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { id } = useLocalSearchParams<{ id: string }>()
  const [bout, setBout] = useState<ActivityBoutDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (typeof id !== "string") return
    fetchActivityBout(id).then(setBout).catch(() => setBout(null))
  }, [id])

  if (!bout) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
        <TopBar />
        <View style={{ padding: 24 }}>
          <Text text="Loading…" style={{ color: colors.textDim }} />
        </View>
      </SafeAreaView>
    )
  }

  const v = visualForType(bout.activityType)
  const isCandidate = bout.source === "candidate"
  const startD = new Date(bout.startTime)
  const endD = new Date(bout.endTime)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {isCandidate ? <CandidateBanner conf={bout.confidence} onConfirm={async () => {
          await confirmActivity(bout.id, bout.activityType)
          router.back()
        }} /> : null}

        <View
          style={[
            styles.hero,
            {
              borderColor: v.tintHex,
              backgroundColor: v.backgroundHex,
            },
          ]}
        >
          <View style={[styles.heroIcon, { backgroundColor: v.tintHex + "55" }]}>
            <SymbolView name={v.sfSymbol as never} size={22} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
          </View>
          <Text text={isCandidate ? `Possible ${bout.activityType}` : bout.activityType}
                style={{ color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 }} />
          <Text text={fmtRange(startD, endD)} style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }} />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 12 }}>
            <Text text={bout.strainScore.toFixed(1)}
                  style={{ color: v.tintHex, fontSize: 38, fontWeight: "800", lineHeight: 38, fontVariant: ["tabular-nums"] }} />
            <Text text={isCandidate ? "est. strain (not counted)" : "/ 21 strain"}
                  style={{ color: colors.textDim, fontSize: 12, fontWeight: "600" }} />
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat label="Duration" value={Math.round(bout.durationMinutes).toString()} unit="min" />
          <Stat label="HR avg" value={Math.round(bout.heartRateAvg).toString()} unit="bpm" />
          <Stat label="HR max" value={Math.round(bout.heartRateMax).toString()} unit="bpm" />
        </View>

        <Section title="Heart rate" meta="over the bout">
          <HrChart samples={bout.hrCurve} tint={v.tintHex} />
        </Section>

        <Section title="HR zones" meta="% of bout">
          <ZoneBar zones={bout.zonePercents} />
          <ZoneLegend minutesPerZone={bout.zoneMinutes} />
        </Section>

        {bout.motionIntensity && bout.motionIntensity.length > 0 ? (
          <Section title="Motion intensity" meta="|Δgravity|">
            <MotionBars samples={bout.motionIntensity} tint={v.tintHex} />
          </Section>
        ) : null}

        <View style={[styles.reclass, { backgroundColor: colors.surfaceCard }]}>
          <Text text={isCandidate ? "Not what you did?" : "Wrong class?"}
                style={{ flex: 1, color: colors.textDim, fontSize: 13 }} />
          <Pressable onPress={() => setSheetOpen(true)}
                     style={[styles.chip, { backgroundColor: v.backgroundHex }]}>
            <View style={[styles.chipIcon, { backgroundColor: v.tintHex + "44" }]}>
              <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
            </View>
            <Text text={isCandidate ? "Pick a class" : bout.activityType}
                  style={{ color: v.tintHex, fontSize: 12, fontWeight: "700" }} />
            <Text text="▾" style={{ color: v.tintHex, fontSize: 9, opacity: 0.7 }} />
          </Pressable>
        </View>

        <Pressable
          onPress={async () => {
            if (isCandidate) {
              await dismissActivity(bout.id)
            } else {
              await deleteActivity(bout.id)
            }
            router.back()
          }}
          style={[styles.destruct, { backgroundColor: colors.surfaceCard }]}
        >
          <Text text={isCandidate ? "Dismiss" : "Delete bout"}
                style={{ color: isCandidate ? colors.textDim : "#ff8a8a", fontSize: 13, fontWeight: "700", textAlign: "center" }} />
        </Pressable>
      </ScrollView>

      <ClassPickerSheet
        visible={sheetOpen}
        currentType={bout.activityType}
        onCancel={() => setSheetOpen(false)}
        onPick={async (t) => {
          setSheetOpen(false)
          await confirmActivity(bout.id, t)
          router.back()
        }}
      />
    </SafeAreaView>
  )
}

const TopBar: FC = () => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.topbar}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text text="← Strain" style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} />
      </Pressable>
      <View />
    </View>
  )
}

const CandidateBanner: FC<{ conf: number; onConfirm: () => Promise<void> }> = ({ conf, onConfirm }) => {
  const candidate = visualForType("Candidate")
  return (
    <View style={[styles.banner, { backgroundColor: candidate.backgroundHex, borderColor: candidate.tintHex }]}>
      <View style={[styles.bannerIcon, { backgroundColor: candidate.tintHex + "44" }]}>
        <SymbolView name="questionmark" size={11} tintColor={candidate.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <View style={{ flex: 1 }}>
        <Text text={`Possible activity · ${Math.round(conf * 100)}% sure`}
              style={{ color: "#c8c7f6", fontSize: 12, fontWeight: "700" }} />
        <Text text="Confirm to count toward your strain"
              style={{ color: "#9492f5", fontSize: 11, marginTop: 1 }} />
      </View>
      <Pressable onPress={onConfirm}
                 style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: candidate.tintHex, borderRadius: 8 }}>
        <Text text="Confirm" style={{ color: "#fff", fontSize: 11, fontWeight: "800" }} />
      </Pressable>
    </View>
  )
}

const Stat: FC<{ label: string; value: string; unit: string }> = ({ label, value, unit }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceCard }]}>
      <Text text={label.toUpperCase()} style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }} />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 6, fontVariant: ["tabular-nums"] }}>
        {value}<Text text={unit} style={{ color: colors.textDim, fontSize: 11, fontWeight: "600", marginLeft: 2 }} />
      </Text>
    </View>
  )
}

const Section: FC<{ title: string; meta?: string; children: React.ReactNode }> = ({ title, meta, children }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={[styles.section, { backgroundColor: colors.surfaceCard }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <Text text={title.toUpperCase()} style={{ color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }} />
        {meta ? <Text text={meta} style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }} /> : null}
      </View>
      {children}
    </View>
  )
}

const HrChart: FC<{ samples: { t: number; hr: number }[]; tint: string }> = ({ samples, tint }) => {
  if (samples.length < 2) return null
  const W = 280, H = 110
  const minHr = Math.min(...samples.map((s) => s.hr)) - 4
  const maxHr = Math.max(...samples.map((s) => s.hr)) + 4
  const tMin = samples[0].t, tMax = samples[samples.length - 1].t
  const x = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * W
  const y = (hr: number) => H - ((hr - minHr) / Math.max(1, maxHr - minHr)) * H
  const d = samples.map((s, i) => `${i === 0 ? "M" : "L"} ${x(s.t).toFixed(1)} ${y(s.hr).toFixed(1)}`).join(" ")
  return (
    <View style={{ height: 110 }}>
      <Svg width="100%" height="110" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={0} y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.5} x2={W} y2={H * 0.5} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#ffffff10" />
        <Path d={d} stroke={tint} strokeWidth={1.8} fill="none" />
      </Svg>
    </View>
  )
}

const ZoneBar: FC<{ zones: number[] }> = ({ zones }) => {
  const colors = ["#4ade80", "#fbbf24", "#ffa42b", "#f87171", "#be123c"]
  const total = zones.reduce((s, v) => s + v, 0) || 1
  return (
    <View style={{ flexDirection: "row", height: 14, borderRadius: 4, overflow: "hidden", backgroundColor: "#ffffff08" }}>
      {zones.map((z, i) => (
        <View key={i} style={{ flex: z / total, backgroundColor: colors[i] }} />
      ))}
    </View>
  )
}

const ZoneLegend: FC<{ minutesPerZone: number[] }> = ({ minutesPerZone }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={{ flexDirection: "row", marginTop: 8 }}>
      {minutesPerZone.map((m, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Text text={`Z${i + 1}`} style={{ color: colors.text, fontSize: 10, fontWeight: "700" }} />
          <Text text={`${Math.round(m)}m`} style={{ color: colors.textDim, fontSize: 10, fontVariant: ["tabular-nums"] }} />
        </View>
      ))}
    </View>
  )
}

const MotionBars: FC<{ samples: number[]; tint: string }> = ({ samples, tint }) => {
  const W = 280, H = 60
  const max = Math.max(...samples, 0.01)
  const barW = W / samples.length
  return (
    <View style={{ height: 60 }}>
      <Svg width="100%" height="60" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {samples.map((v, i) => {
          const h = (v / max) * H
          return (
            <Path
              key={i}
              d={`M ${(i * barW).toFixed(1)} ${H} v ${-h.toFixed(1)} h ${(barW * 0.7).toFixed(1)} v ${h.toFixed(1)} Z`}
              fill={tint}
              opacity={0.25 + (v / max) * 0.75}
            />
          )
        })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  topbar: { padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as ViewStyle,
  banner: {
    marginHorizontal: 16, marginBottom: 14, paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
  } as ViewStyle,
  bannerIcon: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" } as ViewStyle,
  hero: { marginHorizontal: 16, marginBottom: 14, padding: 18, borderWidth: 1, borderRadius: 16 } as ViewStyle,
  heroIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as ViewStyle,
  statRow: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 14 },
  stat: { flex: 1, padding: 12, borderRadius: 12 } as ViewStyle,
  section: { marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 14 } as ViewStyle,
  reclass: {
    marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  } as ViewStyle,
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999 } as ViewStyle,
  chipIcon: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" } as ViewStyle,
  destruct: { marginHorizontal: 16, marginTop: 0, padding: 14, borderRadius: 14 } as ViewStyle,
})

export default BoutDetailScreen
```

- [ ] **Step 2: Add the client APIs the screen calls**

In `apps/app/app/services/api/noopClient.ts`, add the new request helpers + the detail type:

```ts
export type ActivityBoutDetail = {
  id: string
  startTime: string
  endTime: string
  durationMinutes: number
  activityType: string
  intensity: "light" | "moderate" | "hard"
  source: "detected" | "candidate" | "healthkit" | "manual"
  confidence: number
  heartRateAvg: number
  heartRateMax: number
  strainScore: number
  hrCurve: { t: number; hr: number }[]
  zonePercents: number[]
  zoneMinutes: number[]
  motionIntensity?: number[]
}

export async function fetchActivityBout(id: string): Promise<ActivityBoutDetail> {
  return apiGet(`/activities/${encodeURIComponent(id)}`)
}

export async function deleteActivity(id: string): Promise<void> {
  await apiDelete(`/activities/${encodeURIComponent(id)}`)
}
```

(`apiGet` / `apiDelete` follow the same shape as the existing `apiPost` in this file. If `apiDelete` does not yet exist, add one immediately below: `export const apiDelete = (path: string) => fetchSomething(path, { method: 'DELETE' })` following the existing patterns.)

- [ ] **Step 3: Create the route file**

Create `apps/app/src/app/(app)/bout-detail.tsx`:

```tsx
import BoutDetailScreen from "@/screens/BoutDetailScreen"

export default BoutDetailScreen
```

- [ ] **Step 4: Register the route on the Stack**

In `apps/app/src/app/(app)/_layout.tsx`, add the `Stack.Screen` entry next to the other screens:

```tsx
<Stack.Screen
  name="bout-detail"
  options={{ headerShown: false }}
/>
```

- [ ] **Step 5: Wire HomeScreen handleTapePress to navigate on workout taps**

In `apps/app/app/screens/HomeScreen.tsx`, find `handleTapePress` and add a workout branch that navigates to `bout-detail` using the payload's `boutId`:

```ts
const handleTapePress = useCallback((event: TapeEvent) => {
  if (event.type === "workout" && event.payload?.boutId) {
    router.push({ pathname: "/bout-detail", params: { id: event.payload.boutId } })
    return
  }
  if (event.type === "journal" && event.payload?.journalEntryId) {
    // existing journal-tap behaviour unchanged
    router.push({ pathname: "/journal-entry", params: { id: event.payload.journalEntryId } })
    return
  }
  // other event types — keep the existing behaviour (if any)
}, [])
```

(Preserve any existing behaviour for non-workout / non-journal events — the snippet above shows only the workout addition.)

- [ ] **Step 6: Type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/app/screens/BoutDetailScreen.tsx apps/app/src/app/\(app\)/bout-detail.tsx apps/app/src/app/\(app\)/_layout.tsx apps/app/app/screens/HomeScreen.tsx apps/app/app/services/api/noopClient.ts
git commit -m "app: BoutDetailScreen + route + Home tap navigation"
```

---

## Task 13 — Final verification

No code in this task — verification only.

- [ ] **Step 1: Full type-check**

Run: `cd apps/app && pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 2: Run all jest tests**

Run: `cd apps/app && pnpm exec jest`
Expected: PASS for `bout-icons.test.ts` (5 tests), `CandidateDeck.test.tsx` (4 tests), all pre-existing tests still green.

- [ ] **Step 3: Boot the app**

Run: `cd apps/app && pnpm ios` (or pick the iOS simulator from a running `pnpm start`).
Expected: app boots without TS errors at runtime.

- [ ] **Step 4: Visual sanity checklist**

Walk through each surface in the simulator:

- Open the Strain tab. Expect: ScreenHeader → MetricHero with new detail line ("N named · M candidate · K off-wrist · Q active min") → DayTimeline strip → CandidateDeck (if any) → TODAY label → BoutCard / GapRule rows → 7-day chart → vitals → sparklines → Labs accordion.
- Open Home. Scroll to the TODAY section. Expect: workout rows render as BoutCard with class icon + tint; off-wrist rows render as GapRule.
- If there's a pending Candidate, tap the class chip: expect a bottom sheet to slide up with the Rich-10 list, grab handle, "Pick a class" title.
- Tap a workout row: expect navigation to BoutDetailScreen with hero gradient + 3-stat strip + HR curve + zone bar + motion bars + reclassify chip + delete button.
- Confirm a candidate from the deck. Expect: deck counter decrements; confirmed bout appears in the feed at its time slot with no green highlight.
- iOS < 26 / Android: BoutCard, GapRule, DayTimeline, candidate deck all render normally — they use no iOS-26-specific APIs.

If any step fails, file a follow-up task before merging.
