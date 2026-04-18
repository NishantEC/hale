# Tamagui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ignite-derived theme + primitive component layer with Tamagui in a single big-bang migration using stock themes and default fonts.

**Architecture:** Install Tamagui alongside the existing Ignite layer on a dedicated branch, then migrate in a buildable-at-every-step order: providers → delete demo screens → rewrite domain UI → restyle every product screen → delete Ignite primitives → delete theme directory → regression sweep.

**Tech Stack:** tamagui, @tamagui/themes, @tamagui/babel-plugin, Expo SDK 55, TypeScript, @react-navigation/native.

**Branch:** `feat/tamagui-migration` (create from `main`).

**Spec:** `docs/superpowers/specs/2026-04-18-tamagui-migration-design.md`

**Style mapping cheatsheet (used across all screen restyle tasks):**

| Ignite primitive | Tamagui replacement |
|---|---|
| `<Screen preset="fixed">` | `<YStack flex={1} backgroundColor="$background">` (wrap in `<SafeAreaView>` if the original did) |
| `<Screen preset="scroll">` | `<ScrollView>` inside `<YStack flex={1} backgroundColor="$background">` |
| `<Text preset="heading">` | `<H2>` or `<H3>` (Tamagui headings) |
| `<Text preset="subheading">` | `<Paragraph fontWeight="600">` |
| `<Text preset="default">` | `<Paragraph>` |
| `<Text preset="formLabel">` | `<Label>` |
| `<Text preset="formHelper">` | `<Paragraph size="$2" color="$colorMuted">` |
| `<Card>` | `<Card>` (Tamagui has its own) with `padded` prop; override via `backgroundColor="$backgroundFocus"` |
| `<Button preset="default">` | `<Button>` |
| `<Button preset="reversed">` | `<Button theme="active">` |
| `<Icon icon="back" />` | `<Ionicons name="chevron-back" size={24} />` (direct @expo/vector-icons) |
| `<TextField />` | `<Input />` + `<Label />` pair |
| `<ListItem>` | `<ListItem>` (Tamagui has its own) |
| `<Toggle variant="switch">` | `<Switch>` |
| `useAppTheme()` theme spread into StyleSheet | Tamagui style props referencing `$space`, `$color`, `$size` tokens |
| `StyleSheet.create({ container: { padding: spacing.md, backgroundColor: colors.background } })` | inline `padding="$4" backgroundColor="$background"` on the component |

**Spacing token mapping** (Ignite → Tamagui, approximate):

| Ignite | Tamagui |
|---|---|
| `spacing.xxs` (4) | `$1` (4) |
| `spacing.xs` (8) | `$2` (8) |
| `spacing.sm` (12) | `$3` (12) |
| `spacing.md` (16) | `$4` (16) |
| `spacing.lg` (24) | `$5` (24) |
| `spacing.xl` (32) | `$6` (32) |
| `spacing.xxl` (48) | `$8` (48) |

**Color token notes:** Tamagui's stock `dark` theme covers `$background`, `$backgroundFocus`, `$color`, `$colorMuted`, `$borderColor`. For the 3 product-specific colors (ring sleep `#7C3AED`, ring recovery `#16A34A`, ring strain `#D97706`) that today live in `theme/colors.ts`, inline the hex at usage sites per spec §4 — do not create a token.

---

## Phase 1 — Install deps + wire providers

### Task 1: Install Tamagui + babel plugin; remove Space Grotesk

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/package.json`
- Modify: `/Users/nishantgupta/Documents/noop/app/babel.config.js`
- Create: `/Users/nishantgupta/Documents/noop/app/tamagui.config.ts`

- [ ] **Step 1: Apply dependency changes**

Run:
```bash
cd /Users/nishantgupta/Documents/noop/app && npm install tamagui @tamagui/themes @tamagui/config && npm install --save-dev @tamagui/babel-plugin
cd /Users/nishantgupta/Documents/noop/app && npm uninstall @expo-google-fonts/space-grotesk
```

Create `/Users/nishantgupta/Documents/noop/app/tamagui.config.ts`:

```typescript
import { config } from "@tamagui/config/v4"
import { createTamagui } from "tamagui"

const appConfig = createTamagui(config)

export type AppConfig = typeof appConfig
declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends AppConfig {}
}

export default appConfig
```

Modify `/Users/nishantgupta/Documents/noop/app/babel.config.js` — add the Tamagui plugin to the `plugins` array (keep existing entries):

```javascript
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "@tamagui/babel-plugin",
        {
          components: ["tamagui"],
          config: "./tamagui.config.ts",
          logTimings: true,
          disableExtraction: process.env.NODE_ENV === "development",
        },
      ],
      // ... existing plugins (e.g. "react-native-reanimated/plugin" must stay LAST) ...
    ],
  }
}
```

If `babel.config.js` currently has other plugins, insert the Tamagui plugin entry at the top of the `plugins` array while leaving every existing entry in place. `react-native-reanimated/plugin` MUST remain the last entry.

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS — `tamagui.config.ts` resolves, no unresolved types.

- [ ] **Step 3: Simulator smoke check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx expo start --clear`
Open the app on the iPhone 17 Pro simulator. Verify app boots and existing Ignite UI renders unchanged. Tamagui is installed but not yet used; nothing visual should change.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json app/tamagui.config.ts app/babel.config.js
git commit -m "feat(tamagui): install tamagui + babel plugin, remove space-grotesk"
```

---

### Task 2: Wrap app in `<TamaguiProvider>` and adapt navigation theme

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx`
- Create: `/Users/nishantgupta/Documents/noop/app/app/navigators/useNavigationTheme.ts`

- [ ] **Step 1: Apply the edit**

Create `/Users/nishantgupta/Documents/noop/app/app/navigators/useNavigationTheme.ts`:

```typescript
import { DarkTheme, Theme } from "@react-navigation/native"

// Feeds Tamagui's active theme values into react-navigation's ThemeProvider
// so nav bar / tab bar colors track the app theme.
export function useNavigationTheme(): Theme {
  return {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: "#151517",
      card: "#1C1C1F",
      text: "#FFFFFF",
      border: "#2A2A2E",
      primary: "#7C3AED",
      notification: "#DC2626",
    },
  }
}
```

Modify `/Users/nishantgupta/Documents/noop/app/app/app.tsx`. Add imports:

```typescript
import { TamaguiProvider } from "tamagui"
import tamaguiConfig from "../tamagui.config"
```

