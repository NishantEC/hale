# Sleep Detail Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Sleep tab into a flat, score-led detail screen pushed from the Home tab's sleep card.

**Architecture:** Remove Sleep from the bottom tab bar. Add `SleepDetail` as a stack screen in `AppNavigator` that receives `{ date: string }`. Rewrite the screen content as a flat layout (no GlassCards) with: hero score, hypnogram, key metrics row, HR chart, trends, and conditional insights.

**Tech Stack:** React Native, React Navigation (native stack + bottom tabs), react-native-reanimated, existing chart components (HypnogramChart, SleepHeartRateChart, InlineLineChart, BarSeriesChart)

---

### Task 1: Add `SleepDetail` route to navigation types

**Files:**
- Modify: `app/app/navigators/navigationTypes.ts:15-37`

- [ ] **Step 1: Add SleepDetail to AppStackParamList**

```typescript
// In AppStackParamList, add after JournalHistory:
  SleepDetail: { date: string }
```

The full type becomes:

```typescript
export type AppStackParamList = {
  Main: undefined
  Login: undefined
  HomeMetric: {
    metric:
      | "sleep"
      | "recovery"
      | "readiness"
      | "strain"
      | "stress"
      | "loadPressure"
      | "liveHeartRate"
      | "activities"
  }
  HomeDetails: undefined
  StrainActivity: undefined
  DeviceSettings: undefined
  DebugInspector: undefined
  JournalEntry: undefined
  JournalHistory: undefined
  SleepDetail: { date: string }
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/navigators/navigationTypes.ts
git commit -m "feat: add SleepDetail route to navigation types"
```

---

### Task 2: Remove Sleep tab from MainNavigator

**Files:**
- Modify: `app/app/navigators/MainNavigator.tsx`

- [ ] **Step 1: Remove Sleep from TAB_CONFIG and Tab.Screen**

Remove the `SleepScreen` import and Sleep entry from TAB_CONFIG. Remove the Sleep Tab.Screen.

The file becomes:

```typescript
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { Platform, View } from "react-native"

import { DeviceScreen } from "@/screens/DeviceScreen"
import { HomeScreen } from "@/screens/HomeScreen"
import { TrendsScreen } from "@/screens/TrendsScreen"
import { useAppTheme } from "@/theme/context"

const Tab = createBottomTabNavigator()
const ACCENT = "#C3E0FF"

const TAB_CONFIG = {
  Home: { icon: "home-outline", activeIcon: "home", label: "Home" },
  Trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
  Device: { icon: "radio-outline", activeIcon: "radio", label: "Device" },
} as const

export function MainNavigator() {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        return {
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: "transparent",
            borderTopColor: "rgba(255,255,255,0.08)",
            borderTopWidth: Platform.OS === "ios" ? 0.6 : 1,
            elevation: 0,
            position: "absolute",
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                tint="systemChromeMaterialDark"
                intensity={80}
                style={{ flex: 1, backgroundColor: "rgba(12,12,16,0.28)" }}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.background }} />
            ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? config.activeIcon : config.icon}
              size={22}
              color={color}
            />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: "#0A0A0C" },
          tabBarLabel: config.label,
        }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Trends" component={TrendsScreen} />
      <Tab.Screen name="Device" component={DeviceScreen} />
    </Tab.Navigator>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/navigators/MainNavigator.tsx
git commit -m "feat: remove Sleep tab from bottom navigator"
```

---

### Task 3: Register SleepDetail screen in AppNavigator

**Files:**
- Modify: `app/app/navigators/AppNavigator.tsx`

- [ ] **Step 1: Add SleepDetailScreen import and Stack.Screen**

Add the import at the top alongside other screen imports:

```typescript
import { SleepDetailScreen } from "@/screens/SleepDetailScreen"
```

Add the screen inside `AppStack`, after the `JournalHistory` screen:

```typescript
      <Stack.Screen name="SleepDetail" component={SleepDetailScreen} />
```

- [ ] **Step 2: Commit**

