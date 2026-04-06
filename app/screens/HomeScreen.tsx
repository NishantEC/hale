import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Defs, RadialGradient, Stop, Ellipse, Circle } from "react-native-svg"
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  ViewProps,
  View,
  ViewStyle,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { PanGestureHandler, PanGestureHandlerGestureEvent } from "react-native-gesture-handler"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import { fetchJournalEntries, JournalEntryResponse } from "@/services/api/noopClient"

import { getDaySwipeAction, shouldLockHomeScroll } from "./HomeScreen.utils"

const ACCENT = "#C3E0FF"
const HOME_BACKGROUND = "#06070A"

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function addDays(key: string, days: number) {
  const next = dateFromKey(key)
  next.setDate(next.getDate() + days)
  const year = next.getFullYear()
  const month = String(next.getMonth() + 1).padStart(2, "0")
  const day = String(next.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatSelectedDateTitle(dateKey: string) {
  const date = dateFromKey(dateKey)
  const today = todayKey()
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)

  if (dateKey === today) return "Today"
  if (dateKey === yesterday) return "Yesterday"
  if (dateKey === tomorrow) return "Tomorrow"

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
}

export const HomeScreen: FC = () => {
  const { themed } = useAppTheme()
  const navigation = useNavigation<any>()
  const {
    selectedDate,
    homeView,
    liveDeviceState,
    error,
    isRefreshing,
    isSyncing,
    goToNextDay,
    goToPreviousDay,
    refreshDashboard,
    clearError,
  } = useDashboard()
  const [isHorizontalDaySwipeActive, setIsHorizontalDaySwipeActive] = useState(false)
  const [journalEntries, setJournalEntries] = useState<JournalEntryResponse[]>([])

  useEffect(() => {
    fetchJournalEntries(selectedDate)
      .then((res) => setJournalEntries(res.entries))
      .catch(() => setJournalEntries([]))
  }, [selectedDate])

  const batteryLabel =
    liveDeviceState.connectionState === "ready"
      ? liveDeviceState.batteryLevel == null
        ? "--"
        : `${Math.round(liveDeviceState.batteryLevel)}%`
      : isSyncing
        ? "..."
        : "--"

  const liveHeartRateTitle = liveDeviceState.realtimeHeartRate
    ? String(liveDeviceState.realtimeHeartRate)
    : homeView?.cards.liveHeartRate.title ?? "--"
  const liveHeartRateSubtitle = liveDeviceState.realtimeHeartRate
    ? "Live"
    : homeView?.cards.liveHeartRate.subtitle ?? "Offline"
  const isHomeViewPending = !homeView || homeView.selectedDate !== selectedDate
  const contentKey = isHomeViewPending ? `loading-${selectedDate}` : homeView?.selectedDate ?? selectedDate
  const selectedDateTitle = useMemo(() => formatSelectedDateTitle(selectedDate), [selectedDate])

  const hasRouteName = useCallback(
    (targetName: string) => {
      let current: any = navigation
      while (current) {
        const routeNames = current.getState?.()?.routeNames
        if (Array.isArray(routeNames) && routeNames.includes(targetName)) return true
        current = current.getParent?.()
      }
      return false
    },
    [navigation],
  )

  const navigateTo = useCallback(
    (legacyName: string, routerName: string, params?: Record<string, string>) => {
      const targetName = hasRouteName(routerName) ? routerName : legacyName
      navigation.navigate(targetName, params)
    },
    [hasRouteName, navigation],
  )

  const moveToPreviousDay = useCallback(() => {
    goToPreviousDay()
  }, [goToPreviousDay])

  const moveToNextDay = useCallback(() => {
    goToNextDay()
  }, [goToNextDay])

  const handleDaySwipeChanged = useCallback(
    ({ nativeEvent }: PanGestureHandlerGestureEvent) => {
      setIsHorizontalDaySwipeActive(
        shouldLockHomeScroll({
          translationX: nativeEvent.translationX,
          translationY: nativeEvent.translationY,
        }),
      )
    },
    [],
  )

  const finishDaySwipe = useCallback(
    (translationX: number, translationY: number) => {
      setIsHorizontalDaySwipeActive(false)

      const action = getDaySwipeAction({ translationX, translationY })

      if (action === "previous") {
        moveToPreviousDay()
      } else if (action === "next") {
        moveToNextDay()
      }
    },
    [moveToNextDay, moveToPreviousDay],
  )

  return (
    <PanGestureHandler
      minDist={8}
      onGestureEvent={handleDaySwipeChanged}
      onEnded={({ nativeEvent }) =>
        finishDaySwipe(Number(nativeEvent.translationX ?? 0), Number(nativeEvent.translationY ?? 0))
      }
      onCancelled={() => setIsHorizontalDaySwipeActive(false)}
      onFailed={() => setIsHorizontalDaySwipeActive(false)}
    >
      <View style={themed($screenWrap)}>
        <View pointerEvents="none" style={themed($backgroundGlowLayer)}>
          {/* Primary glow – top-right */}
          <Svg style={$glowPrimarySvg} viewBox="0 0 600 600">
            <Defs>
              <RadialGradient id="glowPrimary" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#4D9FFF" stopOpacity={0.18} />
                <Stop offset="30%" stopColor="#2B7AE8" stopOpacity={0.09} />
                <Stop offset="100%" stopColor="#06070A" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="300" cy="300" rx="300" ry="300" fill="url(#glowPrimary)" />
          </Svg>
          {/* Secondary glow – left-middle */}
          <Svg style={$glowSecondarySvg} viewBox="0 0 540 540">
            <Defs>
              <RadialGradient id="glowSecondary" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#4D9FFF" stopOpacity={0.12} />
                <Stop offset="35%" stopColor="#2B7AE8" stopOpacity={0.05} />
                <Stop offset="100%" stopColor="#06070A" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="270" cy="270" rx="270" ry="270" fill="url(#glowSecondary)" />
          </Svg>
        </View>
        <Screen
          backgroundColor="transparent"
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
            scrollEnabled: !isHorizontalDaySwipeActive,
          }}
        >
          {error ? (
            <View style={themed($errorCard)}>
              <View style={themed($rowBetween)}>
                <Text text={error} size="xs" style={themed($errorText)} />
                <TouchableOpacity onPress={clearError}>
                  <Text text="Dismiss" size="xs" style={themed($dismissText)} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={themed($topStrip)}>
            <DateSwitcher
              title={selectedDateTitle}
              onPrevious={moveToPreviousDay}
              onNext={moveToNextDay}
            />

            <DevicePill
              batteryLabel={batteryLabel}
              isCharging={liveDeviceState.isCharging}
              isConnected={liveDeviceState.connectionState === "ready"}
              onPress={() => navigateTo("DeviceSettings", "device-settings")}
            />
          </View>

          <View style={themed($dayContentWrap)}>
            {isHomeViewPending ? (
              <Animated.View
                key={contentKey}
                entering={FadeIn.duration(90)}
                exiting={FadeOut.duration(90)}
              >
                <HomeDaySkeleton />
              </Animated.View>
            ) : (
              <Animated.View
                key={contentKey}
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(90)}
              >
                <PrimaryMetricsList
                  items={[
                    {
                      id: "sleep",
                      label: "Sleep",
                      value: homeView?.rings.sleep.value ?? "--",
                      progress: homeView?.rings.sleep.progress ?? 0,
                      icon: "moon-outline",
                      onPress: () => navigateTo("Sleep", "sleep"),
                    },
                    {
                      id: "recovery",
                      label: "Recovery",
                      value: homeView?.rings.recovery.value ?? "--",
                      progress: homeView?.rings.recovery.progress ?? 0,
                      icon: "sparkles-outline",
                      onPress: () => navigateTo("HomeMetric", "home-metric", { metric: "recovery" }),
                    },
                    {
                      id: "strain",
                      label: "Strain",
                      value: homeView?.rings.strain.value ?? "--",
                      progress: homeView?.rings.strain.progress ?? 0,
                      icon: "flash-outline",
                      onPress: () => navigateTo("StrainActivity", "strain-activity"),
                    },
                  ]}
                />

                <View style={themed($myDayHeader)}>
                  <Text text="My Day" size="xxl" weight="bold" style={themed($myDayTitle)} />
                  <TouchableOpacity style={themed($plusButton)} onPress={() => navigateTo("JournalEntry", "journal-entry")}>
                    <Ionicons name="add" size={26} color="#09090B" />
                  </TouchableOpacity>
                </View>

                <JournalChips entries={journalEntries} />

                <View style={themed($actionList)}>
                  <HomeActionRow
                    title="Your day in review"
                    icon="moon-outline"
                    onPress={() => navigateTo("HomeDetails", "home-details")}
                  />
                  <HomeActionRow
                    title="Today's activities"
                    icon="walk-outline"
                    onPress={() => navigateTo("HomeMetric", "home-metric", { metric: "activities" })}
                  />
                  <HomeActionRow
                    title="Journal history"
                    icon="journal-outline"
                    onPress={() => navigateTo("JournalHistory", "journal-history")}
                  />
                </View>
              </Animated.View>
            )}
          </View>
        </Screen>
      </View>
    </PanGestureHandler>
  )
}