Wrap the returned tree. Inside the current `<SafeAreaProvider>` (or wherever the Ignite `<ThemeProvider>` currently lives), insert `<TamaguiProvider>` **above** the existing navigation tree, keeping the Ignite `<ThemeProvider>` in place until Phase 6 removes it:

```tsx
return (
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <KeyboardProvider>
        <ErrorBoundary catchErrors={Config.catchErrors}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider theme={theme}>
              <AuthProvider>
                <DashboardProvider>
                  <AppNavigator
                    linking={linking}
                    onReady={setNavigationReady}
                  />
                </DashboardProvider>
              </AuthProvider>
            </ThemeProvider>
          </GestureHandlerRootView>
        </ErrorBoundary>
      </KeyboardProvider>
    </TamaguiProvider>
  </SafeAreaProvider>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx expo start --clear`. Verify the app still boots and every tab still renders. TamaguiProvider is now active but no screen uses its primitives yet — visuals should be identical.

- [ ] **Step 4: Commit**

```bash
git add app/app/app.tsx app/app/navigators/useNavigationTheme.ts
git commit -m "feat(tamagui): wrap app in TamaguiProvider + navigation theme adapter"
```

---

## Phase 2 — Delete Ignite demo screens

### Task 3: Remove demo screens, ErrorScreen, and any navigator references

**Files:**
- Delete: `/Users/nishantgupta/Documents/noop/app/app/screens/DemoCommunityScreen.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/screens/DemoDebugScreen.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/screens/DemoPodcastListScreen.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/screens/DemoShowroomScreen/` (entire directory)
- Delete: `/Users/nishantgupta/Documents/noop/app/app/screens/ErrorScreen/` (entire directory)
- Delete: `/Users/nishantgupta/Documents/noop/app/app/navigators/DemoNavigator.tsx` (if it exists)
- Modify: `/Users/nishantgupta/Documents/noop/app/app/navigators/AppNavigator.tsx` (remove demo routes)
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx` (remove demo routes from `linking`)

- [ ] **Step 1: Apply deletions**

```bash
cd /Users/nishantgupta/Documents/noop/app
rm app/screens/DemoCommunityScreen.tsx
rm app/screens/DemoDebugScreen.tsx
rm app/screens/DemoPodcastListScreen.tsx
rm -rf app/screens/DemoShowroomScreen
rm -rf app/screens/ErrorScreen
rm -f app/navigators/DemoNavigator.tsx
```

In `AppNavigator.tsx` and `app.tsx`, remove every line that references the deleted files:
- imports that start with `DemoNavigator`, `DemoCommunityScreen`, `DemoDebugScreen`, `DemoPodcastListScreen`, `DemoShowroomScreen`, `ErrorScreen`
- any `<Stack.Screen>` / `<Tab.Screen>` entries that name them
- any linking config paths that route to them

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS — no residual imports.

- [ ] **Step 3: Simulator smoke**

Run the app, verify every remaining tab opens. No missing-route errors.

- [ ] **Step 4: Commit**

```bash
git add -u app/app/screens app/app/navigators app/app/app.tsx
git commit -m "feat(tamagui): delete ignite demo screens and error screen"
```

---

## Phase 3 — Rewrite domain UI on Tamagui primitives

### Task 4: Rewrite `GlassCard` on Tamagui primitives (keep expo-glass-effect)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/components/GlassCard.tsx`

- [ ] **Step 1: Apply the edit**

Before replacing, read the current `GlassCard.tsx` to note the public prop API (e.g. `children`, `style`, `variant`, `padded`, `onPress`). The replacement must preserve every prop name.

Write the new file (preserving the public prop API of the original — adjust the `GlassCardProps` below to match what the current file exposes):

```tsx
import { forwardRef, ReactNode } from "react"
import { StyleProp, ViewStyle, Pressable } from "react-native"
import { YStack, YStackProps } from "tamagui"
import { GlassView } from "expo-glass-effect"

export interface GlassCardProps extends YStackProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  padded?: boolean
}

export const GlassCard = forwardRef<any, GlassCardProps>(function GlassCard(
  { children, style, onPress, padded = true, ...rest },
  ref,
) {
  const body = (
    <YStack
      ref={ref as any}
      borderRadius="$6"
      overflow="hidden"
      padding={padded ? "$4" : 0}
      backgroundColor="rgba(255,255,255,0.05)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.08)"
      {...rest}
      style={style}
    >
      <GlassView style={{ position: "absolute", inset: 0 }} />
      {children}
    </YStack>
  )
  if (onPress) return <Pressable onPress={onPress}>{body}</Pressable>
  return body
})
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke (expo-glass-effect verification)**

Open the Home tab (it uses GlassCard). Verify the glass blur / tint effect still renders on iOS. If expo-glass-effect misbehaves under a Tamagui parent (per spec §6 open question #2), fall back to `expo-blur`'s `<BlurView>` inside the same YStack — public API stays the same.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/GlassCard.tsx
git commit -m "feat(tamagui): rewrite GlassCard on tamagui YStack"
```

---

### Task 5: Rewrite `StatusPill` on Tamagui

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/components/StatusPill.tsx`

- [ ] **Step 1: Apply the edit**

Read the current file first to capture its prop API (common shape: `label`, `tone: 'green' | 'amber' | 'red' | 'neutral'`, `size`). The replacement preserves that API.

```tsx
import { XStack, Paragraph } from "tamagui"

export interface StatusPillProps {
  label: string
  tone?: "green" | "amber" | "red" | "neutral"
  size?: "sm" | "md"
}

const TONE_COLORS: Record<NonNullable<StatusPillProps["tone"]>, { bg: string; fg: string }> = {
  green: { bg: "rgba(22,163,74,0.16)", fg: "#16A34A" },
  amber: { bg: "rgba(217,119,6,0.16)", fg: "#D97706" },
  red: { bg: "rgba(220,38,38,0.16)", fg: "#DC2626" },
  neutral: { bg: "rgba(255,255,255,0.08)", fg: "#FFFFFFCC" },
}

