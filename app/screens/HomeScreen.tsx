import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Defs, RadialGradient, Stop, Ellipse } from "react-native-svg"
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
import Animated, { FadeIn, FadeInRight, FadeOut, FadeOutLeft, useSharedValue, withTiming, Easing } from "react-native-reanimated"

import { SafeAreaView } from "react-native-safe-area-context"
import { Text } from "@/components/Text"
import { CircularProgress } from "@/components/reactx/circular-progress"
import { Glow } from "@/components/reactx/glow"
import { RollingCounter } from "@/components/reactx/rolling-counter"
import { Shimmer } from "@/components/reactx/Shimmer"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import { fetchJournalEntries, JournalEntryResponse } from "@/services/api/noopClient"

import { getDaySwipeAction, shouldLockHomeScroll } from "./HomeScreen.utils"

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
  const colors = LOCAL_THEME.colors
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
  const lastShownError = useRef<string | null>(null)

  useEffect(() => {
    fetchJournalEntries(selectedDate)
      .then((res) => setJournalEntries(res.entries))
      .catch(() => setJournalEntries([]))
  }, [selectedDate])

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

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
  const hasFailedLoad = useRef(false)
  if (error) hasFailedLoad.current = true
  if (homeView) hasFailedLoad.current = false
  const isHomeViewLoading = isHomeViewPending && !hasFailedLoad.current
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
                <Stop offset="0%" stopColor={colors.glowPrimary} stopOpacity={0.18} />
                <Stop offset="30%" stopColor={colors.glowPrimaryFade} stopOpacity={0.09} />
                <Stop offset="100%" stopColor={colors.glowBackground} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="300" cy="300" rx="300" ry="300" fill="url(#glowPrimary)" />
          </Svg>
          {/* Secondary glow – left-middle */}
          <Svg style={$glowSecondarySvg} viewBox="0 0 540 540">
            <Defs>
              <RadialGradient id="glowSecondary" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.glowPrimary} stopOpacity={0.12} />
                <Stop offset="35%" stopColor={colors.glowPrimaryFade} stopOpacity={0.05} />
                <Stop offset="100%" stopColor={colors.glowBackground} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="270" cy="270" rx="270" ry="270" fill="url(#glowSecondary)" />
          </Svg>
        </View>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={themed($container)}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refreshDashboard}
                tintColor={colors.tint}
              />
            }
            scrollEnabled={!isHorizontalDaySwipeActive}
          >
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
            {isHomeViewLoading ? (
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
                      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
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
                    <Ionicons name="add" size={26} color={colors.onPrimary} />
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
          </ScrollView>
        </SafeAreaView>
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
  const colors = LOCAL_THEME.colors

  return (
    <View style={themed($dateSwitcher)}>
      <TouchableOpacity style={themed($switcherButton)} onPress={onPrevious}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>
      <Animated.Text
        key={title}
        entering={FadeInRight.duration(200)}
        exiting={FadeOutLeft.duration(150)}
        style={themed($switcherTitle)}
      >
        {title}
      </Animated.Text>
      <TouchableOpacity style={themed($switcherButton)} onPress={onNext}>
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
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
  const colors = LOCAL_THEME.colors

  return (
    <TouchableOpacity style={themed($devicePill)} onPress={onPress}>
      <View style={themed($deviceIconWrap)}>
        <Ionicons
          name="watch-outline"
          size={18}
          color={isConnected ? colors.text : colors.textDim}
        />
        {isCharging ? (
          <Ionicons name="flash" size={9} color={colors.statusGreen} style={themed($chargeBolt)} />
        ) : null}
      </View>
      <Text text={batteryLabel} size="xs" weight="bold" style={themed($devicePillText)} />
    </TouchableOpacity>
  )
}

function SkeletonBlock({ style }: { style?: ViewProps["style"] }) {
  const theme = LOCAL_THEME

  return (
    <Shimmer
      isLoading
      preset={theme.isDark ? "dark" : "neutral"}
      duration={1200}
      style={StyleSheet.flatten([themed($skeletonBlock), style]) as ViewStyle}
    />
  )
}

function HomeDaySkeleton() {
  // themed helper is imported from @/utils/localTheme

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
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  const recovery = items.find((i) => i.id === "recovery")
  const pills = items.filter((i) => i.id !== "recovery")

  const ringPercent = Math.round(Math.max(0, Math.min(1, recovery?.progress ?? 0)) * 100)
  const ringProgressSV = useSharedValue(0)

  useEffect(() => {
    ringProgressSV.value = withTiming(ringPercent, { duration: 800, easing: Easing.out(Easing.ease) })
  }, [ringPercent, ringProgressSV])

  const blobColor = (id: string) => {
    if (id === "sleep") return colors.ringSleep
    return colors.ringStrain
  }

  return (
    <View style={themed($primaryMetricsList)}>
      {/* Left: large recovery ring */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={recovery?.onPress}
        style={$ringContainer}
      >
        <CircularProgress
          progress={ringProgressSV}
          size={148}
          strokeWidth={6}
          progressCircleColor={colors.ringRecovery}
          outerCircleColor={colors.surfaceElevated}
          backgroundColor="transparent"
          gap={0}
          renderIcon={() => (
            <View style={$ringCenterContent}>
              <View style={$ringValueRow}>
                <RollingCounter
                  value={ringPercent}
                  height={36}
                  width={22}
                  fontSize={32}
                  color={colors.onSurface}
                />
                <Text text="%" size="lg" weight="bold" style={themed($ringPercentSign)} />
              </View>
              <Text
                text="Recovery"
                size="xxs"
                weight="medium"
                style={themed($ringLabel)}
              />
            </View>
          )}
        />
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
                <View style={themed($glassCardBase)} />

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
                  <BlurView intensity={74} tint={isDark ? "dark" : "light"} style={$glassBlurOverlay} />
                ) : (
                  <View style={[$glassBlurOverlay, { backgroundColor: colors.cardBase }]} />
                )}

                {/* Subtle border overlay */}
                <View style={themed($glassBorder)} />

                {/* Content */}
                <View style={$glassCardContent}>
                  <View style={$glassCardTop}>
                    <Text text={item.label} size="xs" weight="medium" style={themed($glassCardLabel)} />
                    <Ionicons name="chevron-forward" size={16} color={colors.iconDim} />
                  </View>
                  <Text text={item.value} size="xxl" weight="bold" style={themed($glassCardValue)} />
                </View>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function chipDetail(factor: (typeof JOURNAL_FACTORS)[number] | undefined, intensity: number): string | null {
  if (!factor) return `${intensity}`
  const { input } = factor
  if (input.kind === "toggle") return null
  if (input.kind === "quantity") return `${intensity} ${input.unit}`
  if (input.kind === "scale") return input.labels[intensity - 1] ?? `${intensity}`
  return `${intensity}`
}

function JournalChips({ entries }: { entries: JournalEntryResponse[] }) {
  const colors = LOCAL_THEME.colors
  if (entries.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={$chipScroll}
      contentContainerStyle={$chipScrollContent}
    >
      {entries.map((entry, index) => {
        const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
        const color = factor?.color ?? colors.tint
        const detail = chipDetail(factor, entry.intensity)
        return (
          <Animated.View
            key={entry.id}
            entering={FadeIn.delay(index * 60).duration(200)}
            style={[themed($chip), { borderLeftColor: color, borderLeftWidth: 3 }]}
          >
            <Ionicons
              name={(factor?.icon ?? "ellipse-outline") as keyof typeof Ionicons.glyphMap}
              size={14}
              color={color}
            />
            <Text
              text={factor?.label ?? entry.factorTag}
              size="xxs"
              weight="medium"
              style={{ color: colors.text }}
            />
            {detail && (
              <Text
                text={detail}
                size="xxs"
                style={{ color: colors.textDim }}
              />
            )}
          </Animated.View>
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
  const colors = LOCAL_THEME.colors

  return (
    <TouchableOpacity activeOpacity={0.9} style={themed($actionRow)} onPress={onPress}>
      <View style={themed($actionIconWrap)}>
        <Ionicons name={icon} size={22} color={colors.iconDefault} />
      </View>
      <Text text={title} size="lg" weight="semiBold" style={themed($actionTitle)} />
      <View style={{ flex: 1 }} />
      <Ionicons name="chevron-forward" size={24} color={colors.iconDefault} />
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xl,
  paddingBottom: 132,
  paddingHorizontal: 20,
  paddingTop: 18,
})

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
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


const $topStrip: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 6,
})

const $dateSwitcher: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceSubtle,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 999,
  borderWidth: 1,
  flexDirection: "row",
  paddingHorizontal: 6,
  paddingVertical: 4,
})

const $switcherButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceCard,
  borderRadius: 999,
  height: 26,
  justifyContent: "center",
  width: 26,
})

const $switcherTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
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

const $devicePillText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 18,
  lineHeight: 22,
  minWidth: 34,
  textAlign: "center",
})

const $skeletonBlock: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
  borderColor: colors.surfaceSubtle,
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
  alignItems: "center",
  justifyContent: "center",
}

const $ringValueRow: ViewStyle = {
  alignItems: "baseline",
  flexDirection: "row",
}

const $ringPercentSign: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
  marginLeft: 1,
})

const $ringLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  marginTop: 2,
})

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

const $glassCardBase: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: colors.cardBase,
})

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

const $glassBorder: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 22,
  borderWidth: 1,
})

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

const $glassCardLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  letterSpacing: 0.3,
})

const $glassCardValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
  fontVariant: ["tabular-nums"],
  fontSize: 28,
  lineHeight: 34,
  marginTop: 4,
})

const $myDayHeader: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 28,
})

const $myDayTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $plusButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 999,
  height: 64,
  justifyContent: "center",
  width: 64,
})

const $actionList: ThemedStyle<ViewStyle> = () => ({
  gap: 20,
})

const $actionRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderColor: colors.divider,
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

const $actionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $chipScroll: ViewStyle = {
  marginBottom: 8,
  marginTop: 12,
}

const $chipScrollContent: ViewStyle = {
  gap: 8,
}

const $chip: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 12,
  flexDirection: "row",
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
})
