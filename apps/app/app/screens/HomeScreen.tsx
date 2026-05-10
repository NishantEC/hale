import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  ViewProps,
  View,
  ViewStyle,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
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
import { RecoveryHero } from "@/components/home/RecoveryHero"
import { StatGrid, type StatGridItem } from "@/components/home/StatGrid"
import { TodayTape } from "@/components/home/TodayTape"
import { Shimmer } from "@/components/reactx/Shimmer"
import { Toast } from "@/components/reactx/toast"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { fetchJournalEntries, JournalEntryResponse } from "@/services/api/noopClient"
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
  const recoveryLabelText = homeView?.rings.recovery.value
    ? `${homeView.rings.recovery.value}%`
    : "--"
  const recoveryNumeric = homeView?.rings.recovery.value
    ? parseFloat(homeView.rings.recovery.value)
    : null
  const verdict = recoveryVerdict(recoveryNumeric)

  const statItems: StatGridItem[] = [
    {
      key: "sleep",
      label: "Sleep",
      value: homeView?.rings.sleep.value ?? "--",
      desc: undefined,
      tint: colors.ringSleep,
      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
    },
    {
      key: "strain",
      label: "Strain",
      value: homeView?.rings.strain.value ?? "--",
      desc: undefined,
      tint: colors.ringStrain,
      onPress: () => navigateTo("StrainActivity", "strain-activity"),
    },
    {
      key: "hrv",
      label: "HRV",
      value: homeView?.activities.recoveryIndex || "--",
      desc: "ms",
      tint: colors.ringHrv,
      onPress: () => navigateTo("HomeMetric", "home-metric", { metric: "recovery" }),
    },
    {
      key: "journal",
      label: "Journal",
      value: String(journalEntries.length),
      desc: journalEntries.length === 1 ? "entry" : "entries",
      tint: colors.tint,
      onPress: () => navigateTo("JournalHistory", "journal-history"),
    },
  ]

  const tapeEvents = useMemo<TapeEvent[]>(
    () =>
      buildTodayTape({
        homeView,
        journalEntries,
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
      journalEntries,
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
      case "journal":
        navigateTo(
          "JournalEntry",
          "journal-entry",
          event.payload?.journalEntryId ? { id: event.payload.journalEntryId } : undefined,
        )
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
                <RecoveryHero
                  value={recoveryProgress}
                  label={recoveryLabelText}
                  verdict={verdict.verdict}
                  verdictDetail={verdict.detail}
                  onPress={() => navigateTo("HomeMetric", "home-metric", { metric: "recovery" })}
                />

                <Text
                  text="STATS"
                  style={{
                    color: colors.textDim,
                    fontSize: 8,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    marginBottom: 8,
                    marginLeft: 2,
                  }}
                />
                <StatGrid items={statItems} />

                <Text
                  text="TODAY'S TAPE"
                  style={{
                    color: colors.textDim,
                    fontSize: 8,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    marginTop: 28,
                    marginBottom: 8,
                    marginLeft: 2,
                  }}
                />
                <TodayTape events={tapeEvents} onEventPress={handleTapePress} />
              </Animated.View>
            )}
          </View>
        </Animated.ScrollView>

        <Pressable
          onPress={() => navigateTo("JournalEntry", "journal-entry")}
          hitSlop={8}
          accessibilityLabel="Log a journal entry"
          accessibilityRole="button"
          style={({ pressed }) => [
            $tabBarFab,
            { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
            pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.tint} />
        </Pressable>

        <BlurHeader title={selectedDateTitle} scrollY={scrollY} fadeOver={56} />
      </SafeAreaView>
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

const $tabBarFab: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  borderWidth: 1,
  bottom: 32,
  height: 44,
  justifyContent: "center",
  position: "absolute",
  right: 20,
  width: 44,
  zIndex: 20,
  ...Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
  }),
}

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