```bash
git add app/app/navigators/AppNavigator.tsx
git commit -m "feat: register SleepDetail screen in AppNavigator"
```

---

### Task 4: Update HomeScreen navigation to push SleepDetail

**Files:**
- Modify: `app/app/screens/HomeScreen.tsx:277`

- [ ] **Step 1: Change sleep card onPress to navigate to SleepDetail**

Find the sleep item in the `PrimaryMetricsList` items array (~line 277):

```typescript
onPress: () => navigateTo("Sleep", "sleep"),
```

Replace with:

```typescript
onPress: () => navigation.navigate("SleepDetail", { date: selectedDate }),
```

Where `selectedDate` is already available in HomeScreen's scope (it comes from `useDashboard()` — check the destructured value). If it's accessed via `homeView?.selectedDate`, use that:

```typescript
onPress: () => navigation.navigate("SleepDetail" as any, { date: homeView?.selectedDate ?? selectedDate }),
```

Note: The `as any` cast avoids type issues since `navigateTo` abstracts over the navigator type. We'll use the raw `navigation.navigate` here with the stack param type. If TypeScript complains, use:

```typescript
onPress: () => (navigation as any).navigate("SleepDetail", { date: selectedDate }),
```

- [ ] **Step 2: Commit**

```bash
git add app/app/screens/HomeScreen.tsx
git commit -m "feat: navigate to SleepDetail from home sleep card"
```

---

### Task 5: Create SleepDetailScreen

**Files:**
- Create: `app/app/screens/SleepDetailScreen.tsx`

This is the main deliverable. The screen is a flat, card-free layout with sections separated by spacing.

- [ ] **Step 1: Create the SleepDetailScreen file**

