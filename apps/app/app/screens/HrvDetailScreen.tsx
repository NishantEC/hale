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
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

const HRV_TINT = "#539df5"
const RHR_TINT = "#f87171"

export const HrvDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const {
    homeView,
    sleepView,
    isRefreshing,
    refreshDashboard,
    error,
    clearError,
    selectedDate,
    setSelectedDate,
  } = useDashboard()

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

  const lookupSleepMetric = (label: string): string => {
    const m = sleepView?.metrics.find((x) => x.label === label)
    return m?.value ?? "--"
  }

  // Prefer the sleep view's HRV (RMSSD) — it's the authoritative nightly
  // measurement; fall back to homeView.activities.recoveryIndex.
  const hrvValueRaw =
    lookupSleepMetric("HRV (RMSSD)") !== "--"
      ? lookupSleepMetric("HRV (RMSSD)")
      : homeView?.activities.recoveryIndex ?? "--"
  const hrvNumeric = parseFloat(hrvValueRaw)
  const validHrv = Number.isFinite(hrvNumeric)
  const hrvDelta = sleepView?.vitalsDelta?.hrv ?? null

  const classification = (() => {
    if (!validHrv) return { label: "Awaiting data", tint: colors.textMuted }
    if (hrvNumeric >= 60) return { label: "Elevated", tint: "#4ade80" }
    if (hrvNumeric >= 30) return { label: "Normal", tint: HRV_TINT }
    return { label: "Low", tint: "#f87171" }
  })()

  // HRV trend: synthesize from sleepView.sleepScoreTrend timestamps + the
  // current night's HRV value (a flat line until per-night HRV trend exists).
  // When richer trend data is exposed, swap in here.
  const hrvTrendPoints =
    sleepView?.sleepScoreTrend?.map((p) => ({
      date: p.timestamp.slice(0, 10),
      value: validHrv ? hrvNumeric : 0,
    })) ?? []

  // RHR trend reuses the recovery (general health) trend as a stand-in.
  const rhrTrendPoints = (homeView?.trendSummary.samples ?? []).map((p) => ({
    date: p.timestamp.slice(0, 10),
    value: p.value,
  }))

  const labsRows = [
    { label: "Skin Temp Δ", value: lookupSleepMetric("Skin Temp Δ") },
    { label: "Respiratory Rate", value: lookupSleepMetric("Respiratory Rate") },
    { label: "Blood Oxygen", value: lookupSleepMetric("Blood Oxygen") },
    { label: "Confidence", value: homeView?.confidence.confidence ?? "--" },
    { label: "Pipeline", value: homeView?.confidence.pipelineStatus ?? "--" },
  ]

  return (
    <View style={themed($screenWrap)}>
      <ScreenHeader title="HRV" subtitle={formattedDate} scrollY={scrollY} />
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
          value={validHrv ? `${Math.round(hrvNumeric)}` : "--"}
          valueDetail="RMSSD · ms"
          badge={{ label: classification.label, tint: classification.tint }}
          delta={hrvDelta}
          deltaUnit="ms"
          detail="Heart-rate variability measured during sleep. Higher generally indicates better autonomic recovery."
        />

        {hrvTrendPoints.length ? (
          <View style={{ padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
            <Text
              text="HRV · 7-night"
              size="xxs"
              style={{ color: colors.textDim, letterSpacing: 0.6, marginBottom: 8 }}
            />
            <InlineLineChart
              points={
                sleepView?.sleepScoreTrend?.map((p) => ({
                  timestamp: p.timestamp,
                  value: validHrv ? hrvNumeric : 0,
                })) ?? []
              }
              width={chartWidth - 28}
              height={120}
              stroke={HRV_TINT}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <VitalCard
            label="HRV (RMSSD)"
            value={validHrv ? `${Math.round(hrvNumeric)}` : "--"}
            unit="ms"
            delta={hrvDelta}
            deltaUnit="ms"
          />
          <VitalCard
            label="Resting HR"
            value={lookupSleepMetric("Resting HR")}
            unit="bpm"
            delta={sleepView?.vitalsDelta?.rhr ?? null}
            deltaUnit="bpm"
            deltaPositiveIsGood={false}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <VitalCard
            label="Recovery"
            value={homeView?.rings.recovery.value ?? "--"}
            unit="%"
            delta={null}
          />
          <VitalCard
            label="Sleep Efficiency"
            value={lookupSleepMetric("Efficiency")}
            delta={sleepView?.vitalsDelta?.efficiency ?? null}
            deltaUnit="%"
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
            label="HRV · 7-night"
            points={hrvTrendPoints}
            currentDate={selectedDate}
            color={HRV_TINT}
            onPressPoint={(d) => setSelectedDate(d)}
          />
          <View style={{ height: 12 }} />
          <TrendSparkline
            label="Recovery · 7-day"
            points={rhrTrendPoints}
            currentDate={selectedDate}
            color={RHR_TINT}
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