function DateSwitcher({
  title,
  onPrevious,
  onNext,
}: {
  title: string
  onPrevious: () => void
  onNext: () => void
}) {
  const { themed } = useAppTheme()

  return (
    <View style={themed($dateSwitcher)}>
      <TouchableOpacity style={themed($switcherButton)} onPress={onPrevious}>
        <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      <Text text={title} size="sm" weight="semiBold" style={themed($switcherTitle)} />
      <TouchableOpacity style={themed($switcherButton)} onPress={onNext}>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
    </View>
  )
}

function DevicePill({
  batteryLabel,
  isCharging,
  isConnected,
  onPress,
}: {
  batteryLabel: string
  isCharging: boolean
  isConnected: boolean
  onPress: () => void
}) {
  const { themed } = useAppTheme()

  return (
    <TouchableOpacity style={themed($devicePill)} onPress={onPress}>
      <View style={themed($deviceIconWrap)}>
        <Ionicons
          name="watch-outline"
          size={18}
          color={isConnected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)"}
        />
        {isCharging ? (
          <Ionicons name="flash" size={9} color="#5BE37A" style={themed($chargeBolt)} />
        ) : null}
      </View>
      <Text text={batteryLabel} size="xs" weight="bold" style={themed($devicePillText)} />
    </TouchableOpacity>
  )
}

