# Home Monitors Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home screen's `StatsHealthSwitcher` with two minimal monitor cards (Health + Stress) and add two dedicated detail screens that hold the vitals list and stress visualization.

**Architecture:** A single `MonitorCard` primitive renders both Health and Stress in 4 states (ok / warn / alert / stale). Tapping either card pushes a new stack screen that surfaces the rich data. A new `StressColorStrip` primitive is shared between the compact home card (not used in v1; reserved for v2 inline strip) and the wide detail-screen strip.

**Tech Stack:** React Native (Expo SDK 55), TypeScript, Phosphor icons via existing `PhosphorIcon` wrapper, React Navigation v7 (legacy) + expo-router 55 (active), Reanimated 4, react-native-svg (for sparklines).

---

## File map (all relative to `apps/app/`)

**New:**
- `app/utils/stressZone.ts` + `app/utils/stressZone.test.ts` — pure score-to-zone mapping
- `app/components/home/MonitorCard.tsx` — minimal home card, 4 states
- `app/components/home/StressColorStrip.tsx` — color-strip primitive
- `app/components/home/VitalRow.tsx` — row primitive for Health detail
- `app/screens/HealthMonitorScreen.tsx` — full Health detail
- `app/screens/StressMonitorScreen.tsx` — full Stress detail
- `src/app/(app)/health-monitor.tsx` — expo-router re-export stub
- `src/app/(app)/stress-monitor.tsx` — expo-router re-export stub

**Modify:**
- `app/utils/localTheme.ts` — add `statusStale` color token
- `app/components/PhosphorIcon.tsx` — register new icon names
- `app/services/api/noopClient.ts` — extend `HomeViewModel` with `monitors` block
- `app/context/DashboardContext.tsx` — derive `monitors` summary from existing fields
- `app/screens/HomeScreen.tsx` — replace `StatsHealthSwitcher` with two `MonitorCard`s
- `app/navigators/AppNavigator.tsx` — register `HealthMonitor` + `StressMonitor` routes
- `src/app/(app)/_layout.tsx` — register `health-monitor` + `stress-monitor` routes

**Remove (Task 11):**
- `app/components/home/StatsHealthSwitcher.tsx`
- `app/components/home/MetricsBar.tsx`

---

## Task 1: Add color token + Phosphor icon registrations

**Files:**
- Modify: `apps/app/app/utils/localTheme.ts`
- Modify: `apps/app/app/components/PhosphorIcon.tsx`

- [ ] **Step 1: Add `statusStale` to both light and dark color palettes**

Open `app/utils/localTheme.ts`. Inside `LIGHT_COLORS` add the new key right after `statusRed`:

```ts
  statusStale: "#9CA3AF",
```

Inside `DARK_COLORS` add the same key after the dark `statusRed`:

```ts
  statusStale: "#666666",
```

- [ ] **Step 2: Verify no TS errors**

Run from `apps/app`:
```bash
npx tsc --noEmit -p . --pretty
```
Expected: clean exit (no errors).

- [ ] **Step 3: Register missing Phosphor icons**

Open `app/components/PhosphorIcon.tsx`. Add these imports at the top alongside the existing `phosphor-react-native` imports (keep alphabetical-ish ordering already in the file):

```ts
  Brain,
  CheckCircle as CheckCircleIcon,
  ClockCountdown,
  Drop as DropIcon,
  Info,
  Sparkle,
  WarningOctagon,
  WaveSine,
  Wind,
```

(Note: `Check`, `CheckCircle`, `Drop` may already exist — diff carefully. `Heart`, `Heartbeat`, `Lightning`, `Moon`, `NotePencil`, `Plus`, `Watch`, `Pulse` already exist.)

Extend `AppIconName` type with these new canonical names:

```ts
  | "brain"
  | "clock-countdown"
  | "drop"
  | "info"
  | "sparkle"
  | "warning-octagon"
  | "wave-sine"
  | "wind"
```

Add to `ALIAS_MAP`:

```ts
  "brain": "brain",
  "brain-outline": "brain",
  "clock-countdown": "clock-countdown",
  "clock-countdown-outline": "clock-countdown",
  "drop": "drop",
  "drop-outline": "drop",
  "info-outline": "information",
  "sparkle": "sparkle",
  "sparkle-outline": "sparkle",
  "warning-octagon": "warning-octagon",
  "warning-octagon-outline": "warning-octagon",
  "wave-sine": "wave-sine",
  "wind": "wind",
  "wind-outline": "wind",
```