```typescript
import { FC, useEffect, useMemo, useRef } from "react"
import {
  RefreshControl,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { HypnogramChart } from "@/components/HypnogramChart"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Screen } from "@/components/Screen"
import { SleepHeartRateChart } from "@/components/SleepHeartRateChart"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import type { AppStackParamList } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const ACCENT = "#BDD7FF"

type SleepDetailRouteProp = RouteProp<AppStackParamList, "SleepDetail">

export const SleepDetailScreen: FC = () => {
  const { themed } = useAppTheme()
  const { width } = useWindowDimensions()
  const navigation = useNavigation()
  const route = useRoute<SleepDetailRouteProp>()
  const { date } = route.params

  const {
    sleepView,
    isRefreshing,
    error,
    refreshDashboard,
    clearError,
  } = useDashboard()

  const lastShownError = useRef<string | null>(null)

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  const chartWidth = width - 48 // 24px padding each side

  const formattedDate = useMemo(() => {
    const d = new Date(date + "T12:00:00")
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  }, [date])

  // Derive hero score from sleepScoreTrend — last point matching this date, or the latest
  const heroScore = useMemo(() => {
    if (!sleepView) return null
    const todayPoint = sleepView.sleepScoreTrend.find((p) => p.timestamp.startsWith(date))
    const point = todayPoint ?? sleepView.sleepScoreTrend[sleepView.sleepScoreTrend.length - 1]
    if (!point) return null
    return Math.round(point.value)
  }, [sleepView, date])

  const qualityLabel = useMemo(() => {
    if (heroScore == null) return ""
    if (heroScore >= 80) return "Good"
    if (heroScore >= 60) return "Fair"
    return "Poor"
  }, [heroScore])

  const qualityColor = useMemo(() => {
    if (heroScore == null) return "rgba(255,255,255,0.5)"
    if (heroScore >= 80) return "#57D37C"
    if (heroScore >= 60) return "#FFD666"
    return "#FF7F7F"
  }, [heroScore])

  // Pick 4 key metrics from the metrics array
  const keyMetrics = useMemo(() => {
    if (!sleepView) return []
    const wanted = ["Efficiency", "Sleep Latency", "Avg HR", "HRV Drop"]
    return wanted
      .map((label) => sleepView.metrics.find((m) => m.label === label))
      .filter(Boolean) as Array<{ label: string; value: string; detail: string | null }>
  }, [sleepView])

  if (!sleepView) {
    return (
      <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <NavBar formattedDate={formattedDate} onBack={() => navigation.goBack()} />
        <View style={themed($emptyState)}>
          <Text text="No sleep data" size="lg" weight="semiBold" style={themed($emptyTitle)} />
          <Text text="Sync your strap to see your sleep breakdown." size="xs" style={themed($muted)} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={themed($container)}
      ScrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshDashboard}
            tintColor={ACCENT}
          />
        ),
      }}
    >
      {/* Nav Bar */}
      <NavBar formattedDate={formattedDate} onBack={() => navigation.goBack()} />

      {/* Hero Score */}
      {heroScore != null ? (
        <View style={themed($heroSection)}>
          <Text
            text={`${heroScore}`}
            style={[themed($heroScore), { color: qualityColor }]}
          />
          <Text text={qualityLabel} size="xs" weight="semiBold" style={{ color: qualityColor }} />
          <Text text={sleepView.header.duration} size="sm" style={themed($muted)} />
        </View>
      ) : (
        <View style={themed($heroSection)}>
          <Text text={sleepView.header.duration} size="xxl" weight="bold" style={themed($heroScore)} />
          <Text
            text={`${sleepView.header.bedtime} — ${sleepView.header.wakeTime}`}
            size="xs"
            style={themed($muted)}
          />
        </View>
      )}

      {/* Hypnogram */}
      {sleepView.epochTimeline.length > 0 ? (
        <View style={themed($section)}>
          <HypnogramChart
            epochs={sleepView.epochTimeline}
            width={chartWidth}
            bedtimeLabel={sleepView.header.bedtime}
            wakeTimeLabel={sleepView.header.wakeTime}
          />
        </View>
      ) : null}

      {/* Key Metrics Row */}
      {keyMetrics.length > 0 ? (
        <View style={themed($metricsRow)}>
          {keyMetrics.map((metric) => (
            <View key={metric.label} style={themed($metricItem)}>
              <Text text={metric.label} size="xxs" style={themed($metricLabel)} />
              <Text text={metric.value} size="sm" weight="semiBold" style={themed($metricValue)} />
            </View>
          ))}
        </View>
      ) : null}

      {/* Heart Rate Chart */}
      {sleepView.hrChart.samples.length > 0 ? (
        <View style={themed($section)}>
          <Text text="HEART RATE" size="xxs" weight="bold" style={themed($sectionLabel)} />
          <SleepHeartRateChart
            samples={sleepView.hrChart.samples}
            epochs={sleepView.epochTimeline}
            width={chartWidth}
            height={120}
          />
          <View style={themed($chartAxis)}>
            <Text text={sleepView.header.bedtime} size="xxs" style={themed($axisText)} />
            <Text text={sleepView.header.wakeTime} size="xxs" style={themed($axisText)} />
          </View>
        </View>
      ) : null}

      {/* Trends — 7 Nights */}
      <View style={themed($trendsRow)}>
        <View style={themed($trendCol)}>
          <Text text="DURATION — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionLabel)} />
          <BarSeriesChart
            points={sleepView.durationTrend.samples}
            width={(chartWidth - 16) / 2}
            height={80}
            fill={ACCENT}
            referenceValue={sleepView.durationTrend.targetHours}
          />
        </View>
        <View style={themed($trendCol)}>
          <Text text="SCORE — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionLabel)} />
          <InlineLineChart
            points={sleepView.sleepScoreTrend}
            width={(chartWidth - 16) / 2}
            height={80}
            stroke={ACCENT}
          />
        </View>
      </View>

      {/* Factor Insights */}
      {sleepView.factorInsights.length > 0 ? (
        <View style={themed($section)}>
          <Text text="INSIGHTS" size="xxs" weight="bold" style={themed($sectionLabel)} />
          {sleepView.factorInsights.map((insight) => (
            <View key={insight.factorTag} style={themed($insightRow)}>
              <Text text={insight.factorTag} size="xs" weight="semiBold" style={themed($insightTag)} />
              <View style={themed($insightRight)}>
                {insight.deepDelta ? (
                  <Text text={insight.deepDelta} size="xxs" style={themed($insightPositive)} />
                ) : null}
                {insight.remDelta ? (
                  <Text text={insight.remDelta} size="xxs" style={themed($insightNeutral)} />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  )
}

// ── Sub-components ──────────────────────────────────────────

function NavBar({ formattedDate, onBack }: { formattedDate: string; onBack: () => void }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($navBar)}>
      <TouchableOpacity onPress={onBack} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      <Text text="Sleep" size="lg" weight="semiBold" style={themed($navTitle)} />
      <Text text={formattedDate} size="xs" style={themed($navDate)} />
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 48,
  paddingHorizontal: 24,
  paddingTop: 8,
})

const $navBar: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
})

const $navTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
  flex: 1,
})

const $navDate: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
})

const $heroSection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 4,
})

const $heroScore: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.98)",
  fontSize: 56,
  fontWeight: "800",
  lineHeight: 64,
})

const $muted: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
})

const $emptyState: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 8,
  paddingTop: 80,
})

const $emptyTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
})

const $section: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

const $sectionLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.8,
})

const $metricsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
})

const $metricItem: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 4,
})

const $metricLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.45)",
})

const $metricValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
})

const $chartAxis: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
})

const $axisText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.35)",
})

const $trendsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 16,
})

const $trendCol: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 8,
})

const $insightRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 12,
})

const $insightTag: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
  flex: 1,
})

const $insightRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $insightPositive: ThemedStyle<TextStyle> = () => ({
  color: "#57D37C",
})

const $insightNeutral: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.84)",
})
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit 2>&1 | head -30`

Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add app/app/screens/SleepDetailScreen.tsx
git commit -m "feat: create flat SleepDetailScreen replacing nested card layout"
```

---

### Task 6: Verify and fix key metrics mapping

**Files:**
- Modify (if needed): `app/app/screens/SleepDetailScreen.tsx`

- [ ] **Step 1: Check metric labels match SleepViewModel**

The `keyMetrics` lookup uses exact label matching: `["Efficiency", "Sleep Latency", "Avg HR", "HRV Drop"]`. These must match the labels in `sleepView.metrics`. Check the backend's views service or the `buildLegacySleepView` function in DashboardContext to verify the exact label strings.

Search for the metric labels:
```bash
cd app && grep -n "label:" app/context/DashboardContext.tsx | grep -i "efficiency\|latency\|avg hr\|hrv"
```

If the labels don't match, update the `wanted` array in `SleepDetailScreen.tsx` to use the exact labels from the data.

- [ ] **Step 2: If labels needed updating, commit**

```bash
git add app/app/screens/SleepDetailScreen.tsx
git commit -m "fix: match key metric labels to backend data"
```

---

### Task 7: Test full navigation flow

- [ ] **Step 1: Start the app and verify**

```bash
cd app && npx expo start
```

1. Open the app — bottom tabs should show Home, Trends, Device (no Sleep tab)
2. On Home, tap the Sleep metric card — should push SleepDetailScreen
3. SleepDetailScreen should show: back arrow + "Sleep" + date, hero score, hypnogram, metrics row, HR chart, trends, insights (if data exists)
4. Tap back arrow — should return to Home
5. Swipe back (iOS) — should return to Home

- [ ] **Step 2: Fix any issues found during testing**

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: sleep detail navigation and layout adjustments"
```

---

### Task 8: Clean up old SleepScreen file

**Files:**
- Delete: `app/app/screens/SleepScreen.tsx`

- [ ] **Step 1: Verify no remaining imports of SleepScreen**

```bash
cd app && grep -rn "SleepScreen" app/ --include="*.ts" --include="*.tsx"
```

After Task 2 (MainNavigator cleanup), there should be no remaining imports. If any exist, remove them.

- [ ] **Step 2: Delete the old file**

```bash
rm app/app/screens/SleepScreen.tsx
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd app && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old SleepScreen after migration to SleepDetailScreen"
```