function SkeletonBlock({ style }: { style?: ViewProps["style"] }) {
  const { themed } = useAppTheme()

  return <View style={[themed($skeletonBlock), style]} />
}

function HomeDaySkeleton() {
  const { themed } = useAppTheme()

  return (
    <View style={themed($homeDaySkeleton)}>
      <View style={themed($primaryMetricsSkeletonList)}>
        <SkeletonBlock style={themed($primaryMetricRowSkeleton)} />
        <SkeletonBlock style={themed($primaryMetricRowSkeleton)} />
        <SkeletonBlock style={themed($primaryMetricRowSkeleton)} />
      </View>

      <SkeletonBlock style={themed($compactMetricsSkeleton)} />

      <View style={themed($myDayHeader)}>
        <SkeletonBlock style={themed($myDayTitleSkeleton)} />
        <SkeletonBlock style={themed($plusSkeleton)} />
      </View>

      <View style={themed($actionList)}>
        <SkeletonBlock style={themed($actionRowSkeleton)} />
        <SkeletonBlock style={themed($actionRowSkeleton)} />
      </View>
    </View>
  )
}

function ArcRing({
  progress,
  size,
  strokeWidth,
  color,
  trackColor = "rgba(255,255,255,0.08)",
}: {
  progress: number
  size: number
  strokeWidth: number
  color: string
  trackColor?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  const strokeDashoffset = circumference * (1 - clamped)

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  )
}

const RING_COLOR_SLEEP = "#A78BFA"
const RING_COLOR_RECOVERY = "#34D399"
const RING_COLOR_STRAIN = "#F59E0B"

