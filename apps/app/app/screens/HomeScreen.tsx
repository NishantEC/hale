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
import { Brain, Heartbeat } from "phosphor-react-native"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
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
import { NativeDateSwitcher } from "@/components/NativeDateSwitcher"
import { ComposeButton, type QuickLogAction } from "@/components/home/ComposeButton"
import { DevicePill } from "@/components/home/DevicePill"
import { HomeDateCalendar } from "@/components/home/HomeDateCalendar"
import { MetricRingsRow } from "@/components/home/MetricRingsRow"
import { MonitorCard } from "@/components/home/MonitorCard"
import { PendingActivityCards } from "@/components/home/PendingActivityCards"
import { DayArcRibbon } from "@/components/home/DayArcRibbon"
import {
  type CoverageKind,
  type JournalEntryResponse,
} from "@/services/api/noopClient"
import { computeLocalCoverage } from "@/services/compute/localCoverage"
import { openDatabase } from "@/services/db"
import { listJournalEntriesByDate } from "@/services/db/repositories/journalEntry"
import { getViewCache, setViewCache } from "@/services/db/repositories/viewCache"
import { Shimmer } from "@/components/reactx/Shimmer"
import { Toast } from "@/components/reactx/toast"
import { Text } from "@/components/Text"
import { useBleConnectionState, useBleBatteryLevel, useBleIsCharging } from "@/stores/bleStore"
import { useSyncIsRunning } from "@/stores/syncStore"
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

function ringDelta(
  current: number | null,
  baseline: number | null,
  precision: number = 0,
): { direction: "up" | "down" | "flat"; text: string } | null {
  if (current == null || baseline == null) return null
  const diff = current - baseline
  const epsilon = precision === 0 ? 0.5 : 0.05
  if (Math.abs(diff) < epsilon) return { direction: "flat", text: "— 7d avg" }
  const direction: "up" | "down" = diff > 0 ? "up" : "down"
  const arrow = direction === "up" ? "▲" : "▼"
  const magnitude = Math.abs(diff).toFixed(precision)
  return { direction, text: `${arrow} ${magnitude} 7d` }
}

