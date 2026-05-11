import { FC, useEffect, useRef } from "react"
import { RefreshControl, View, ViewStyle, useWindowDimensions } from "react-native"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

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

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  const chartWidth = width - 48

  const formattedDate = (() => {
    const [year, month, day] = selectedDate.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
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
  const sevenDayStrain = trendPoints.map((p) => ({
    date: p.timestamp.slice(0, 10),
    value: p.value,
  }))
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

  const labsRows = [
    { label: "Training Load Ratio", value: homeView?.activities.trainingLoad ?? "--" },
    { label: "Load Risk Zone", value: homeView?.activities.trainingLoadRiskZone ?? "--" },
    { label: "Stress Load", value: homeView?.activities.stress ?? "--" },
    { label: "SpO₂", value: homeView?.activities.spo2 ?? "--" },
    { label: "SpO₂ Dips", value: homeView?.activities.spo2Dips ?? "--" },
    { label: "Active Minutes", value: homeView?.activities.totalActiveMinutes ?? "--" },
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
        <MetricHero
          value={validStrain ? strainNumeric.toFixed(1) : "--"}
          valueDetail="0 – 21 scale"
          badge={{ label: classification.label, tint: classification.tint }}
          delta={strainDelta}
          deltaUnit=""
          detail={`${homeView?.activities.totalActiveMinutes ?? "--"} active min · ${homeView?.activities.activityCount ?? 0} activities logged`}
        />

        {sevenDayStrain.length ? (
          <View
            style={{
              padding: 14,
              backgroundColor: colors.surfaceCard,
              borderRadius: 12,
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

        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <VitalCard
            label="Live HR"
            value={realtimeHeartRate ? `${realtimeHeartRate}` : "--"}
            unit="bpm"
            delta={null}
          />
          <VitalCard
            label="Stress"
            value={homeView?.activities.stress ?? "--"}
            delta={null}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <VitalCard
            label="Recovery"
            value={homeView?.activities.recoveryIndex ?? "--"}
            unit="ms"
            delta={null}
          />
          <VitalCard
            label="Load Pressure"
            value={homeView?.todayOverview.loadPressure ?? "--"}
            delta={null}
          />
        </View>

        <View
          style={{
            marginTop: 22,
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

        <LabsAccordion rows={labsRows} />
      </Animated.ScrollView>
    </View>
  )
}

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 60,
  paddingHorizontal: 24,
  paddingTop: 12,
})