function PrimaryMetricsList({
  items,
}: {
  items: Array<{
    id: string
    label: string
    value: string
    progress: number
    icon: keyof typeof Ionicons.glyphMap
    onPress: () => void
  }>
}) {
  const { themed } = useAppTheme()

  const recovery = items.find((i) => i.id === "recovery")
  const pills = items.filter((i) => i.id !== "recovery")

  const ringProgress = Math.max(0, Math.min(1, recovery?.progress ?? 0))
  const ringPercent = Math.round(ringProgress * 100)

  const pillColor = (id: string) => {
    if (id === "sleep") return RING_COLOR_SLEEP
    if (id === "strain") return RING_COLOR_STRAIN
    return ACCENT
  }

  const blobColor = (id: string) => {
    if (id === "sleep") return "#A78BFA" // purple
    return "#FF541B" // orange like reference
  }

  const innerShadowColor = (id: string) => {
    if (id === "sleep") return "rgba(167,139,250,0.8)"
    return "rgba(255,84,27,0.8)" // #FF541B
  }

  return (
    <View style={themed($primaryMetricsList)}>
      {/* Left: large recovery ring */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={recovery?.onPress}
        style={$ringContainer}
      >
        <ArcRing
          progress={ringProgress}
          size={148}
          strokeWidth={12}
          color={RING_COLOR_RECOVERY}
        />
        <View style={$ringCenterContent}>
          <Text
            text={`${ringPercent}%`}
            size="xxl"
            weight="bold"
            style={$ringValue}
          />
          <Text
            text="Recovery"
            size="xxs"
            weight="medium"
            style={$ringLabel}
          />
        </View>
      </TouchableOpacity>

      {/* Right: stacked glass cards */}
      <View style={$pillStack}>
        {pills.map((item) => {
          const blob = blobColor(item.id)
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.88}
              onPress={item.onPress}
              style={$glassCardShadow}
            >
              <View style={$glassCardClip}>
                {/* Dark card base */}
                <View style={$glassCardBase} />

                {/* Color blob – top-right only */}
                <Svg style={$glassBlob} viewBox="0 0 200 200">
                  <Defs>
                    <RadialGradient id={`blob-${item.id}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor={blob} stopOpacity={0.7} />
                      <Stop offset="30%" stopColor={blob} stopOpacity={0.3} />
                      <Stop offset="60%" stopColor={blob} stopOpacity={0.08} />
                      <Stop offset="100%" stopColor={blob} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Ellipse cx="100" cy="100" rx="100" ry="100" fill={`url(#blob-${item.id})`} />
                </Svg>

                {/* Frost / blur overlay */}
                {Platform.OS === "ios" ? (
                  <BlurView intensity={74} tint="dark" style={$glassBlurOverlay} />
                ) : (
                  <View style={[$glassBlurOverlay, { backgroundColor: "rgba(6,7,10,0.45)" }]} />
                )}

                {/* Subtle border overlay */}
                <View style={$glassBorder} />

                {/* Content */}
                <View style={$glassCardContent}>
                  <View style={$glassCardTop}>
                    <Text text={item.label} size="xs" weight="medium" style={$glassCardLabel} />
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                  </View>
                  <Text text={item.value} size="xxl" weight="bold" style={$glassCardValue} />
                </View>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const INSIGHT_COLORS: Record<string, { accent: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  health: { accent: "#34D399", bg: "rgba(52,211,153,0.12)", icon: "heart-outline" },
  stress: { accent: "#F87171", bg: "rgba(248,113,113,0.12)", icon: "pulse-outline" },
  load: { accent: "#F59E0B", bg: "rgba(245,158,11,0.12)", icon: "barbell-outline" },
  heart: { accent: "#60A5FA", bg: "rgba(96,165,250,0.12)", icon: "fitness-outline" },
}

function CompactInsightStrip({
  items,
}: {
  items: Array<{
    id: string
    label: string
    value: string
    detail: string
    onPress: () => void
  }>
}) {
  return (
    <View style={$insightGrid}>
      {items.map((item) => {
        const colors = INSIGHT_COLORS[item.id] ?? { accent: ACCENT, bg: "rgba(195,224,255,0.10)", icon: "ellipse-outline" as const }
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.85}
            onPress={item.onPress}
            style={[$insightCard, { backgroundColor: colors.bg }]}
          >
            <View style={$insightCardTop}>
              <View style={[$insightIconBadge, { backgroundColor: colors.accent }]}>
                <Ionicons name={colors.icon} size={13} color="#fff" />
              </View>
              <Text text={item.label} size="xxs" weight="bold" style={{ color: colors.accent, letterSpacing: 0.3 }} />
            </View>
            <Text text={item.value} size="lg" weight="bold" style={$insightValue} numberOfLines={1} />
            <Text text={item.detail} size="xxs" style={$insightDetail} numberOfLines={1} />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function JournalChips({ entries }: { entries: JournalEntryResponse[] }) {
  if (entries.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={$chipScroll}
      contentContainerStyle={$chipScrollContent}
    >
      {entries.map((entry) => {
        const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
        const color = factor?.color ?? "#60A5FA"
        return (
          <View key={entry.id} style={[$chip, { borderLeftColor: color, borderLeftWidth: 3 }]}>
            <Ionicons
              name={(factor?.icon ?? "ellipse-outline") as keyof typeof Ionicons.glyphMap}
              size={14}
              color={color}
            />
            <Text
              text={factor?.label ?? entry.factorTag}
              size="xxs"
              weight="medium"
              style={{ color: "#fff" }}
            />
            <Text
              text={`${entry.intensity}`}
              size="xxs"
              style={{ color: "rgba(255,255,255,0.5)" }}
            />
          </View>
        )
      })}
    </ScrollView>
  )
}

function HomeActionRow({
  title,
  icon,
  onPress,
}: {
  title: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  const { themed } = useAppTheme()

  return (
    <TouchableOpacity activeOpacity={0.9} style={themed($actionRow)} onPress={onPress}>
      <View style={themed($actionIconWrap)}>
        <Ionicons name={icon} size={22} color="rgba(255,255,255,0.86)" />
      </View>
      <Text text={title} size="lg" weight="semiBold" style={themed($actionTitle)} />
      <View style={{ flex: 1 }} />
      <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.82)" />
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xl,
  paddingBottom: 132,
  paddingHorizontal: 20,
  paddingTop: 18,
})

const $rowBetween: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 10,
})

const $screenWrap: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: HOME_BACKGROUND,
  flex: 1,
})

const $backgroundGlowLayer: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  overflow: "hidden",
})

const $glowPrimarySvg: ViewStyle = {
  height: 600,
  position: "absolute",
  right: -220,
  top: -160,
  width: 600,
}

const $glowSecondarySvg: ViewStyle = {
  height: 540,
  left: -240,
  position: "absolute",
  top: 140,
  width: 540,
}

const $errorCard: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(110,18,18,0.55)",
  borderColor: "rgba(255,255,255,0.06)",
  borderRadius: 18,
  borderWidth: 1,
  paddingHorizontal: 14,
  paddingVertical: 12,
})

const $errorText: ThemedStyle<TextStyle> = () => ({
  color: "#FFD0D0",
  flex: 1,
})

const $dismissText: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
})

const $topStrip: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 6,
})