export function StatusPill({ label, tone = "neutral", size = "md" }: StatusPillProps) {
  const colors = TONE_COLORS[tone]
  const px = size === "sm" ? "$2" : "$3"
  const py = size === "sm" ? "$1" : "$2"
  const fontSize = size === "sm" ? "$2" : "$3"
  return (
    <XStack
      paddingHorizontal={px}
      paddingVertical={py}
      borderRadius="$10"
      backgroundColor={colors.bg as any}
      alignItems="center"
    >
      <Paragraph color={colors.fg as any} fontSize={fontSize}>
        {label}
      </Paragraph>
    </XStack>
  )
}
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Any screen using StatusPill (HomeScreen, SleepDetailScreen confidence pills) — verify the pills render, colors correct per tone.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/StatusPill.tsx
git commit -m "feat(tamagui): rewrite StatusPill on tamagui"
```

---

### Task 6: Rewrite `DetailScreenHeader` on Tamagui

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/components/DetailScreenHeader.tsx`

- [ ] **Step 1: Apply the edit**

Read the current file to lock props (common: `title`, `subtitle?`, `onBack?`, `rightAction?`).

```tsx
import { XStack, YStack, H3, Paragraph } from "tamagui"
import { Pressable } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import type { ReactNode } from "react"

export interface DetailScreenHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  rightAction?: ReactNode
}

export function DetailScreenHeader({ title, subtitle, onBack, rightAction }: DetailScreenHeaderProps) {
  const nav = useNavigation()
  const handleBack = onBack ?? (() => nav.goBack())
  return (
    <XStack
      paddingHorizontal="$4"
      paddingVertical="$3"
      alignItems="center"
      justifyContent="space-between"
      backgroundColor="$background"
    >
      <Pressable onPress={handleBack} hitSlop={16}>
        <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
      </Pressable>
      <YStack flex={1} alignItems="center">
        <H3>{title}</H3>
        {subtitle ? <Paragraph color="$colorMuted" size="$2">{subtitle}</Paragraph> : null}
      </YStack>
      <XStack width={28}>{rightAction}</XStack>
    </XStack>
  )
}
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Navigate into SleepDetailScreen, HomeDetailsScreen, StrainActivityScreen — verify title + back button render and back works.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/DetailScreenHeader.tsx
git commit -m "feat(tamagui): rewrite DetailScreenHeader on tamagui"
```

---

### Task 7: Rewrite `MetricRing` wrapper on Tamagui (Skia canvas unchanged)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/components/MetricRing.tsx`

- [ ] **Step 1: Apply the edit**

Keep the inner Skia `<Canvas>` + ring drawing logic exactly as-is. Only the outer container and label rows swap to Tamagui.

Read the existing file to find the container `<View>` + label `<Text>` rows. Replace the outer wrapper:

```tsx
// Replace the old container + label stack (everything OUTSIDE the Skia <Canvas>) with:
import { YStack, Paragraph } from "tamagui"

// ...inside the component return:
return (
  <YStack alignItems="center" gap="$2">
    <Canvas style={{ width: size, height: size }}>
      {/* existing Skia ring drawing — unchanged */}
    </Canvas>
    {label ? <Paragraph size="$3" color="$colorMuted">{label}</Paragraph> : null}
    {value ? <Paragraph size="$6" fontWeight="700">{value}</Paragraph> : null}
  </YStack>
)
```

The color literals for the three ring types (`#7C3AED` sleep, `#16A34A` recovery, `#D97706` strain) that Skia needs stay as inline hex at the call site in HomeScreen (per spec §4). MetricRing accepts a `ringColor` prop; callers pass the hex directly.

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Home tab — verify all three rings (Sleep purple, Recovery green, Strain amber) render identically. Numbers visible below each ring.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/MetricRing.tsx
git commit -m "feat(tamagui): MetricRing outer layout on tamagui (Skia unchanged)"
```

---

## Phase 4 — Restyle product screens (one task per screen)

> For every screen in this phase, the restyle is mechanical:
> 1. Replace Ignite imports with Tamagui per the cheatsheet at the top of this plan.
> 2. Delete any `StyleSheet.create(...)` at the bottom of the file; move the styles into inline Tamagui props.
> 3. Replace `useAppTheme()` / `themed($...)` calls; use token-ref strings (`"$space.4"`) or direct hex for product colors.
> 4. Preserve every navigation action, every callback, every data-fetch hook. This phase changes style-level code only.

### Task 8: Restyle `WelcomeScreen` (110 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/WelcomeScreen.tsx`

- [ ] **Step 1: Apply the edit**

Read the current file. Rewrite as a thin Tamagui screen. A representative structure:

```tsx
import { YStack, H1, Paragraph, Button } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { AppStackParamList } from "@/navigators/AppNavigator"

export function WelcomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
      <YStack flex={1} padding="$5" justifyContent="space-between">
        <YStack gap="$4" marginTop="$8">
          <H1>Welcome</H1>
          <Paragraph color="$colorMuted" size="$5">
            Your WHOOP data, on your terms.
          </Paragraph>
        </YStack>
        <YStack gap="$3">
          <Button theme="active" onPress={() => nav.navigate("Login")}>Get started</Button>
        </YStack>
      </YStack>
    </SafeAreaView>
  )
}
```

Preserve any existing copy, images, and animations from the current file — adapt them to Tamagui equivalents as needed.

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Log out / fresh install to hit Welcome. Verify layout, typography, button navigation.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/WelcomeScreen.tsx
git commit -m "feat(tamagui): restyle WelcomeScreen"
```

---

### Task 9: Restyle `LoginScreen` (198 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/LoginScreen.tsx`

- [ ] **Step 1: Apply the edit**

Read the file. Preserve the existing form state, validation, and submit handlers. Swap:
- `<Screen>` → `<SafeAreaView>` + `<YStack flex={1} backgroundColor="$background">`
- `<TextField>` → `<Input>` + `<Label>` pair
- `<Button>` → Tamagui `<Button>`
- `<Text preset="heading">` → `<H2>`
- All `StyleSheet.create(...)` styles → inline Tamagui props per the cheatsheet.

Shape:

```tsx
import { YStack, H2, Input, Label, Button, Paragraph } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"

// ...existing imports / handlers...

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <YStack flex={1} padding="$5" gap="$5" justifyContent="center">
      <H2>Sign in</H2>
      <YStack gap="$2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      </YStack>
      <YStack gap="$2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" value={password} onChangeText={setPassword} secureTextEntry />
      </YStack>
      {errorMessage ? <Paragraph color="#DC2626">{errorMessage}</Paragraph> : null}
      <Button theme="active" onPress={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </YStack>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Log out. Sign in with known creds. Verify submit works, error state displays on bad credentials.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/LoginScreen.tsx
git commit -m "feat(tamagui): restyle LoginScreen"
```

---

