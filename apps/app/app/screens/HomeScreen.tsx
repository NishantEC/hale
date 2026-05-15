import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  RefreshControl,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  ViewProps,
  View,
  ViewStyle,
} from "react-native"
import { PhosphorIcon } from "@/components/PhosphorIcon"
import { useNavigation } from "@react-navigation/native"
import { PanGestureHandler, PanGestureHandlerGestureEvent } from "react-native-gesture-handler"
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { BlurHeader } from "@/components/BlurHeader"
import { DateSwitcher } from "@/components/DateSwitcher"
import { MetricRingsRow } from "@/components/home/MetricRingsRow"
import { type MetricCell } from "@/components/home/MetricsBar"
import { StatsHealthSwitcher } from "@/components/home/StatsHealthSwitcher"
import { PendingActivityCards } from "@/components/home/PendingActivityCards"
import { TodayCard } from "@/components/home/TodayCard"
import { Shimmer } from "@/components/reactx/Shimmer"
import { Toast } from "@/components/reactx/toast"
import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { useHealthKit } from "@/context/HealthKitContext"
import { buildTodayTape, type TapeEvent } from "@/utils/buildTodayTape"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"
import { recoveryVerdict } from "@/utils/recoveryVerdict"

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
    error,
    isRefreshing,
    goToNextDay,
    goToPreviousDay,
    refreshDashboard,
    clearError,
  } = useDashboard()
  const { connectionState, batteryLevel, isCharging, isSyncing } = useBle()
  const { setActiveDate: setHealthKitActiveDate } = useHealthKit()
  const [isHorizontalDaySwipeActive, setIsHorizontalDaySwipeActive] = useState(false)
  const lastShownError = useRef<string | null>(null)

  useEffect(() => {
    setHealthKitActiveDate(selectedDate)
  }, [selectedDate, setHealthKitActiveDate])

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
    connectionState === "ready"
      ? batteryLevel == null
        ? "--"
        : `${batteryLevel.toFixed(1)}%`
      : isSyncing
        ? "..."
        : "--"

  const isHomeViewPending = !homeView || homeView.selectedDate !== selectedDate
  const hasFailedLoad = useRef(false)
  if (error) hasFailedLoad.current = true
  if (homeView) hasFailedLoad.current = false
  const isHomeViewLoading = isHomeViewPending && !hasFailedLoad.current
  const contentKey = isHomeViewPending
    ? `loading-${selectedDate}`
    : (homeView?.selectedDate ?? selectedDate)
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

  const handleDaySwipeChanged = useCallback(({ nativeEvent }: PanGestureHandlerGestureEvent) => {
    setIsHorizontalDaySwipeActive(
      shouldLockHomeScroll({
        translationX: nativeEvent.translationX,
        translationY: nativeEvent.translationY,
      }),
    )
  }, [])

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

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  const recoveryProgress = homeView?.rings.recovery.progress ?? 0
  const recoveryLabelText = homeView?.rings.recovery.value ?? "--"
  const recoveryNumeric = homeView?.rings.recovery.value
    ? parseFloat(homeView.rings.recovery.value)
    : null
  const verdict = recoveryVerdict(recoveryNumeric)

  const ringTrio = [
    {
      key: "sleep",
      label: "Sleep",
      value: homeView?.rings.sleep.value ?? "--",
      unit: "%",
      progress: homeView?.rings.sleep.progress ?? 0,
      color: colors.ringSleep,
      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
    },
    {
      key: "recovery",
      label: "Recovery",
      value: homeView?.rings.recovery.value ?? "--",
      unit: "%",
      progress: homeView?.rings.recovery.progress ?? 0,
      color: colors.ringRecovery,
      onPress: () => navigateTo("HomeMetric", "home-metric", { metric: "recovery" }),
    },
    {
      key: "strain",
      label: "Strain",
      value: homeView?.rings.strain.value ?? "--",
      unit: "/21",
      progress: homeView?.rings.strain.progress ?? 0,
      color: colors.ringStrain,
      onPress: () => navigateTo("StrainActivity", "strain-activity"),
    },
  ] as const

  const metricCells: MetricCell[] = [
    {
      key: "hrv",
      label: "HRV",
      value: homeView?.activities.hrv ?? "--",
      unit: "ms",
      dotColor: colors.ringHrv,
      onPress: () => navigateTo("HrvDetail", "hrv-detail"),
    },
    {
      key: "rhr",
      label: "RHR",
      value: homeView?.activities.restingHr ?? "--",
      unit: "bpm",
      dotColor: colors.ringStrain,
    },
    {
      key: "resp",
      label: "RESP",
      value: "--",
      unit: "/min",
      dotColor: colors.ringSleep,
    },
    {
      key: "spo2",
      label: "SPO₂",
      value: (homeView?.activities.spo2 ?? "--").replace("%", ""),
      unit: "%",
      dotColor: colors.ringRecovery,
    },
  ]

  const tapeEvents = useMemo<TapeEvent[]>(
    () =>
      buildTodayTape({
        homeView,
        journalEntries: [],
        now: Date.now(),
        colors: {
          ringRecovery: colors.ringRecovery,
          ringSleep: colors.ringSleep,
          ringStrain: colors.ringStrain,
          ringHrv: colors.ringHrv,
          tint: colors.tint,
        },
        selectedDate,
      }),
    [
      homeView,
      selectedDate,
      colors.ringRecovery,
      colors.ringSleep,
      colors.ringStrain,
      colors.ringHrv,
      colors.tint,
    ],
  )

  function handleTapePress(event: TapeEvent) {
    switch (event.type) {
      case "sleep":
        navigateTo("SleepDetail", "sleep-detail", { date: selectedDate })
        break
      case "recovery":
      case "vital":
        navigateTo("HomeMetric", "home-metric", { metric: "recovery" })
        break
      case "workout":
        navigateTo("StrainActivity", "strain-activity")
        break
    }
  }

  return (
    <PanGestureHandler
      activeOffsetX={[-15, 15]}
      failOffsetY={[-15, 15]}
      onGestureEvent={handleDaySwipeChanged}
      onEnded={({ nativeEvent }) =>
        finishDaySwipe(Number(nativeEvent.translationX ?? 0), Number(nativeEvent.translationY ?? 0))
      }
      onCancelled={() => setIsHorizontalDaySwipeActive(false)}
      onFailed={() => setIsHorizontalDaySwipeActive(false)}
    >
      <SafeAreaView style={themed($screenWrap)} edges={["top"]}>
        <Animated.ScrollView
          contentContainerStyle={themed($container)}
          onScroll={onScroll}
          scrollEventThrottle={16}
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
              isCharging={isCharging}
              isConnected={connectionState === "ready"}
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
                <MetricRingsRow
                  rings={[ringTrio[0], ringTrio[1], ringTrio[2]] as any}
                />

                <StatsHealthSwitcher statsCells={metricCells} />

                <PendingActivityCards
                  cards={homeView?.pendingActivityCards ?? []}
                  onResolved={refreshDashboard}
                />

                <TodayCard events={tapeEvents} onEventPress={handleTapePress} />
              </Animated.View>
            )}
          </View>
        </Animated.ScrollView>

        <BlurHeader title={selectedDateTitle} scrollY={scrollY} fadeOver={56} />
      </SafeAreaView>
    </PanGestureHandler>
  )
}