const $dateSwitcher: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.05)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 999,
  borderWidth: 1,
  flexDirection: "row",
  paddingHorizontal: 6,
  paddingVertical: 4,
})

const $switcherButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.04)",
  borderRadius: 999,
  height: 26,
  justifyContent: "center",
  width: 26,
})

const $switcherTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.95)",
  fontSize: 13,
  lineHeight: 16,
  minWidth: 82,
  paddingHorizontal: 8,
  textAlign: "center",
})

const $devicePill: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 3,
  minHeight: 32,
  paddingHorizontal: 0,
  paddingVertical: 0,
})

const $deviceIconWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 22,
  justifyContent: "center",
  position: "relative",
  width: 22,
})

const $chargeBolt: ThemedStyle<TextStyle> = () => ({
  position: "absolute",
  right: -2,
  top: -4,
})

const $devicePillText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
  fontSize: 18,
  lineHeight: 22,
  minWidth: 34,
  textAlign: "center",
})

const $skeletonBlock: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255,255,255,0.12)",
  borderColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
})

const $dayContentWrap: ThemedStyle<ViewStyle> = () => ({
  gap: 16,
})

const $homeDaySkeleton: ThemedStyle<ViewStyle> = () => ({
  gap: 22,
})

const $primaryMetricsSkeletonList: ThemedStyle<ViewStyle> = () => ({
  gap: 10,
})

const $primaryMetricRowSkeleton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 14,
  height: 44,
})

const $compactMetricsSkeleton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 24,
  height: 112,
})

const $myDayTitleSkeleton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  height: 26,
  width: 120,
})

const $plusSkeleton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  height: 42,
  width: 42,
})

const $actionRowSkeleton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 22,
  height: 78,
})

const $primaryMetricsList: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 16,
  marginBottom: 18,
})