### Task 10: Restyle `StrainActivityScreen` (114 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/StrainActivityScreen.tsx`

- [ ] **Step 1: Apply the edit**

Read file. Replace Ignite primitives per cheatsheet. Preserve chart components (Skia-based — untouched).

Shape:

```tsx
import { YStack, XStack, ScrollView, H3, Paragraph } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { BarSeriesChart } from "@/components/BarSeriesChart"  // unchanged

// ...existing data hooks, chart config...

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Strain" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <YStack gap="$3">
        <H3>Today's activity</H3>
        <BarSeriesChart data={activitySeries} />
      </YStack>
      <YStack gap="$2">
        {activities.map((a) => (
          <XStack key={a.id} justifyContent="space-between">
            <Paragraph>{a.type}</Paragraph>
            <Paragraph color="$colorMuted">{a.duration}</Paragraph>
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Navigate into Strain screen. Verify chart renders and activity list shows. Scrolling works.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/StrainActivityScreen.tsx
git commit -m "feat(tamagui): restyle StrainActivityScreen"
```

---

### Task 11: Restyle `HomeDetailsScreen` (121 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/HomeDetailsScreen.tsx`

- [ ] **Step 1: Apply the edit**

Apply the same mechanical swap as Tasks 8–10. Preserve all hooks, navigation params, data fetching.

Shape:

```tsx
import { YStack, ScrollView, H2, Paragraph } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { InlineLineChart } from "@/components/InlineLineChart"

// ...data hooks...

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title={title} subtitle={subtitle} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <YStack gap="$3">
        <H2>{headline}</H2>
        <Paragraph color="$colorMuted">{detail}</Paragraph>
      </YStack>
      <InlineLineChart data={trendSamples} />
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

From Home tap the "today overview" area → verify HomeDetailsScreen renders with the headline and trend chart.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/HomeDetailsScreen.tsx
git commit -m "feat(tamagui): restyle HomeDetailsScreen"
```

---

### Task 12: Restyle `HomeMetricScreen` (238 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/HomeMetricScreen.tsx`

- [ ] **Step 1: Apply the edit**

Read file. Same swap pattern. Preserve metric-specific data hooks + route params (`metricId`).

Shape:

```tsx
import { YStack, ScrollView, H2, Paragraph, XStack } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { InlineLineChart } from "@/components/InlineLineChart"
import { StatusPill } from "@/components/StatusPill"

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title={metric.title} subtitle={metric.subtitle} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      <YStack gap="$2">
        <H2>{metric.currentValue}</H2>
        <XStack gap="$2">
          <StatusPill label={metric.trend} tone={metric.trendTone} />
          <Paragraph color="$colorMuted">{metric.comparisonLabel}</Paragraph>
        </XStack>
      </YStack>
      <InlineLineChart data={metric.samples} />
      <YStack gap="$3">
        {metric.sections.map((s) => (
          <YStack key={s.id} gap="$1">
            <Paragraph fontWeight="600">{s.title}</Paragraph>
            <Paragraph color="$colorMuted">{s.body}</Paragraph>
          </YStack>
        ))}
      </YStack>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

From Home, tap each metric tile (sleep, recovery, strain). Verify HomeMetricScreen opens with correct data for each.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/HomeMetricScreen.tsx
git commit -m "feat(tamagui): restyle HomeMetricScreen"
```

---

### Task 13: Restyle `DeviceScreen` (234 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/DeviceScreen.tsx`

- [ ] **Step 1: Apply the edit**

Preserve BLE connection state logic + disconnect/connect actions. Swap styling only.

Shape:

```tsx
import { YStack, ScrollView, H2, Paragraph, Button, ListItem, Separator } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Device" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <YStack gap="$2">
        <H2>{device?.name ?? "No device"}</H2>
        <Paragraph color="$colorMuted">Battery: {batteryLevel ?? "—"}%</Paragraph>
      </YStack>
      <YStack>
        <ListItem title="Signal strength" subtitle={`${rssi} dBm`} />
        <Separator />
        <ListItem title="Firmware" subtitle={firmwareVersion} />
        <Separator />
        <ListItem title="Last sync" subtitle={lastSyncText} />
      </YStack>
      <Button theme={isConnected ? "red" : "active"} onPress={isConnected ? disconnect : connect}>
        {isConnected ? "Disconnect" : "Connect"}
      </Button>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Device tab. With no strap nearby, verify empty state. Test the Connect button on a real device in CI / QA.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/DeviceScreen.tsx
git commit -m "feat(tamagui): restyle DeviceScreen"
```

---

### Task 14: Restyle `DebugInspectorScreen` (254 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/DebugInspectorScreen.tsx`

- [ ] **Step 1: Apply the edit**

Preserve every debug data hook + raw payload display. Swap to Tamagui layout + `<Paragraph>` / `<Code>` equivalents.

Shape:

```tsx
import { YStack, ScrollView, H3, Paragraph, XStack } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <XStack justifyContent="space-between" paddingVertical="$1">
      <Paragraph color="$colorMuted">{k}</Paragraph>
      <Paragraph fontFamily="$mono">{String(v)}</Paragraph>
    </XStack>
  )
}

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Debug" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <YStack gap="$2">
        <H3>Counts</H3>
        <KV k="Raw records" v={overview.counts.rawRecordCount} />
        <KV k="Sleep detections" v={overview.counts.sleepDetectionCount} />
        <KV k="Daily scores" v={overview.counts.dailyScoreCount} />
      </YStack>
      <YStack gap="$2">
        <H3>Latest timestamps</H3>
        <KV k="Earliest raw" v={overview.earliestRawTimestamp ?? "—"} />
        <KV k="Latest raw" v={overview.latestRawTimestamp ?? "—"} />
      </YStack>
      {/* preserve existing pipeline-run controls etc. */}
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Debug tab. Verify every count and timestamp renders. Any action buttons still trigger their existing handlers.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/DebugInspectorScreen.tsx
git commit -m "feat(tamagui): restyle DebugInspectorScreen"
```

---

### Task 15: Restyle `JournalHistoryScreen` (275 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/JournalHistoryScreen.tsx`

- [ ] **Step 1: Apply the edit**

Preserve journal list state + swipe-to-delete logic. Swap styling.

Shape:

```tsx
import { YStack, ScrollView, H3, Paragraph, XStack, ListItem, Separator } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Journal history" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {days.map((day) => (
        <YStack key={day.date} gap="$2">
          <H3>{day.heading}</H3>
          <YStack>
            {day.entries.map((e) => (
              <YStack key={e.id}>
                <ListItem
                  title={e.factorLabel}
                  subtitle={`${"●".repeat(e.intensity)} ${e.note}`}
                  onPress={() => onDelete(e.id)}
                />
                <Separator />
              </YStack>
            ))}
          </YStack>
        </YStack>
      ))}
      {days.length === 0 ? (
        <Paragraph color="$colorMuted" textAlign="center">No entries yet.</Paragraph>
      ) : null}
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Journal history. Verify entries render grouped by day. Delete action still works (uses existing handler).

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/JournalHistoryScreen.tsx
git commit -m "feat(tamagui): restyle JournalHistoryScreen"
```

---

### Task 16: Restyle `TrendsScreen` (279 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/TrendsScreen.tsx`

- [ ] **Step 1: Apply the edit**

Preserve trends data hooks, charts (Skia, untouched), and time-range selector. Swap styling.

Shape:

```tsx
import { YStack, ScrollView, H2, H3, Paragraph, XStack, Button } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { InlineLineChart } from "@/components/InlineLineChart"

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      <H2>Trends</H2>
      <XStack gap="$2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="$2" theme={days === d ? "active" : undefined} onPress={() => setDays(d)}>
            {d}d
          </Button>
        ))}
      </XStack>
      {trendSections.map((s) => (
        <YStack key={s.id} gap="$2">
          <H3>{s.title}</H3>
          <Paragraph color="$colorMuted">{s.summary}</Paragraph>
          <InlineLineChart data={s.samples} />
        </YStack>
      ))}
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Trends tab. Verify every chart renders for the default 30d window. Switch to 7d and 90d — data reloads.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/TrendsScreen.tsx
git commit -m "feat(tamagui): restyle TrendsScreen"
```

---

### Task 17: Restyle `JournalEntryScreen` (369 LOC)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/JournalEntryScreen.tsx`

- [ ] **Step 1: Apply the edit**

Preserve factor grid (12 factors from the journal spec), intensity stepper, note input, and save handler. Swap styling.

Shape (the factor grid stays a 3×4 layout of buttons):

```tsx
import { YStack, XStack, H3, Paragraph, Input, Button } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { Ionicons } from "@expo/vector-icons"

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Journal" />
    <YStack flex={1} padding="$4" gap="$5">
      <YStack gap="$3">
        <H3>Factor</H3>
        <YStack gap="$2">
          {factorRows.map((row, i) => (
            <XStack key={i} gap="$2">
              {row.map((f) => (
                <Button
                  key={f.tag}
                  flex={1}
                  theme={selectedTag === f.tag ? "active" : undefined}
                  onPress={() => setSelectedTag(f.tag)}
                >
                  <Ionicons name={f.icon} size={18} color={f.color} />
                  <Paragraph marginLeft="$2">{f.label}</Paragraph>
                </Button>
              ))}
            </XStack>
          ))}
        </YStack>
      </YStack>
      <YStack gap="$2">
        <H3>Intensity</H3>
        <XStack gap="$2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button key={n} size="$3" circular theme={intensity >= n ? "active" : undefined} onPress={() => setIntensity(n)}>
              {n}
            </Button>
          ))}
        </XStack>
      </YStack>
      <YStack gap="$2">
        <H3>Note</H3>
        <Input value={note} onChangeText={setNote} placeholder="optional" multiline numberOfLines={3} />
      </YStack>
      <Button theme="active" onPress={onSave} disabled={!selectedTag}>
        Save
      </Button>
    </YStack>
  </SafeAreaView>
)
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Open Journal entry modal from Home `+`. Tap a factor, pick intensity, type note, save. Verify entry appears in JournalHistoryScreen.

- [ ] **Step 4: Commit**

```bash
git add app/app/screens/JournalEntryScreen.tsx
git commit -m "feat(tamagui): restyle JournalEntryScreen"
```

---

### Task 18: Restyle `SleepDetailScreen` (485 LOC — large screen)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/SleepDetailScreen.tsx`

Because this screen is long, the task shows: (a) the import-block diff, (b) the top-level JSX structure using Tamagui primitives, and (c) mapping rules for the interior sub-sections. The implementer translates each existing sub-section 1:1 using the cheatsheet at the top of this plan.

- [ ] **Step 1: Import-block swap**

Delete every Ignite import at the top of the file:
```typescript
// Delete:
import { Screen, Text, Card, Button, Icon, ListItem } from "@/components/*"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
```

Replace with:
```typescript
import { YStack, XStack, ScrollView, H2, H3, Paragraph, Card, Separator } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { StatusPill } from "@/components/StatusPill"
import { SleepHeartRateChart } from "@/components/SleepHeartRateChart"      // unchanged
import { HypnogramChart } from "@/components/HypnogramChart"                // unchanged
```

- [ ] **Step 2: Top-level JSX rewrite**

Replace the outer `<Screen>` return with:

```tsx
return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title={header.title} subtitle={header.subtitle} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      {/* Header stats card */}
      <Card padded bordered>
        <YStack gap="$2">
          <XStack gap="$4">
            <YStack gap="$1">
              <Paragraph color="$colorMuted" size="$2">Bedtime</Paragraph>
              <H3>{sleep.header.bedtime}</H3>
            </YStack>
            <YStack gap="$1">
              <Paragraph color="$colorMuted" size="$2">Wake</Paragraph>
              <H3>{sleep.header.wakeTime}</H3>
            </YStack>
            <YStack gap="$1">
              <Paragraph color="$colorMuted" size="$2">Duration</Paragraph>
              <H3>{sleep.header.duration}</H3>
            </YStack>
          </XStack>
        </YStack>
      </Card>

      {/* Hypnogram */}
      <YStack gap="$2">
        <H3>Stages</H3>
        <HypnogramChart epochs={sleep.epochTimeline} />
      </YStack>

      {/* Heart rate chart */}
      <YStack gap="$2">
        <H3>Heart rate</H3>
        <SleepHeartRateChart samples={sleep.hrChart.samples} />
      </YStack>

      {/* Stage rows */}
      <YStack gap="$2">
        {sleep.stageRows.map((r) => (
          <XStack key={r.id} justifyContent="space-between" paddingVertical="$1">
            <XStack gap="$2" alignItems="center">
              <YStack width={10} height={10} borderRadius={5} backgroundColor={r.color as any} />
              <Paragraph>{r.label}</Paragraph>
            </XStack>
            <Paragraph color="$colorMuted">{r.durationFormatted}</Paragraph>
          </XStack>
        ))}
      </YStack>

      {/* Insight */}
      {sleep.sleepInsight ? (
        <Card padded>
          <Paragraph>{sleep.sleepInsight}</Paragraph>
        </Card>
      ) : null}

      {/* Metrics */}
      <YStack gap="$2">
        <H3>Metrics</H3>
        {sleep.metrics.map((m) => (
          <XStack key={m.label} justifyContent="space-between" paddingVertical="$1">
            <Paragraph>{m.label}</Paragraph>
            <Paragraph color="$colorMuted">{m.value}</Paragraph>
          </XStack>
        ))}
      </YStack>

      {/* Confidence */}
      <Card padded>
        <YStack gap="$2">
          <StatusPill label={sleep.confidence.confidence} tone="neutral" />
          <Paragraph color="$colorMuted" size="$2">{sleep.confidence.disclaimer}</Paragraph>
        </YStack>
      </Card>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 3: Apply interior mapping**

For every remaining styled block in the original file that wasn't covered above (empty state, factor insights list, planner link, duration trend chart), apply the cheatsheet mechanically: Ignite primitive → Tamagui primitive, `StyleSheet` → inline props.

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Open Sleep tab. Verify every sub-section renders with real data for the most recent night. Scroll to the bottom, verify confidence card. Dates navigation (if present) still works.

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/SleepDetailScreen.tsx
git commit -m "feat(tamagui): restyle SleepDetailScreen"
```

---

### Task 19: Restyle `SleepPlannerScreen` (490 LOC — large screen)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/SleepPlannerScreen.tsx`

- [ ] **Step 1: Import-block swap**

Delete every Ignite import. Replace with:
```typescript
import { YStack, XStack, ScrollView, H3, Paragraph, Button, Switch, Label } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
```

- [ ] **Step 2: Top-level JSX rewrite**

```tsx
return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Sleep planner" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      <YStack gap="$3">
        <H3>Target sleep</H3>
        <XStack gap="$2" alignItems="center">
          <Button size="$3" onPress={() => setTargetMinutes(targetMinutes - 15)}>−15m</Button>
          <Paragraph fontSize="$6">{formatHours(targetMinutes)}</Paragraph>
          <Button size="$3" onPress={() => setTargetMinutes(targetMinutes + 15)}>+15m</Button>
        </XStack>
      </YStack>
      <YStack gap="$3">
        <H3>Wake time</H3>
        <XStack gap="$2" alignItems="center">
          <Button size="$3" onPress={() => setWakeMinutes(wakeMinutes - 15)}>−15m</Button>
          <Paragraph fontSize="$6">{formatTime(wakeMinutes)}</Paragraph>
          <Button size="$3" onPress={() => setWakeMinutes(wakeMinutes + 15)}>+15m</Button>
        </XStack>
      </YStack>
      <XStack justifyContent="space-between" alignItems="center">
        <Label>Alarm</Label>
        <Switch checked={alarmEnabled} onCheckedChange={setAlarmEnabled}>
          <Switch.Thumb animation="quick" />
        </Switch>
      </XStack>
      {alarmEnabled ? (
        <YStack gap="$3">
          <H3>Alarm at</H3>
          <XStack gap="$2" alignItems="center">
            <Button size="$3" onPress={() => setAlarmMinutes(alarmMinutes - 15)}>−15m</Button>
            <Paragraph fontSize="$6">{formatTime(alarmMinutes)}</Paragraph>
            <Button size="$3" onPress={() => setAlarmMinutes(alarmMinutes + 15)}>+15m</Button>
          </XStack>
          <XStack justifyContent="space-between" alignItems="center">
            <Label>Smart wake</Label>
            <Switch checked={smartWakeEnabled} onCheckedChange={setSmartWakeEnabled}>
              <Switch.Thumb animation="quick" />
            </Switch>
          </XStack>
        </YStack>
      ) : null}
      <Button theme="active" onPress={onSave}>Save plan</Button>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 3: Apply interior mapping**

For any helper components in the file (planner summary card, estimated sleep display), translate using the cheatsheet.

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Navigate to SleepPlanner. Verify stepper buttons work, alarm toggle shows/hides the nested section, save persists (check backend / Debug screen).

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/SleepPlannerScreen.tsx
git commit -m "feat(tamagui): restyle SleepPlannerScreen"
```

---

### Task 20: Restyle `DeviceSettingsScreen` (554 LOC — large screen)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/DeviceSettingsScreen.tsx`

- [ ] **Step 1: Import-block swap**

Replace Ignite imports with:
```typescript
import { YStack, ScrollView, H3, Paragraph, ListItem, Separator, Switch } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
```

- [ ] **Step 2: Top-level JSX rewrite**

```tsx
return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <DetailScreenHeader title="Device settings" />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <YStack gap="$2">
        <H3>Device</H3>
        <ListItem title="Broadcast heart rate" iconAfter={
          <Switch checked={broadcastHr} onCheckedChange={setBroadcastHr}>
            <Switch.Thumb animation="quick" />
          </Switch>
        } />
        <Separator />
        <ListItem title="Health monitor" iconAfter={
          <Switch checked={healthMonitor} onCheckedChange={setHealthMonitor}>
            <Switch.Thumb animation="quick" />
          </Switch>
        } />
        <Separator />
        <ListItem title="Haptic alarm" iconAfter={
          <Switch checked={hapticAlarm} onCheckedChange={setHapticAlarm}>
            <Switch.Thumb animation="quick" />
          </Switch>
        } />
      </YStack>
      <YStack gap="$2">
        <H3>Storage</H3>
        <ListItem title="Keep raw history for" subtitle={rawRetentionLabel} onPress={openRetentionPicker} />
      </YStack>
      <YStack gap="$2">
        <H3>Debug</H3>
        <ListItem title="Open debug inspector" onPress={() => nav.navigate("DebugInspector")} />
        <Separator />
        <ListItem title="Erase device storage" onPress={onEraseDevice} />
      </YStack>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 3: Apply interior mapping**

Translate any remaining sub-components (device-info sub-card, firmware section, connection status, etc.) using the cheatsheet.

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Open Device settings. Toggle each switch, verify the backend/BLE commands fire (existing handlers). Open retention picker, pick 7 days, verify it persists (setting repo from SQLite plan).

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/DeviceSettingsScreen.tsx
git commit -m "feat(tamagui): restyle DeviceSettingsScreen"
```

