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
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })
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
    date: p.timestamp.slice(0, 10),
    value: p.value,
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
      ...feed
        .filter((a) => a.startTime && a.endTime)
        .map((a) => ({
          startTime: new Date(a.startTime as string),
          endTime: new Date(a.endTime as string),
          activityType: a.type,
        })),
      ...candidates.map((c) => ({
        startTime: new Date(c.startTime),
        endTime: new Date(c.endTime ?? c.startTime),
        activityType: "Candidate" as const,
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshDashboard}
            tintColor={colors.tint}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <MetricHero
            value={validStrain ? strainNumeric.toFixed(1) : "--"}
            valueDetail="0 – 21 scale"
            badge={{ label: classification.label, tint: classification.tint }}
            delta={strainDelta}
            deltaUnit=""
            detail={`${namedCount} named · ${candidateCount} candidate · ${offWristCount} off-wrist · ${activeMinutes} active min`}
          />
        </View>

        <View style={{ marginHorizontal: 16 }}>
          <DayTimeline bouts={timelineBouts} dayStart={dayBounds.dayStart} dayEnd={dayBounds.dayEnd} />
        </View>

        <PendingActivityCards cards={candidates} onResolved={refreshDashboard} />

        <Text
          text="TODAY"
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.8,
            marginTop: 18,
            marginHorizontal: 16,
          }}
        />
        {feed.length === 0 ? (
          <Text
            text="No confirmed activities yet."
            style={{ color: colors.textMuted, fontSize: 13, marginHorizontal: 16, marginTop: 6 }}
          />
        ) : (
          feed.map((a, i) => {
            const startIso = a.startTime
            const endIso = a.endTime
            if (a.type === "Off-Wrist" || a.type === "No Data") {
              if (!startIso || !endIso) return null
              return (
                <GapRule
                  key={a.id ?? `gap-${i}`}
                  kind={a.type as "Off-Wrist" | "No Data"}
                  startTime={new Date(startIso)}
                  endTime={new Date(endIso)}
                />
              )
            }
            const intensity =
              a.intensity === "moderate" || a.intensity === "hard" || a.intensity === "light"
                ? (a.intensity as "light" | "moderate" | "hard")
                : "light"
            return (
              <BoutCard
                key={a.id ?? `bout-${i}`}
                activityType={a.type}
                startTime={startIso ? new Date(startIso) : new Date()}
                durationMinutes={a.durationMinutes ?? 0}
                heartRateAvg={a.heartRateAvg ?? 0}
                intensity={intensity}
                strainScore={parseFloat(a.strain) || 0}
                onPress={
                  a.id
                    ? () => router.push({ pathname: "/bout-detail", params: { id: a.id! } })
                    : undefined
                }
              />
            )
          })
        )}

        {sevenDayStrain.length ? (
          <View
            style={{
              marginTop: 24,
              padding: 14,
              backgroundColor: colors.surfaceCard,
              borderRadius: 12,
              marginHorizontal: 16,
            }}
          >
            <Text
              text="Strain · 7-day"
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
            <VitalCard
              label="Live HR"
              value={realtimeHeartRate ? `${realtimeHeartRate}` : "--"}
              unit="bpm"
              delta={null}
            />
            <VitalCard label="Stress" value={homeView?.activities.stress ?? "--"} delta={null} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <VitalCard
              label="Recovery"
              value={homeView?.todayOverview.dailyBalance ?? "--"}
              unit="%"
              delta={null}
            />
            <VitalCard
              label="Load Pressure"
              value={homeView?.todayOverview.loadPressure ?? "--"}
              delta={null}
            />
          </View>
        </View>

        <View
          style={{
            marginTop: 18,
            marginHorizontal: 16,
            padding: 14,
            backgroundColor: colors.surfaceCard,
            borderRadius: 12,
          }}
        >
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

        <View style={{ marginHorizontal: 16 }}>
          <LabsAccordion rows={labsRows} />
        </View>
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