const $ringContainer: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}

const $ringCenterContent: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  alignItems: "center",
  justifyContent: "center",
}

const $ringValue: TextStyle = {
  color: "#fff",
  fontVariant: ["tabular-nums"],
  fontSize: 32,
  lineHeight: 36,
}

const $ringLabel: TextStyle = {
  color: "rgba(255,255,255,0.55)",
  marginTop: 2,
}

const $pillStack: ViewStyle = {
  flex: 1,
  gap: 12,
}

const $glassCardShadow: ViewStyle = {
  borderRadius: 22,
  minHeight: 90,
  // Drop shadow matching reference: X:0 Y:16 Blur:28.5 Color:#000 5%
  ...Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.05,
      shadowRadius: 28.5,
    },
    android: { elevation: 8 },
  }),
}

const $glassCardClip: ViewStyle = {
  borderRadius: 22,
  overflow: "hidden",
  flex: 1,
}

const $glassCardBase: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(20,20,25,0.92)",
}

const $glassBlob: ViewStyle = {
  height: 120,
  position: "absolute",
  right: -55,
  top: -55,
  width: 120,
}

const $glassBlurOverlay: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
}

const $glassBorder: ViewStyle = {
  ...StyleSheet.absoluteFillObject,
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 22,
  borderWidth: 1,
}

const $glassCardContent: ViewStyle = {
  flex: 1,
  justifyContent: "space-between",
  paddingHorizontal: 18,
  paddingVertical: 16,
}

const $glassCardTop: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
}

const $glassCardLabel: TextStyle = {
  color: "rgba(255,255,255,0.65)",
  letterSpacing: 0.3,
}

const $glassCardValue: TextStyle = {
  color: "#fff",
  fontVariant: ["tabular-nums"],
  fontSize: 28,
  lineHeight: 34,
  marginTop: 4,
}

const $insightGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 18,
}

const $insightCard: ViewStyle = {
  borderRadius: 16,
  flex: 1,
  gap: 4,
  minWidth: "45%",
  paddingHorizontal: 14,
  paddingVertical: 14,
}

const $insightCardTop: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  gap: 6,
  marginBottom: 4,
}

const $insightIconBadge: ViewStyle = {
  alignItems: "center",
  borderRadius: 8,
  height: 22,
  justifyContent: "center",
  width: 22,
}

const $insightValue: TextStyle = {
  color: "#fff",
  fontVariant: ["tabular-nums"],
}

const $insightDetail: TextStyle = {
  color: "rgba(255,255,255,0.45)",
}

const _$compactMetricsStrip: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255,255,255,0.085)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 24,
  borderWidth: 1,
  flexDirection: "row",
  marginTop: 8,
  overflow: "hidden",
})

const $compactMetricItem: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 5,
  justifyContent: "center",
  minHeight: 104,
  paddingHorizontal: 8,
  paddingVertical: 12,
})

const $compactMetricDivider: ThemedStyle<ViewStyle> = () => ({
  borderRightColor: "rgba(255,255,255,0.08)",
  borderRightWidth: 1,
})

const $compactMetricLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.4,
  textAlign: "center",
})

const $compactMetricValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
  fontSize: 13,
  lineHeight: 16,
  minHeight: 32,
  textAlign: "center",
})

const $compactMetricDetail: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.48)",
  textAlign: "center",
})

const $myDayHeader: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 28,
})

const $myDayTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.98)",
})

const $plusButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.96)",
  borderRadius: 999,
  height: 64,
  justifyContent: "center",
  width: 64,
})

const $actionList: ThemedStyle<ViewStyle> = () => ({
  gap: 20,
})

const $actionRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.085)",
  borderColor: "rgba(255,255,255,0.06)",
  borderRadius: 22,
  borderWidth: 1,
  flexDirection: "row",
  gap: 12,
  minHeight: 92,
  paddingHorizontal: 18,
})

const $actionIconWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  width: 28,
})

const $actionTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.94)",
})

const $chipScroll: ViewStyle = {
  marginBottom: 8,
  marginTop: 12,
}

const $chipScrollContent: ViewStyle = {
  gap: 8,
}

const $chip: ViewStyle = {
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.085)",
  borderRadius: 12,
  flexDirection: "row",
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
}