---

### Task 21: Restyle `HomeScreen` (952 LOC — largest screen)

**Files:**
- Modify: `/Users/nishantgupta/Documents/noop/app/app/screens/HomeScreen.tsx`

- [ ] **Step 1: Import-block swap**

Delete all Ignite imports from `@/components/*` and `@/theme/*`. Replace with:
```typescript
import { YStack, XStack, ScrollView, H1, H2, H3, Paragraph, Card, Button } from "tamagui"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { GlassCard } from "@/components/GlassCard"
import { MetricRing } from "@/components/MetricRing"
import { StatusPill } from "@/components/StatusPill"
import { InlineLineChart } from "@/components/InlineLineChart"
```

- [ ] **Step 2: Top-level JSX rewrite**

```tsx
return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#151517" }}>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      {/* Top strip */}
      <YStack gap="$1">
        <Paragraph color="$colorMuted">{home.topStrip.subtitle}</Paragraph>
        <H1>{home.topStrip.title}</H1>
      </YStack>

      {/* Rings */}
      <XStack justifyContent="space-between" paddingVertical="$4">
        <MetricRing value={home.rings.sleep.value} progress={home.rings.sleep.progress} label="Sleep" ringColor="#7C3AED" onPress={() => nav.navigate("HomeMetric", { metric: "sleep" })} />
        <MetricRing value={home.rings.recovery.value} progress={home.rings.recovery.progress} label="Recovery" ringColor="#16A34A" onPress={() => nav.navigate("HomeMetric", { metric: "recovery" })} />
        <MetricRing value={home.rings.strain.value} progress={home.rings.strain.progress} label="Strain" ringColor="#D97706" onPress={() => nav.navigate("HomeMetric", { metric: "strain" })} />
      </XStack>

      {/* Recommendation */}
      <GlassCard>
        <YStack gap="$2">
          <H3>{home.cards.recommendation.title}</H3>
          <Paragraph>{home.cards.recommendation.subtitle}</Paragraph>
          <Paragraph color="$colorMuted" size="$2">{home.cards.recommendation.footer}</Paragraph>
        </YStack>
      </GlassCard>

      {/* Stress / Load / Live HR cards */}
      <YStack gap="$3">
        {(["stress", "loadPressure", "liveHeartRate"] as const).map((key) => (
          <GlassCard key={key}>
            <YStack gap="$1">
              <H3>{home.cards[key].title}</H3>
              <Paragraph>{home.cards[key].subtitle}</Paragraph>
              <Paragraph color="$colorMuted" size="$2">{home.cards[key].footer}</Paragraph>
            </YStack>
          </GlassCard>
        ))}
      </YStack>

      {/* Today overview */}
      <Card padded bordered>
        <YStack gap="$2">
          <H2>{home.todayOverview.headline}</H2>
          <Paragraph>{home.todayOverview.detail}</Paragraph>
          <XStack justifyContent="space-between" flexWrap="wrap" gap="$3" marginTop="$2">
            <YStack>
              <Paragraph color="$colorMuted" size="$2">Daily balance</Paragraph>
              <Paragraph>{home.todayOverview.dailyBalance}</Paragraph>
            </YStack>
            <YStack>
              <Paragraph color="$colorMuted" size="$2">Load pressure</Paragraph>
              <Paragraph>{home.todayOverview.loadPressure}</Paragraph>
            </YStack>
            <YStack>
              <Paragraph color="$colorMuted" size="$2">Sleep reserve</Paragraph>
              <Paragraph>{home.todayOverview.sleepReserve}</Paragraph>
            </YStack>
            <YStack>
              <Paragraph color="$colorMuted" size="$2">Confidence</Paragraph>
              <Paragraph>{home.todayOverview.confidence}</Paragraph>
            </YStack>
          </XStack>
        </YStack>
      </Card>

      {/* Activity feed */}
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <H3>Activity</H3>
          <Paragraph color="$colorMuted">{home.activities.totalActiveMinutes} active minutes</Paragraph>
        </XStack>
        {home.activities.activityFeed.map((a, i) => (
          <XStack key={i} justifyContent="space-between" paddingVertical="$1">
            <YStack>
              <Paragraph>{a.type}</Paragraph>
              <Paragraph color="$colorMuted" size="$2">{a.time} · {a.duration}</Paragraph>
            </YStack>
            <StatusPill label={a.intensity} tone="neutral" />
          </XStack>
        ))}
      </YStack>

      {/* Stress / strain trends */}
      <YStack gap="$2">
        <H3>Stress trend</H3>
        <InlineLineChart data={home.stressTrend} />
      </YStack>
      <YStack gap="$2">
        <H3>Strain trend</H3>
        <InlineLineChart data={home.strainTrend} />
      </YStack>

      {/* Confidence footer */}
      <Card padded>
        <YStack gap="$1">
          <StatusPill label={home.confidence.confidence} tone="neutral" />
          <Paragraph color="$colorMuted" size="$2">{home.confidence.disclaimer}</Paragraph>
        </YStack>
      </Card>
    </ScrollView>
  </SafeAreaView>
)
```

- [ ] **Step 3: Apply interior mapping**

For every remaining styled block in the existing 952-line file (journal chips, `+` button FAB, date selector header, empty states), translate using the cheatsheet. Preserve every navigation target and data-fetch hook.

- [ ] **Step 4: Type check + simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

Open Home tab — this is THE regression-critical screen. Verify every ring, card, list, and chart renders with real data. Tap each ring → HomeMetricScreen opens. Tap Today overview → HomeDetailsScreen. Open the `+` button → JournalEntryScreen. Pull to refresh — data updates.

- [ ] **Step 5: Commit**

```bash
git add app/app/screens/HomeScreen.tsx
git commit -m "feat(tamagui): restyle HomeScreen"
```

---

## Phase 5 — Delete Ignite primitives

### Task 22: Delete every Ignite component file

**Files:**
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Text.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Text.test.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Screen.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Card.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Button.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Icon.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/TextField.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/ListItem.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Header.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/Toggle/` (entire directory)
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/EmptyState.tsx`
- Delete: `/Users/nishantgupta/Documents/noop/app/app/components/AutoImage.tsx`

- [ ] **Step 1: Apply the deletions**