function ComposeButton({ onPress }: { onPress: () => void }) {
  const colors = LOCAL_THEME.colors
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="New journal entry"
      style={themed($composeButton)}
      onPress={onPress}
    >
      <PhosphorIcon name="note-pencil-outline" size={18} color={colors.text} />
    </TouchableOpacity>
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
        <PhosphorIcon
          name="watch-outline"
          size={18}
          color={isConnected ? colors.text : colors.textDim}
        />
        {isCharging ? (
          <PhosphorIcon name="flash" size={9} color={colors.statusGreen} style={themed($chargeBolt)} />
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
  return (
    <View style={themed($homeDaySkeleton)}>
      <View style={{ alignItems: "center", marginTop: 16, marginBottom: 24 }}>
        <SkeletonBlock style={{ width: 160, height: 160, borderRadius: 80 }} />
        <SkeletonBlock style={{ width: 120, height: 14, borderRadius: 4, marginTop: 12 }} />
      </View>
      <SkeletonBlock style={{ width: 50, height: 10, borderRadius: 4, marginBottom: 8 }} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
          <SkeletonBlock style={{ flex: 1, height: 76, borderRadius: 12 }} />
        </View>
      </View>
      <SkeletonBlock
        style={{ width: 80, height: 10, borderRadius: 4, marginTop: 28, marginBottom: 8 }}
      />
      <View style={{ gap: 6 }}>
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
        <SkeletonBlock style={{ height: 44, borderRadius: 4 }} />
      </View>
    </View>
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

const $topStrip: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 6,
})

const $topStripRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 10,
})

const $composeButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
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