function formatFreshness(iso: string | null): string | null {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return null
  const ageSec = Math.max(0, (Date.now() - ts) / 1000)
  if (ageSec < 90) return "Just now"
  const ageMin = ageSec / 60
  if (ageMin < 60) return `${Math.round(ageMin)}m ago`
  const ageHr = ageMin / 60
  if (ageHr < 24) return `${Math.round(ageHr)}h ago`
  return `${Math.round(ageHr / 24)}d ago`
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
  const isSyncing = useSyncIsRunning()
  const connectionState = useBleConnectionState()
  const batteryLevel = useBleBatteryLevel()
  const isCharging = useBleIsCharging()
  const { setActiveDate: setHealthKitActiveDate } = useHealthKit()
  const [isHorizontalDaySwipeActive, setIsHorizontalDaySwipeActive] = useState(false)
  const [isCalendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() =>
    selectedDate.slice(0, 7),
  )
  const [coverageByDate, setCoverageByDate] = useState<Record<string, CoverageKind>>({})
  const [journalEntries, setJournalEntries] = useState<JournalEntryResponse[]>([])
  const lastShownError = useRef<string | null>(null)
  const lastFocusRefreshAt = useRef(0)

  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      if (now - lastFocusRefreshAt.current > 30_000) {
        lastFocusRefreshAt.current = now
        refreshDashboard().catch(() => undefined)
      }
    }, [refreshDashboard]),
  )

  // Pull journal entries for the selected day so they appear on the day
  // tape alongside sleep / recovery / workout events. Soft-fail —
  // missing entries shouldn't block the dashboard from rendering.
  useEffect(() => {
    let cancelled = false
    listJournalEntriesByDate(openDatabase(), selectedDate)
      .then((rows) => {
        if (cancelled) return
        setJournalEntries(
          rows.map((r) => ({
            id: r.id,
            factorTag: r.factorTag,
            intensity: r.intensity,
            note: r.note,
            timestamp: new Date(r.timestamp).toISOString(),
            createdAt: new Date(r.createdAt).toISOString(),
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setJournalEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

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
        const data = await computeLocalCoverage(
          openDatabase(),
          calendarMonthCursor,
          calendarMonthCursor,
        )
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
      unit: "",
      progress: homeView?.rings.sleep.progress ?? 0,
      color: colors.ringSleep,
      onPress: () => navigateTo("SleepDetail", "sleep-detail", { date: selectedDate }),
      delta: ringDelta(
        homeView?.rings.sleep.numericValue ?? null,
        homeView?.rings.sleep.sevenDayAverage ?? null,
      ),
    },
    {
      key: "recovery",
      label: "Recovery",
      value: (homeView?.rings.recovery.value ?? "--").replace("%", ""),
      unit: "",
      progress: homeView?.rings.recovery.progress ?? 0,
      color: colors.ringRecovery,
      onPress: () => navigateTo("RecoveryDetail", "recovery-detail", { date: selectedDate }),
      delta: ringDelta(
        homeView?.rings.recovery.numericValue ?? null,
        homeView?.rings.recovery.sevenDayAverage ?? null,
      ),
    },
    {
      key: "strain",
      label: "Strain",
      value: (() => {
        const raw = homeView?.rings.strain.value
        if (!raw) return "--"
        const n = parseFloat(raw)
        return Number.isFinite(n) ? n.toFixed(1) : raw
      })(),
      unit: "/21",
      progress: homeView?.rings.strain.progress ?? 0,
      color: colors.ringStrain,
      onPress: () => navigateTo("StrainActivity", "strain-activity"),
      delta: ringDelta(
        homeView?.rings.strain.numericValue ?? null,
        homeView?.rings.strain.sevenDayAverage ?? null,
        1,
      ),
    },
  ] as const

  const healthMonitor = homeView?.monitors?.health
  const stressMonitor = homeView?.monitors?.stress

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

  function handleQuickLog(action: QuickLogAction) {
    switch (action) {
      case "activity":
        navigateTo("StrainActivity", "strain-activity")
        break
      case "journal":
        navigateTo("JournalEntry", "journal-entry", { date: selectedDate })
        break
      case "bedtime":
        navigateTo("SleepPlanner", "sleep-planner")
        break
      case "session":
        navigateTo("StrainActivity", "strain-activity")
        break
    }
  }

  function handleTapePress(event: TapeEvent) {
    switch (event.type) {
      case "sleep":
        navigateTo("SleepDetail", "sleep-detail", { date: selectedDate })
        break
      case "recovery":
      case "vital":
        navigateTo("RecoveryDetail", "recovery-detail", { date: selectedDate })
        break
      case "workout":
        if (event.payload?.boutId) {
          navigateTo("BoutDetail", "bout-detail", { id: event.payload.boutId })
        } else {
          navigateTo("StrainActivity", "strain-activity")
        }
        break
      case "journal":
        navigateTo("JournalHistory", "journal-history")
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
            {process.env.EXPO_PUBLIC_HOME_NATIVE_DATE === "1" ? (
              <NativeDateSwitcher
                title={isCalendarOpen ? calendarMonthLabel : selectedDateTitle}
                onPrevious={isCalendarOpen ? () => shiftCalendarMonth(-1) : moveToPreviousDay}
                onNext={isCalendarOpen ? () => shiftCalendarMonth(1) : moveToNextDay}
                onOpenCalendar={() => setCalendarOpen((v) => !v)}
                isOpen={isCalendarOpen}
              />
            ) : (
              <DateSwitcher
                title={isCalendarOpen ? calendarMonthLabel : selectedDateTitle}
                onPrevious={isCalendarOpen ? () => shiftCalendarMonth(-1) : moveToPreviousDay}
                onNext={isCalendarOpen ? () => shiftCalendarMonth(1) : moveToNextDay}
                onOpenCalendar={() => setCalendarOpen((v) => !v)}
                isOpen={isCalendarOpen}
              />
            )}

            <View style={themed($topStripRight)}>
              <ComposeButton onSelect={handleQuickLog} />
              <DevicePill
                batteryLabel={batteryLabel}
                isCharging={isCharging}
                isConnected={connectionState === "ready"}
                onPress={() => navigateTo("DeviceSettings", "device-settings")}
              />
            </View>
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
                setCalendarOpen(false)
                setSelectedDate(date)
              }}
              onMonthCursorChange={setCalendarMonthCursor}
              onClose={() => setCalendarOpen(false)}
            />
          </Animated.View>

          <TouchableOpacity
            activeOpacity={1}
            disabled={!isCalendarOpen}
            onPress={isCalendarOpen ? () => setCalendarOpen(false) : undefined}
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
                  // Strain (left) · Recovery (middle) · Sleep (right) at equal size.
                  rings={[ringTrio[2], ringTrio[1], ringTrio[0]] as any}
                  layout="row"
                />

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <MonitorCard
                    icon={Heartbeat}
                    title="Health"
                    state={healthMonitor?.state ?? "stale"}
                    score={
                      (healthMonitor?.totalMetrics ?? 0) > 0
                        ? String(healthMonitor?.inRangeCount ?? 0)
                        : "--"
                    }
                    scoreSubscript={
                      (healthMonitor?.totalMetrics ?? 0) > 0
                        ? `/${healthMonitor?.totalMetrics}`
                        : undefined
                    }
                    verdict={
                      healthMonitor?.verdict ??
                      (connectionState === "ready" ? "Waiting on tonight's sleep" : "Strap offline")
                    }
                    freshness={formatFreshness(healthMonitor?.lastReadingAt ?? null)}
                    tint={colors.ringRecovery}
                    onPress={() => navigateTo("HealthMonitor", "health-monitor")}
                  />
                  <MonitorCard
                    icon={Brain}
                    title="Stress"
                    state={stressMonitor?.state ?? "stale"}
                    score={stressMonitor?.score == null ? "--" : stressMonitor.score.toFixed(0)}
                    verdict={
                      stressMonitor?.zone ??
                      (connectionState === "ready" ? "Streaming…" : "Strap offline")
                    }
                    freshness={formatFreshness(stressMonitor?.lastReadingAt ?? null)}
                    tint={colors.ringHrv}
                    onPress={() => navigateTo("StressMonitor", "stress-monitor")}
                  />
                </View>

                <PendingActivityCards
                  cards={homeView?.pendingActivityCards ?? []}
                  onResolved={refreshDashboard}
                />

                <DayArcRibbon
                  events={tapeEvents}
                  dayRibbon={homeView?.dayRibbon}
                  selectedDate={selectedDate}
                  now={Date.now()}
                  onEventPress={handleTapePress}
                />
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
  // Mirrors the real HomeScreen content order/dimensions so the fade in/out
  // doesn't shift layout: three small rings in a row (matches the new
  // 96px MetricRingsRow `default` size) → row of two MonitorCards →
  // TODAY label → tape rows.
  return (
    <View style={themed($homeDaySkeleton)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 28 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ alignItems: "center", flex: 1 }}>
            <SkeletonBlock style={{ width: 96, height: 96, borderRadius: 48 }} />
            <SkeletonBlock style={{ width: 56, height: 10, borderRadius: 4, marginTop: 10 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <SkeletonBlock style={{ flex: 1, height: 102, borderRadius: 12 }} />
        <SkeletonBlock style={{ flex: 1, height: 102, borderRadius: 12 }} />
      </View>
      <SkeletonBlock
        style={{ width: 56, height: 11, borderRadius: 4, marginTop: 18, marginBottom: 10 }}
      />
      <View style={{ gap: 8 }}>
        <SkeletonBlock style={{ height: 56, borderRadius: 12 }} />
        <SkeletonBlock style={{ height: 56, borderRadius: 12 }} />
        <SkeletonBlock style={{ height: 56, borderRadius: 12 }} />
        <SkeletonBlock style={{ height: 56, borderRadius: 12 }} />
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

// Breaks out of the container's horizontal padding + absorbs the
// surrounding flex gap so the calendar band sits flush against the
// strip with no breathing room. marginTop -32 cancels the parent's
// gap entirely so the calendar visually touches the strip's bottom
// edge; marginBottom -20 lets the rings flow tight underneath.
const $calendarBleed: ViewStyle = {
  marginHorizontal: -20,
  marginTop: -32,
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