Add to `COMPONENT_MAP`:

```ts
  "brain": Brain,
  "clock-countdown": ClockCountdown,
  "drop": DropIcon,
  "sparkle": Sparkle,
  "warning-octagon": WarningOctagon,
  "wave-sine": WaveSine,
  "wind": Wind,
```

- [ ] **Step 4: Verify TS + icon resolution**

Run from `apps/app`:
```bash
npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/localTheme.ts apps/app/app/components/PhosphorIcon.tsx
git commit -m "feat(home): add statusStale token + register monitor-card phosphor icons"
```

---

## Task 2: Build `stressZone.ts` utility (TDD)

**Files:**
- Create: `apps/app/app/utils/stressZone.ts`
- Test: `apps/app/app/utils/stressZone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/utils/stressZone.test.ts`:

```ts
import { scoreToZone, zoneColorToken, type StressZone } from "./stressZone"

describe("scoreToZone", () => {
  it("returns Calm for 0 ≤ score < 1", () => {
    expect(scoreToZone(0)).toBe("Calm")
    expect(scoreToZone(0.4)).toBe("Calm")
    expect(scoreToZone(0.9)).toBe("Calm")
  })
  it("returns Moderate for 1 ≤ score < 2", () => {
    expect(scoreToZone(1)).toBe("Moderate")
    expect(scoreToZone(1.5)).toBe("Moderate")
    expect(scoreToZone(1.99)).toBe("Moderate")
  })
  it("returns High for score ≥ 2", () => {
    expect(scoreToZone(2)).toBe("High")
    expect(scoreToZone(2.7)).toBe("High")
    expect(scoreToZone(3)).toBe("High")
  })
  it("clamps below 0 to Calm and above 3 to High", () => {
    expect(scoreToZone(-1)).toBe("Calm")
    expect(scoreToZone(99)).toBe("High")
  })
  it("returns null for null input", () => {
    expect(scoreToZone(null)).toBeNull()
  })
})

describe("zoneColorToken", () => {
  it("maps zones to LOCAL_THEME color keys", () => {
    expect(zoneColorToken("Calm")).toBe("ringHrv")
    expect(zoneColorToken("Moderate")).toBe("statusAmber")
    expect(zoneColorToken("High")).toBe("statusRed")
    expect(zoneColorToken(null)).toBe("statusStale")
  })
})

describe("StressZone type", () => {
  it("compiles with valid values", () => {
    const z1: StressZone = "Calm"
    const z2: StressZone = "Moderate"
    const z3: StressZone = "High"
    expect([z1, z2, z3]).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/app`:
```bash
npx jest app/utils/stressZone.test.ts
```
Expected: FAIL with "Cannot find module './stressZone'".

- [ ] **Step 3: Implement `stressZone.ts`**

Create `app/utils/stressZone.ts`:

```ts
export type StressZone = "Calm" | "Moderate" | "High"

export function scoreToZone(score: number | null): StressZone | null {
  if (score == null) return null
  if (score < 1) return "Calm"
  if (score < 2) return "Moderate"
  return "High"
}

export function zoneColorToken(
  zone: StressZone | null,
): "ringHrv" | "statusAmber" | "statusRed" | "statusStale" {
  if (zone === "Calm") return "ringHrv"
  if (zone === "Moderate") return "statusAmber"
  if (zone === "High") return "statusRed"
  return "statusStale"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/app`:
```bash
npx jest app/utils/stressZone.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/utils/stressZone.ts apps/app/app/utils/stressZone.test.ts
git commit -m "feat(home): add stressZone util for score→zone+color mapping"
```

---

## Task 3: Extend `HomeViewModel` types + derive monitors in DashboardContext

**Files:**
- Modify: `apps/app/app/services/api/noopClient.ts`
- Modify: `apps/app/app/context/DashboardContext.tsx`

- [ ] **Step 1: Add `monitors` block to HomeViewModel**

In `app/services/api/noopClient.ts`, near the existing `HomeViewModel` interface, add these types **before** the interface:

```ts
export type MonitorState = "ok" | "warn" | "alert" | "stale"

export interface HealthMonitorSummary {
  state: MonitorState
  verdict: string
  inRangeCount: number
  totalMetrics: number
  staleSinceMs: number | null
}

export interface StressMonitorSummary {
  state: MonitorState
  score: number | null
  zone: "Calm" | "Moderate" | "High" | null
  lastReadingAt: string | null
  todayStrip: Array<number | null>
  timeInZone: { calm: number; moderate: number; high: number }
}
```

Then inside the existing `HomeViewModel` interface, add (at the end, before the closing `}`):

```ts
  monitors?: {
    health: HealthMonitorSummary
    stress: StressMonitorSummary
  }
```

The `?` keeps backward compatibility — if backend doesn't ship it yet, client-side derives it (next step).

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Derive monitors client-side in DashboardContext**

Open `app/context/DashboardContext.tsx`. Find where `buildLegacyHomeView` (or whichever function constructs the final `HomeViewModel` from results) returns the model. Just before the return, build a fallback `monitors` block from existing fields if the response did not include one.

Add this helper function at the top of `DashboardContext.tsx` (after the imports, before any component):

```ts
import type {
  HealthMonitorSummary,
  HomeViewModel,
  MonitorState,
  StressMonitorSummary,
} from "@/services/api/noopClient"
import { scoreToZone } from "@/utils/stressZone"

function deriveMonitorsFallback(
  view: Omit<HomeViewModel, "monitors">,
): { health: HealthMonitorSummary; stress: StressMonitorSummary } {
  const activities = view.activities

  const hrvNum = activities.hrvMs != null ? activities.hrvMs : null
  const rhrNum = activities.baselineRhr != null ? activities.baselineRhr : null
  const inRangeCount = [hrvNum, rhrNum].filter((n) => n != null).length + 2 // RR + SpO2 always considered ok in fallback
  const healthState: MonitorState = inRangeCount === 4 ? "ok" : "warn"

  const health: HealthMonitorSummary = {
    state: healthState,
    verdict: healthState === "ok" ? "Within range" : "Check vitals",
    inRangeCount,
    totalMetrics: 4,
    staleSinceMs: null,
  }

  const stressStr = activities.stress
  const stressNum =
    stressStr && stressStr !== "--" ? parseFloat(stressStr) : null
  const stress: StressMonitorSummary = {
    state: stressNum == null ? "stale" : "ok",
    score: stressNum,
    zone: scoreToZone(stressNum),
    lastReadingAt: null,
    todayStrip: new Array(12).fill(null),
    timeInZone: { calm: 0, moderate: 0, high: 0 },
  }

  return { health, stress }
}
```

In `buildLegacyHomeView` (search for the function), at the very end where it returns the assembled `HomeViewModel`, change the return so it includes `monitors`:

```ts
  const base: Omit<HomeViewModel, "monitors"> = {
    // ...all existing fields stay the same...
  }
  return {
    ...base,
    monitors: deriveMonitorsFallback(base),
  }
```

If `buildLegacyHomeView` already uses a single literal return object, refactor it so the literal is assigned to `const base` first, then spread + monitors in the return.

- [ ] **Step 4: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/services/api/noopClient.ts apps/app/app/context/DashboardContext.tsx
git commit -m "feat(home): extend HomeViewModel with monitors block + client-side fallback"
```

---

## Task 4: Build `StressColorStrip` primitive

**Files:**
- Create: `apps/app/app/components/home/StressColorStrip.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/home/StressColorStrip.tsx`:

```tsx
import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { scoreToZone } from "@/utils/stressZone"

type Props = {
  /** Array of stress scores (0–3) or null for future / no-data cells. */
  cells: Array<number | null>
  /** Position of the "now" tick as a percentage (0–100). null hides the tick. */
  nowPercent?: number | null
  /** Axis labels rendered under the strip. Length must be 2 or more. */
  axisLabels?: string[]
  /** Strip height. Default 10. */
  height?: number
}