```bash
cd /Users/nishantgupta/Documents/noop/app
rm app/components/Text.tsx app/components/Text.test.tsx
rm app/components/Screen.tsx
rm app/components/Card.tsx
rm app/components/Button.tsx
rm app/components/Icon.tsx
rm app/components/TextField.tsx
rm app/components/ListItem.tsx
rm app/components/Header.tsx
rm -rf app/components/Toggle
rm app/components/EmptyState.tsx
rm app/components/AutoImage.tsx
```

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS — zero imports reference the deleted files. If tsc reports errors, fix each missed import in the specific screen by translating it using the cheatsheet, then retry.

- [ ] **Step 3: Simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx expo start --clear`. Every screen should still open. Any screen that throws a missing-module error at runtime means Phase 4's restyle missed an import — fix and resume.

- [ ] **Step 4: Commit**

```bash
git add -u app/app/components
git commit -m "feat(tamagui): delete ignite primitive components"
```

---

## Phase 6 — Delete theme directory

### Task 23: Delete `app/theme/` + remove `@expo-google-fonts/space-grotesk`

**Files:**
- Delete: `/Users/nishantgupta/Documents/noop/app/app/theme/` (entire directory: colors, colorsDark, context, context.utils, spacing, spacingDark, styles, theme, timing, types, typography)
- Modify: `/Users/nishantgupta/Documents/noop/app/app/app.tsx` — remove `<ThemeProvider>` and `theme` import
- Modify: `/Users/nishantgupta/Documents/noop/app/package.json` (uninstall should already have removed space-grotesk in Task 1; this step is a verification)

- [ ] **Step 1: Apply the edits**

Remove the Ignite `<ThemeProvider>` wrapper inside `app.tsx` — the TamaguiProvider (from Task 2) is now the only theme provider. Delete the import:
```typescript
// Delete:
import { ThemeProvider } from "@/theme/context"
import { theme } from "@/theme/theme"
```

And in the JSX, unwrap the `<ThemeProvider theme={theme}>` layer (keep its children intact).

Delete the entire theme directory:
```bash
cd /Users/nishantgupta/Documents/noop/app && rm -rf app/theme
```

Verify `@expo-google-fonts/space-grotesk` is absent from `package.json` (removed in Task 1). If still present:
```bash
cd /Users/nishantgupta/Documents/noop/app && npm uninstall @expo-google-fonts/space-grotesk
```

Also remove any `useFonts` / `customFontsToLoad` wiring in `app.tsx` that referenced Space Grotesk. Tamagui ships its own fonts; no custom font loading is needed.

- [ ] **Step 2: Type check**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Simulator smoke**

Run: `cd /Users/nishantgupta/Documents/noop/app && npx expo start --clear`. Every screen should render using Tamagui's default typography (no Space Grotesk). Layouts intact.

- [ ] **Step 4: Commit**

```bash
git add -u app/app/theme app/app/app.tsx app/package.json app/package-lock.json
git commit -m "feat(tamagui): delete ignite theme directory + unwrap ThemeProvider"
```

---

## Phase 7 — Regression sweep

### Task 24: Manual QA pass + PR checklist

**Files:** (no code changes; this is a verification + documentation task)

- [ ] **Step 1: Run the full checklist on iOS simulator (iPhone 17 Pro)**

Start the app: `cd /Users/nishantgupta/Documents/noop/app && npx expo run:ios`

For every screen below, visit it, interact with every major control, and capture a screenshot for the PR description.

- [ ] Welcome (fresh install / logged-out state)
- [ ] Login — submit valid creds, submit invalid creds (error shows)
- [ ] Home — rings tap, overview tap, `+` opens journal, pull-to-refresh
- [ ] HomeDetailsScreen — opens from Home overview tap
- [ ] HomeMetricScreen — opens for each of sleep, recovery, strain
- [ ] SleepDetailScreen — renders hypnogram, HR chart, metrics list, confidence
- [ ] SleepPlannerScreen — stepper works, alarm toggle works, save persists
- [ ] TrendsScreen — all charts render, time-range buttons switch data
- [ ] StrainActivityScreen — chart + activity list render
- [ ] JournalEntryScreen — factor tap, intensity tap, save
- [ ] JournalHistoryScreen — entries show grouped by day, delete works
- [ ] DeviceScreen — empty state and (if strap available) connect/disconnect
- [ ] DeviceSettingsScreen — every toggle flips, retention picker opens
- [ ] DebugInspectorScreen — every count and timestamp renders

- [ ] **Step 2: Run on Android emulator (at minimum Pixel 6)**

Repeat the same checklist. Note any platform-specific layout issues; address with conditional style props (`$platform-android`) only if strictly needed.

- [ ] **Step 3: Type check and lint**

Run:
```bash
cd /Users/nishantgupta/Documents/noop/app && npx tsc --noEmit
cd /Users/nishantgupta/Documents/noop/app && npm run lint:check
```
Expected: both clean.

- [ ] **Step 4: Open PR with the full migration**

Branch: `feat/tamagui-migration` — push to origin.

PR title: `feat(app): migrate to Tamagui`

PR description must include:
- Link to spec: `docs/superpowers/specs/2026-04-18-tamagui-migration-design.md`
- Link to plan: `docs/superpowers/plans/2026-04-18-tamagui-migration.md`
- Before/after screenshots of all 14 product screens
- Bundle size before/after (run `npx expo export --platform ios` on main and on this branch; compare `dist/_expo/static/js/**` sizes)

- [ ] **Step 5: Final commit (QA notes only, if any)**

If QA surfaces any small fixes during the sweep, make them in this task's commit. Otherwise no commit for Task 24; it's verification.

```bash
# Only if fixes were needed during QA:
git add -u
git commit -m "fix(tamagui): regression-sweep fixes"
```

---

## Rollout notes

- **Order relative to SQLite spec:** file-disjoint. This plan touches `app/components/*`, `app/theme/*`, `app/screens/*`, `app.tsx` providers, `babel.config.js`, `package.json`. The SQLite plan touches `app/services/*` and screen data-fetch calls. Whichever merges first takes the merge conflict tax — expected to be trivial (different regions of the same file).
- **No flag or gate.** Big-bang per brainstorming decision; the PR either merges clean or reverts clean.
- **Post-merge:** delete the `feat/tamagui-migration` branch; archive screenshots in the PR for design reference.

---

**Total tasks: 24.** Covers every spec section: libraries (§1), file deletions/additions/rewrites (§2), migration order (§3), theme (§4), testing at every step (§5), open-question verification points (§6), non-goals respected by not touching those areas (§7).
