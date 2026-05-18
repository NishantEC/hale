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
import { Brain, Check, ClockCountdown, Heartbeat, Lightning, NotePencil, Watch, Warning, WarningOctagon } from "phosphor-react-native"
import { useNavigation } from "@react-navigation/native"
import { PanGestureHandler, PanGestureHandlerGestureEvent } from "react-native-gesture-handler"
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { BlurHeader } from "@/components/BlurHeader"
import { DateSwitcher } from "@/components/DateSwitcher"
import { HomeDateCalendar } from "@/components/home/HomeDateCalendar"
import { MetricRingsRow } from "@/components/home/MetricRingsRow"
import { MonitorCard } from "@/components/home/MonitorCard"
import { PendingActivityCards } from "@/components/home/PendingActivityCards"
import { TodayCard } from "@/components/home/TodayCard"
import { fetchCoverage, type CoverageKind } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { getViewCache, setViewCache } from "@/services/db/repositories/viewCache"
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
    setSelectedDate,
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
  const [isCalendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() =>
    selectedDate.slice(0, 7),
  )
  const [coverageByDate, setCoverageByDate] = useState<Record<string, CoverageKind>>({})
  const lastShownError = useRef<string | null>(null)

  // Fetch coverage for the visible month whenever the calendar is open or the
  // cursor changes. Local viewCache provides instant render; remote fetch
  // refreshes in the background. Soft-fail — missing markers don't break the
  // picker.
  useEffect(() => {
    if (!isCalendarOpen) return
    let alive = true
    void (async () => {
      try {
        const db = openDatabase()
        const cached = await getViewCache<{
          days: Array<{ date: string; coverage: CoverageKind }>
        }>(db, "coverage", calendarMonthCursor)
        if (cached && alive) {
          const map: Record<string, CoverageKind> = {}
          cached.days.forEach((d) => {
            map[d.date] = d.coverage
          })
          setCoverageByDate((prev) => ({ ...prev, ...map }))
        }
      } catch {
        // cache miss is fine
      }
      try {
        const data = await fetchCoverage(calendarMonthCursor, calendarMonthCursor)
        if (!alive) return
        const map: Record<string, CoverageKind> = {}
        data.days.forEach((d) => {
          map[d.date] = d.coverage
        })
        setCoverageByDate((prev) => ({ ...prev, ...map }))
        try {
          const db = openDatabase()
          await setViewCache(db, "coverage", calendarMonthCursor, data)
        } catch {
          // cache write failures don't affect the user
        }
      } catch {
        // network failure — picker still works, just without markers
      }
    })()
    return () => {
      alive = false
    }
  }, [isCalendarOpen, calendarMonthCursor])

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

  const shiftCalendarMonth = useCallback(
    (delta: -1 | 1) => {
      const [y, m] = calendarMonthCursor.split("-").map(Number)
      const next = new Date(Date.UTC(y, m - 1 + delta, 1))
      const ny = next.getUTCFullYear()
      const nm = String(next.getUTCMonth() + 1).padStart(2, "0")
      const candidate = `${ny}-${nm}`
      // 12-month back cap on the prev arrow.
      const now = new Date()
      const min = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1))
      if (delta === -1 && next < min) return
      setCalendarMonthCursor(candidate)
    },
    [calendarMonthCursor],
  )

  const calendarMonthLabel = useMemo(() => {
    const [y, m] = calendarMonthCursor.split("-").map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString([], {
      month: "long",
      year: "numeric",
    })
  }, [calendarMonthCursor])

  const handleDaySwipeChanged = useCallback(
    ({ nativeEvent }: PanGestureHandlerGestureEvent) => {
      // With the calendar open the user is swiping the month grid; the
      // outer day-swipe shouldn't steal those gestures.
      if (isCalendarOpen) return
      setIsHorizontalDaySwipeActive(
        shouldLockHomeScroll({
          translationX: nativeEvent.translationX,
          translationY: nativeEvent.translationY,
        }),
      )
    },
    [isCalendarOpen],
  )

  const finishDaySwipe = useCallback(
    (translationX: number, translationY: number) => {
      setIsHorizontalDaySwipeActive(false)
      if (isCalendarOpen) return

      const action = getDaySwipeAction({ translationX, translationY })

      if (action === "previous") {
        moveToPreviousDay()
      } else if (action === "next") {
        moveToNextDay()
      }
    },
    [isCalendarOpen, moveToNextDay, moveToPreviousDay],
  )

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  // Snap the home back to the top whenever the calendar closes — picking
  // a date or tapping outside should put the user at the rings, not where
  // they happened to be scrolled.
  const scrollRef = useRef<Animated.ScrollView>(null)
  const closeCalendarAndScrollToTop = useCallback(() => {
    setCalendarOpen(false)
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [])

  // Animated dim — drives the rings/monitors wrapper down to 0.55 opacity
  // while the calendar's up, matching the calendar's own fade timing.
  const dimProgress = useSharedValue(0)
  useEffect(() => {
    dimProgress.value = withTiming(isCalendarOpen ? 1 : 0, { duration: 260 })
  }, [isCalendarOpen, dimProgress])
  const dimStyle = useAnimatedStyle(() => ({
    opacity: 1 - dimProgress.value * 0.45,
  }))

  // Animated height for the calendar so content below actually slides down
  // (rather than snapping to the new layout). The calendar is always
  // mounted; the container clips it via overflow:hidden when collapsed.
  // 360 is the measured natural height for a 6-row month with our chrome —
  // good enough for the slide; small misalignment is invisible because
  // the calendar fills its own surface.
  const CALENDAR_OPEN_HEIGHT = 360
  const calOpenness = useSharedValue(0)
  useEffect(() => {
    calOpenness.value = withTiming(isCalendarOpen ? 1 : 0, { duration: 260 })
  }, [isCalendarOpen, calOpenness])
  const calendarHeightStyle = useAnimatedStyle(() => ({
    height: calOpenness.value * CALENDAR_OPEN_HEIGHT,
    opacity: calOpenness.value,
  }))

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
      value: (homeView?.rings.sleep.value ?? "--").replace("%", ""),
      unit: "%",
      progress: homeView?.rings.sleep.progress ?? 0,
      color: colors.ringSleep,
      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
    },
    {
      key: "recovery",
      label: "Recovery",
      value: (homeView?.rings.recovery.value ?? "--").replace("%", ""),
      unit: "%",
      progress: homeView?.rings.recovery.progress ?? 0,
      color: colors.ringRecovery,
      hero: true,
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

  const healthMonitor = homeView?.monitors?.health
  const stressMonitor = homeView?.monitors?.stress

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
          ref={scrollRef}
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
              title={isCalendarOpen ? calendarMonthLabel : selectedDateTitle}
              onPrevious={isCalendarOpen ? () => shiftCalendarMonth(-1) : moveToPreviousDay}
              onNext={isCalendarOpen ? () => shiftCalendarMonth(1) : moveToNextDay}
              onOpenCalendar={() => {
                if (isCalendarOpen) {
                  closeCalendarAndScrollToTop()
                } else {
                  setCalendarOpen(true)
                }
              }}
              isOpen={isCalendarOpen}
            />

            <DevicePill
              batteryLabel={batteryLabel}
              isCharging={isCharging}
              isConnected={connectionState === "ready"}
              onPress={() => navigateTo("DeviceSettings", "device-settings")}
            />
          </View>

          <Animated.View
            style={[$calendarBleed, calendarHeightStyle, { overflow: "hidden" }]}
            pointerEvents={isCalendarOpen ? "auto" : "none"}
          >
            <HomeDateCalendar
              selectedDate={selectedDate}
              monthCursor={calendarMonthCursor}
              coverageByDate={coverageByDate}
              onSelectDate={(date) => {
                setSelectedDate(date)
                closeCalendarAndScrollToTop()
              }}
              onMonthCursorChange={setCalendarMonthCursor}
              onClose={closeCalendarAndScrollToTop}
            />
          </Animated.View>

          <TouchableOpacity
            activeOpacity={1}
            disabled={!isCalendarOpen}
            onPress={isCalendarOpen ? closeCalendarAndScrollToTop : undefined}
          >
          <Animated.View
            layout={LinearTransition.duration(220)}
            style={[themed($dayContentWrap), dimStyle]}
            pointerEvents={isCalendarOpen ? "none" : "auto"}
          >
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
                  layout="left-hero"
                />

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <MonitorCard
                    icon={Heartbeat}
                    title="Health"
                    state={healthMonitor?.state ?? "stale"}
                    tileIcon={
                      healthMonitor?.state === "warn"
                        ? Warning
                        : healthMonitor?.state === "alert"
                          ? WarningOctagon
                          : healthMonitor?.state === "stale"
                            ? ClockCountdown
                            : Check
                    }
                    verdict={healthMonitor?.verdict ?? "No recent data"}
                    subline={`${healthMonitor?.inRangeCount ?? 0}/${healthMonitor?.totalMetrics ?? 4} metrics`}
                    onPress={() => navigateTo("HealthMonitor", "health-monitor")}
                  />
                  <MonitorCard
                    icon={Brain}
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

                <PendingActivityCards
                  cards={homeView?.pendingActivityCards ?? []}
                  onResolved={refreshDashboard}
                />

                <TodayCard events={tapeEvents} onEventPress={handleTapePress} />
              </Animated.View>
            )}
          </Animated.View>
          </TouchableOpacity>
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
      <NotePencil size={18} color={colors.text} />
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
        <Watch
          size={18}
          color={isConnected ? colors.text : colors.textDim}
        />
        {isCharging ? (
          <Lightning size={9} color={colors.statusGreen} style={themed($chargeBolt)} />
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

// Breaks out of the container's horizontal padding + nudges against the
// surrounding gap so the calendar band reads as edge-to-edge with only a
// tight rhythm gap below the date strip.
const $calendarBleed: ViewStyle = {
  marginHorizontal: -20,
  marginTop: -24,
  marginBottom: -20,
}

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
  flex: 1,
})

const $topStrip: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
  // More vertical breathing room between the date/device strip and
  // the rings cluster below it. The old 6px sat the hero ring right
  // under the strip; 24 lets the hero anchor on its own.
  marginBottom: 24,
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