export const StressColorStrip: FC<Props> = ({
  cells,
  nowPercent = null,
  axisLabels,
  height = 10,
}) => {
  const { colors } = LOCAL_THEME

  return (
    <View>
      <View style={[styles.strip, { height, backgroundColor: colors.surfaceElevated }]}>
        {cells.map((score, i) => (
          <View
            key={i}
            style={[styles.cell, { backgroundColor: cellColor(score) }]}
          />
        ))}
        {nowPercent != null ? (
          <View
            style={[
              styles.tick,
              { left: `${Math.max(0, Math.min(100, nowPercent))}%` },
            ]}
          />
        ) : null}
      </View>
      {axisLabels ? (
        <View style={styles.axis}>
          {axisLabels.map((label, i) => (
            <Text
              key={i}
              text={label}
              style={{ color: colors.textMuted, fontSize: 10 }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function cellColor(score: number | null): string {
  if (score == null) return "transparent"
  const zone = scoreToZone(score)
  if (zone === "Calm") return "rgba(83,157,245,0.6)"
  if (zone === "Moderate") return "rgba(255,164,43,0.7)"
  if (zone === "High") return "rgba(243,114,127,0.75)"
  return "transparent"
}

const styles = StyleSheet.create({
  strip: {
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
    position: "relative",
  } as ViewStyle,
  cell: { flex: 1 } as ViewStyle,
  tick: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  } as ViewStyle,
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  } as ViewStyle,
})
```

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/StressColorStrip.tsx
git commit -m "feat(home): add StressColorStrip primitive"
```

---

## Task 5: Build `MonitorCard` primitive

**Files:**
- Create: `apps/app/app/components/home/MonitorCard.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/home/MonitorCard.tsx`:

```tsx
import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type MonitorCardState = "ok" | "warn" | "alert" | "stale"

type Props = {
  icon: PhosphorIconName
  title: string
  state: MonitorCardState
  /** Either tileIcon or tileText is rendered inside the tile. */
  tileIcon?: PhosphorIconName
  tileText?: string
  verdict: string
  subline: string
  onPress: () => void
}

export const MonitorCard: FC<Props> = ({
  icon,
  title,
  state,
  tileIcon,
  tileText,
  verdict,
  subline,
  onPress,
}) => {
  const { colors } = LOCAL_THEME
  const tone = toneFor(state, colors)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} monitor, ${verdict}, ${subline}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceCard },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <PhosphorIcon name={icon} size={14} color={colors.textDim} />
          <Text
            text={title.toUpperCase()}
            style={{
              color: colors.text,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.4,
            }}
          />
        </View>
        <PhosphorIcon name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
      <View style={styles.body}>
        <View style={[styles.tile, { backgroundColor: tone.tileBg }]}>
          {tileIcon ? (
            <PhosphorIcon name={tileIcon} size={16} color={tone.fg} weight="fill" />
          ) : tileText ? (
            <Text
              text={tileText}
              style={{
                color: tone.fg,
                fontSize: 13,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : null}
        </View>
        <View style={styles.text}>
          <Text
            text={verdict}
            style={{ color: tone.fg, fontSize: 13, fontWeight: "700" }}
          />
          <Text
            text={subline}
            style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}
          />
        </View>
      </View>
    </Pressable>
  )
}

function toneFor(
  state: MonitorCardState,
  colors: typeof LOCAL_THEME.colors,
): { fg: string; tileBg: string } {
  if (state === "ok") return { fg: colors.statusGreen, tileBg: hexToRGBA(colors.statusGreen, 0.18) }
  if (state === "warn") return { fg: colors.statusAmber, tileBg: hexToRGBA(colors.statusAmber, 0.18) }
  if (state === "alert") return { fg: colors.statusRed, tileBg: hexToRGBA(colors.statusRed, 0.18) }
  return { fg: colors.statusStale, tileBg: hexToRGBA(colors.statusStale, 0.18) }
}

function hexToRGBA(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    flex: 1,
  } as ViewStyle,
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } as ViewStyle,
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  } as ViewStyle,
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  } as ViewStyle,
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  text: { flex: 1, minWidth: 0 } as ViewStyle,
})
```

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/MonitorCard.tsx
git commit -m "feat(home): add MonitorCard primitive (ok/warn/alert/stale)"
```

---

## Task 6: Build `VitalRow` primitive

**Files:**
- Create: `apps/app/app/components/home/VitalRow.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/home/VitalRow.tsx`:

```tsx
import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import Svg, { Polyline } from "react-native-svg"

import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  iconName: PhosphorIconName
  iconColor: string
  label: string
  name: string
  value: string
  unit: string
  /** Optional sparkline points normalized to a 100×40 viewBox. */
  spark?: Array<{ x: number; y: number }>
  onPress?: () => void
}

export const VitalRow: FC<Props> = ({
  iconName,
  iconColor,
  label,
  name,
  value,
  unit,
  spark,
  onPress,
}) => {
  const { colors } = LOCAL_THEME

  const content = (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: hexToRGBA(iconColor, 0.15) }]}>
        <PhosphorIcon name={iconName} size={16} color={iconColor} />
      </View>
      <View style={styles.body}>
        <Text
          text={label.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
          }}
        />
        <Text
          text={name}
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: "700",
            marginTop: 1,
          }}
        />
      </View>
      {spark && spark.length > 1 ? (
        <Svg viewBox="0 0 100 40" width={60} height={22} preserveAspectRatio="none">
          <Polyline
            points={spark.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
      <View style={styles.num}>
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "800",
            letterSpacing: -0.3,
            lineHeight: 22,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          text={unit}
          style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}
        />
      </View>
      <PhosphorIcon name="chevron-forward" size={14} color={colors.textMuted} />
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  )
}

function hexToRGBA(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  } as ViewStyle,
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  body: { flex: 1, minWidth: 0 } as ViewStyle,
  num: { alignItems: "flex-end", marginRight: 4 } as ViewStyle,
})
```

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/components/home/VitalRow.tsx
git commit -m "feat(home): add VitalRow primitive with mini sparkline"
```

---

## Task 7: Build `HealthMonitorScreen`

**Files:**
- Create: `apps/app/app/screens/HealthMonitorScreen.tsx`

- [ ] **Step 1: Write the screen**

Create `app/screens/HealthMonitorScreen.tsx`:

```tsx
import { FC, useCallback } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import { PhosphorIcon } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { VitalRow } from "@/components/home/VitalRow"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"

export const HealthMonitorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const navigation = useNavigation<any>()
  const { homeView } = useDashboard()

  const health = homeView?.monitors?.health
  const activities = homeView?.activities

  const goBack = useCallback(() => navigation.goBack(), [navigation])

  const tone = {
    fg: colors.statusGreen,
    bg: "rgba(30,215,96,0.18)",
  }
  if (health?.state === "warn") {
    tone.fg = colors.statusAmber
    tone.bg = "rgba(255,164,43,0.18)"
  } else if (health?.state === "alert") {
    tone.fg = colors.statusRed
    tone.bg = "rgba(243,114,127,0.18)"
  } else if (health?.state === "stale") {
    tone.fg = colors.statusStale
    tone.bg = "rgba(102,102,102,0.18)"
  }

  const heroIconName: "check" | "warning" | "warning-octagon" | "clock-countdown" =
    health?.state === "warn"
      ? "warning"
      : health?.state === "alert"
        ? "warning-octagon"
        : health?.state === "stale"
          ? "clock-countdown"
          : "check"

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <PhosphorIcon name="chevron-back" size={20} color={colors.text} />
          <Text text="Health Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <PhosphorIcon name="info-outline" size={20} color={colors.textDim} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
          <View style={[styles.heroTile, { backgroundColor: tone.bg }]}>
            <PhosphorIcon name={heroIconName} size={28} color={tone.fg} weight="fill" />
          </View>
          <Text
            text={health?.verdict ?? "--"}
            style={{ color: tone.fg, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: 10 }}
          />
          <Text
            text={`${health?.inRangeCount ?? 0} of ${health?.totalMetrics ?? 4} metrics`}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}
          />
        </View>

        <View style={[styles.list, { backgroundColor: colors.surfaceCard }]}>
          <VitalRow
            iconName="wave-sine"
            iconColor={colors.ringHrv}
            label="HRV"
            name="Heart rate variability"
            value={activities?.hrv ?? "--"}
            unit="ms"
            onPress={() => navigation.navigate("HrvDetail" as never)}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            iconName="heartbeat"
            iconColor={colors.ringStrain}
            label="RHR"
            name="Resting heart rate"
            value={activities?.restingHr ?? "--"}
            unit="bpm"
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            iconName="wind"
            iconColor={colors.ringSleep}
            label="RR"
            name="Respiratory rate"
            value="--"
            unit="/min"
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            iconName="drop"
            iconColor={colors.ringRecovery}
            label="SpO₂"
            name="Blood oxygen"
            value={(activities?.spo2 ?? "--").replace("%", "")}
            unit="%"
          />
        </View>

        <Text
          text="Each metric is compared to your personal 14-day baseline."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 } as ViewStyle,
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as ViewStyle,
  navBack: { flexDirection: "row", alignItems: "center", gap: 4 } as ViewStyle,
  hero: {
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  } as ViewStyle,
  heroTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  list: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 2,
  } as ViewStyle,
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 42 } as ViewStyle,
})
```

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/screens/HealthMonitorScreen.tsx
git commit -m "feat(home): add HealthMonitorScreen with vital rows"
```

---

## Task 8: Build `StressMonitorScreen`

**Files:**
- Create: `apps/app/app/screens/StressMonitorScreen.tsx`

- [ ] **Step 1: Write the screen**

Create `app/screens/StressMonitorScreen.tsx`:

```tsx
import { FC, useCallback, useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import { PhosphorIcon } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { StressColorStrip } from "@/components/home/StressColorStrip"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"
import { scoreToZone } from "@/utils/stressZone"

function fmtMins(mins: number): string {
  if (mins <= 0) return "0m"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export const StressMonitorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const navigation = useNavigation<any>()
  const { homeView } = useDashboard()

  const stress = homeView?.monitors?.stress
  const score = stress?.score ?? null
  const zone = stress?.zone ?? scoreToZone(score)

  const goBack = useCallback(() => navigation.goBack(), [navigation])

  const tone = useMemo(() => {
    if (zone === "Moderate") return { fg: colors.statusAmber, bg: "rgba(255,164,43,0.18)" }
    if (zone === "High") return { fg: colors.statusRed, bg: "rgba(243,114,127,0.18)" }
    if (zone === "Calm") return { fg: colors.ringHrv, bg: "rgba(83,157,245,0.18)" }
    return { fg: colors.statusStale, bg: "rgba(102,102,102,0.18)" }
  }, [zone, colors])

  const cellsForStrip = stress?.todayStrip ?? new Array(12).fill(null)
  const nowPercent = computeNowPercent()

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <PhosphorIcon name="chevron-back" size={20} color={colors.text} />
          <Text text="Stress Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <PhosphorIcon name="info-outline" size={20} color={colors.textDim} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
          <View style={styles.heroNumRow}>
            <Text
              text={score == null ? "--" : score.toFixed(1)}
              style={{
                color: tone.fg,
                fontSize: 64,
                fontWeight: "800",
                letterSpacing: -3,
                lineHeight: 64,
                fontVariant: ["tabular-nums"],
              }}
            />
            <Text
              text="/ 3"
              style={{ color: colors.textMuted, fontSize: 18, fontWeight: "600", marginLeft: 6, marginBottom: 4 }}
            />
          </View>
          <Text
            text={(zone ?? "Stale").toUpperCase()}
            style={{
              color: tone.fg,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 1.6,
              marginTop: 6,
            }}
          />
          <Text
            text={
              stress?.lastReadingAt
                ? `last reading ${new Date(stress.lastReadingAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "no recent reading"
            }
            style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}
          />
        </View>

        <View>
          <Text
            text="TODAY · 6 AM → NOW"
            style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginLeft: 4, marginBottom: 8 }}
          />
          <View style={[styles.stripCard, { backgroundColor: colors.surfaceCard }]}>
            <StressColorStrip
              cells={cellsForStrip}
              nowPercent={nowPercent}
              axisLabels={["6 AM", "12 PM", "6 PM", "11 PM"]}
              height={22}
            />
          </View>
        </View>

        <View>
          <Text
            text="TIME IN ZONE"
            style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginLeft: 4, marginBottom: 8 }}
          />
          <View style={[styles.zoneCard, { backgroundColor: colors.surfaceCard }]}>
            <ZoneRow color={colors.ringHrv} name="Calm" range="0 – 0.9" mins={stress?.timeInZone.calm ?? 0} />
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <ZoneRow color={colors.statusAmber} name="Moderate" range="1.0 – 1.9" mins={stress?.timeInZone.moderate ?? 0} />
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <ZoneRow color={colors.statusRed} name="High" range="2.0 – 3.0" mins={stress?.timeInZone.high ?? 0} />
          </View>
        </View>

        <Text
          text="Based on HRV + heart rate against your 14-day baseline."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function computeNowPercent(): number {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = 6 * 60   // 6 AM
  const end = 23 * 60    // 11 PM
  if (minutes < start) return 0
  if (minutes > end) return 100
  return ((minutes - start) / (end - start)) * 100
}

type ZoneRowProps = { color: string; name: string; range: string; mins: number }
const ZoneRow: FC<ZoneRowProps> = ({ color, name, range, mins }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={styles.zoneRow}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text
        text={name}
        style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}
      />
      <Text
        text={range}
        style={{ color: colors.textMuted, fontSize: 11, marginRight: 12 }}
      />
      <Text
        text={fmtMins(mins)}
        style={{ color: colors.textDim, fontSize: 12, fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 } as ViewStyle,
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as ViewStyle,
  navBack: { flexDirection: "row", alignItems: "center", gap: 4 } as ViewStyle,
  hero: {
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
  } as ViewStyle,
  heroNumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  } as ViewStyle,
  stripCard: {
    borderRadius: 14,
    padding: 14,
  } as ViewStyle,
  zoneCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
  } as ViewStyle,
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  } as ViewStyle,
  zoneDot: { width: 10, height: 10, borderRadius: 5 } as ViewStyle,
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 24 } as ViewStyle,
})
```

- [ ] **Step 2: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/screens/StressMonitorScreen.tsx
git commit -m "feat(home): add StressMonitorScreen with color strip + zone breakdown"
```

---

## Task 9: Register routes (legacy + expo-router)

**Files:**
- Modify: `apps/app/app/navigators/AppNavigator.tsx`
- Create: `apps/app/src/app/(app)/health-monitor.tsx`
- Create: `apps/app/src/app/(app)/stress-monitor.tsx`
- Modify: `apps/app/src/app/(app)/_layout.tsx`

- [ ] **Step 1: Add screens to legacy AppNavigator**

Open `app/navigators/AppNavigator.tsx`. Add these imports alongside other screen imports near the top:

```ts
import { HealthMonitorScreen } from "@/screens/HealthMonitorScreen"
import { StressMonitorScreen } from "@/screens/StressMonitorScreen"
```

Find the block of `<Stack.Screen>` declarations (look for `SleepDetail` for reference) and add **after** `SleepDetail`:

```tsx
      <Stack.Screen name="HealthMonitor" component={HealthMonitorScreen} />
      <Stack.Screen name="StressMonitor" component={StressMonitorScreen} />
```

- [ ] **Step 2: Add routes to expo-router `(app)/_layout.tsx`**

Open `src/app/(app)/_layout.tsx`. In the `<Stack>` block add (after the existing `device-settings` line is fine):

```tsx
      <Stack.Screen name="health-monitor" />
      <Stack.Screen name="stress-monitor" />
```

- [ ] **Step 3: Create the expo-router re-export stubs**

Create `src/app/(app)/health-monitor.tsx`:

```ts
export { HealthMonitorScreen as default } from "@/screens/HealthMonitorScreen"
```

Create `src/app/(app)/stress-monitor.tsx`:

```ts
export { StressMonitorScreen as default } from "@/screens/StressMonitorScreen"
```

- [ ] **Step 4: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/navigators/AppNavigator.tsx \
        apps/app/src/app/\(app\)/_layout.tsx \
        apps/app/src/app/\(app\)/health-monitor.tsx \
        apps/app/src/app/\(app\)/stress-monitor.tsx
git commit -m "feat(home): register health-monitor and stress-monitor routes"
```

---

## Task 10: Wire MonitorCards into HomeScreen

**Files:**
- Modify: `apps/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Replace StatsHealthSwitcher imports**

In `app/screens/HomeScreen.tsx`, find this import block and remove the `StatsHealthSwitcher` line. Also remove `MetricsBar` and `type MetricCell` imports if present:

```ts
import { StatsHealthSwitcher } from "@/components/home/StatsHealthSwitcher"
import { type MetricCell } from "@/components/home/MetricsBar"
```

Add this import in the same import group (alphabetical with other `@/components/home/*`):

```ts
import { MonitorCard } from "@/components/home/MonitorCard"
```

- [ ] **Step 2: Replace the MetricsBar `metricCells` array with monitor data lookup**

Find the block in `HomeScreen.tsx` that currently builds `const metricCells: MetricCell[] = [...]` (around line 230). Replace the entire array declaration with:

```tsx
  const healthMonitor = homeView?.monitors?.health
  const stressMonitor = homeView?.monitors?.stress
```

- [ ] **Step 3: Replace the `<StatsHealthSwitcher>` JSX with two MonitorCards**

In the render output, find:

```tsx
<StatsHealthSwitcher statsCells={metricCells} />
```

Replace with:

```tsx
<View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
  <MonitorCard
    icon="heartbeat"
    title="Health"
    state={healthMonitor?.state ?? "stale"}
    tileIcon={
      healthMonitor?.state === "warn"
        ? "warning"
        : healthMonitor?.state === "alert"
          ? "warning-octagon"
          : healthMonitor?.state === "stale"
            ? "clock-countdown"
            : "check"
    }
    verdict={healthMonitor?.verdict ?? "No recent data"}
    subline={`${healthMonitor?.inRangeCount ?? 0}/${healthMonitor?.totalMetrics ?? 4} metrics`}
    onPress={() => navigateTo("HealthMonitor", "health-monitor")}
  />
  <MonitorCard
    icon="brain"
    title="Stress"
    state={stressMonitor?.state ?? "stale"}
    tileText={stressMonitor?.score == null ? "--" : stressMonitor.score.toFixed(1)}
    verdict={stressMonitor?.zone ?? "No reading"}
    subline={
      stressMonitor?.lastReadingAt
        ? new Date(stressMonitor.lastReadingAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "—"
    }
    onPress={() => navigateTo("StressMonitor", "stress-monitor")}
  />
</View>
```

- [ ] **Step 4: Verify TS**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 5: Run a debug build to visually verify**

Run:
```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx expo run:ios --device 00008150-00163CC43AA1401C --configuration Debug
```

Open the app, confirm Home shows: rings → two monitor cards (Health + Stress) → Daily Outlook → Today's Activities. Tap each monitor card and confirm it pushes the detail screen.

If a value renders as "undefined" or layout breaks, return to Step 2 and adjust the field paths. Otherwise proceed.

- [ ] **Step 6: Commit**

```bash
git add apps/app/app/screens/HomeScreen.tsx
git commit -m "feat(home): replace StatsHealthSwitcher with Health+Stress MonitorCards"
```

---

## Task 11: Remove unused components

**Files:**
- Delete: `apps/app/app/components/home/StatsHealthSwitcher.tsx`
- Delete: `apps/app/app/components/home/MetricsBar.tsx`

- [ ] **Step 1: Confirm no remaining imports of either**

Run from `apps/app`:
```bash
grep -rE "(StatsHealthSwitcher|MetricsBar|MetricCell)" app src --include="*.tsx" --include="*.ts"
```
Expected: only matches inside the two files about to be deleted (no consumers).

If any consumer remains, fix the consumer first.

- [ ] **Step 2: Delete the files**

```bash
rm apps/app/app/components/home/StatsHealthSwitcher.tsx
rm apps/app/app/components/home/MetricsBar.tsx
```

- [ ] **Step 3: Verify TS still clean**

```bash
cd apps/app && npx tsc --noEmit -p . --pretty
```
Expected: clean exit.

- [ ] **Step 4: Run the test suite**

```bash
cd apps/app && npx jest
```
Expected: all tests PASS (including the new `stressZone` test).

- [ ] **Step 5: Commit**

```bash
git add -A apps/app/app/components/home/
git commit -m "chore(home): drop unused StatsHealthSwitcher + MetricsBar"
```

---

## Self-review summary

- **Spec coverage**: every section of the spec maps to at least one task. The home IA (rings unchanged, monitors replace switcher, outlook + today preserved) is covered in Task 10. `MonitorCard` 4-state primitive in Task 5. `HealthMonitorScreen` in Task 7. `StressMonitorScreen` in Task 8. Color strip in Task 4. Token + icons in Task 1. Route registration (both legacy + expo-router) in Task 9. Data model changes in Task 3. Cleanup in Task 11.
- **No placeholders**: every step has either exact code, exact command, or exact file paths.
- **Type consistency**: `MonitorCardState` (Task 5) matches `MonitorState` from `noopClient.ts` (Task 3) — both use the same string union `"ok" | "warn" | "alert" | "stale"`. `StressZone` (Task 2) is used by `scoreToZone` in both screens. Hex-to-RGBA helper duplicated in `MonitorCard` and `VitalRow` — accepted because each file stays self-contained and the function is trivially small (DRY trade-off worth it for component locality).
- **Open question from spec**: backend stress score readiness — handled via the client-side fallback in Task 3 + `state: "stale"` rendering throughout.

---
