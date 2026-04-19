import { FC, useRef, useEffect, useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRoute } from "@react-navigation/native"
import { router } from "expo-router"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { HypnogramChart } from "@/components/HypnogramChart"
import { InlineLineChart } from "@/components/InlineLineChart"
import { SleepHeartRateChart } from "@/components/SleepHeartRateChart"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const KEY_METRIC_LABELS = ["Efficiency", "Resting HR", "HRV (RMSSD)", "Interruptions"]
const ADVANCED_METRIC_LABELS = [
  "Blood Oxygen", "Skin Temp", "Consistency", "Sleep Score",
  "Architecture Score", "SpO2 Dips", "Core Temp", "LF/HF Ratio",
  "Recovery", "Sleep Reserve", "Respiratory Rate",
]

function scoreColor(score: number, colors: any): string {
  if (score >= 80) return colors.statusGreen
  if (score >= 60) return colors.statusAmber
  return colors.statusRed
}

function scoreQuality(score: number): string {
  if (score >= 80) return "Good"
  if (score >= 60) return "Fair"
  return "Poor"
}

export const SleepDetailScreen: FC = () => {
  const { themed, theme: { colors } } = useAppTheme()
  const route = useRoute<any>()
  const { width } = useWindowDimensions()
  const {
    sleepView, isRefreshing, refreshDashboard, error, clearError, selectedDate,
  } = useDashboard()

  const date: string = (route.params?.date as string) ?? selectedDate
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const lastShownError = useRef<string | null>(null)

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

  // Resolve sleep score
  const scorePoint =
    sleepView?.sleepScoreTrend?.find((p) => p.timestamp.startsWith(date)) ??
    (sleepView?.sleepScoreTrend?.length
      ? sleepView.sleepScoreTrend[sleepView.sleepScoreTrend.length - 1]
      : null)
  const scoreValue = scorePoint ? Math.round(scorePoint.value) : null

  // Format date for nav bar
  const formattedDate = (() => {
    const [year, month, day] = date.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
  })()

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setDetailsExpanded((prev) => !prev)
  }


  // --- Nav Bar ---
  const alarmAction = (
    <TouchableOpacity
      style={themed($navSide)}
      onPress={() => router.push("/sleep-planner" as any)}
    >
      <Ionicons
        name={sleepView?.planner.alarmEnabled ? "alarm" : "alarm-outline"}
        size={22}
        color={sleepView?.planner.alarmEnabled ? colors.tint : colors.textDim}
      />
    </TouchableOpacity>
  )

  const NavBar = (
    <DetailScreenHeader title={formattedDate} rightAction={alarmAction} />
  )

  // --- Empty State ---
  if (!sleepView || sleepView.emptyState.isEmpty) {
    return (
      <View style={themed($screenWrap)}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={themed($container)}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />
            }
          >
          {NavBar}
          <View style={themed($emptyState)}>
            <Text
              text={sleepView?.emptyState.title ?? "No sleep data"}
              size="lg"
              weight="semiBold"
              style={themed($emptyTitle)}
            />
            <Text
              text={sleepView?.emptyState.subtitle ?? "Sync your strap to load the sleep breakdown."}
              size="xs"
              style={themed($mutedCenter)}
            />
          </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    )
  }

  // --- Key metrics ---
  const keyMetrics = KEY_METRIC_LABELS.map((label) =>
    sleepView.metrics.find((m) => m.label === label),
  ).filter(Boolean) as Array<{ label: string; value: string; detail: string | null }>

  // --- Advanced metrics (from Phase 2-4 improvements) ---
  const advancedMetrics = ADVANCED_METRIC_LABELS.map((label) =>
    sleepView.metrics.find((m) => m.label === label),
  ).filter(Boolean) as Array<{ label: string; value: string; detail: string | null }>

  const halfWidth = (width - 48 - 12) / 2

  return (
    <View style={themed($screenWrap)}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={themed($container)}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />
          }
        >
        {/* 1. Nav Bar — [back]  [date centered]  [alarm icon] */}
        {NavBar}

        {/* 2. Hero Score */}
        <View style={themed($heroSection)}>
          {scoreValue !== null ? (
            <>
              <Text
                text={String(scoreValue)}
                style={[themed($heroScore), { color: scoreColor(scoreValue, colors) }]}
              />
              <Text
                text={scoreQuality(scoreValue)}
                size="sm"
                weight="semiBold"
                style={{ color: scoreColor(scoreValue, colors) }}
              />
              <Text text={sleepView.header.duration} size="sm" style={themed($heroDuration)} />
            </>
          ) : (
            <>
              <Text text={sleepView.header.duration} style={themed($heroScore)} />
              <Text text="SLEEP" size="xs" weight="bold" style={themed($heroLabel)} />
            </>
          )}
        </View>

        {/* 3. Hypnogram */}
        {sleepView.epochTimeline.length > 0 && (
          <View style={themed($section)}>
            <HypnogramChart
              epochs={sleepView.epochTimeline}
              width={chartWidth}
              bedtimeLabel={sleepView.header.bedtime}
              wakeTimeLabel={sleepView.header.wakeTime}
            />
          </View>
        )}

        {/* 4. Key Metrics Row */}
        {keyMetrics.length > 0 && (
          <View style={themed($metricsRow)}>
            {keyMetrics.map((metric) => (
              <View key={metric.label} style={themed($metricCell)}>
                <Text text={metric.label} size="xxs" style={themed($metricLabel)} />
                <Text text={metric.value} size="sm" weight="semiBold" style={themed($metricValue)} />
              </View>
            ))}
          </View>
        )}

        {/* 4b. Advanced Metrics Grid */}
        {advancedMetrics.length > 0 && (
          <View style={themed($metricsRow)}>
            {advancedMetrics.map((metric) => (
              <View key={metric.label} style={themed($metricCell)}>
                <Text text={metric.label} size="xxs" style={themed($metricLabel)} />
                <Text text={metric.value} size="sm" weight="semiBold" style={themed($metricValue)} />
                {metric.detail ? (
                  <Text text={metric.detail} size="xxs" style={themed($metricLabel)} />
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* 5. Collapsible: HR Chart + Trends + Insights */}
        <TouchableOpacity style={themed($expandRow)} onPress={toggleDetails} activeOpacity={0.7}>
          <Text text="More Details" size="xs" weight="semiBold" style={themed($expandLabel)} />
          <Ionicons
            name={detailsExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {detailsExpanded && (
          <View style={themed($collapsedContent)}>
            {/* Heart Rate Chart */}
            {sleepView.hrChart.samples.length > 0 && (
              <View style={themed($section)}>
                <Text text="HEART RATE" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <SleepHeartRateChart
                  samples={sleepView.hrChart.samples}
                  epochs={sleepView.epochTimeline}
                  width={chartWidth}
                  height={120}
                />
                <View style={themed($chartAxis)}>
                  <Text text={sleepView.header.bedtime} size="xxs" style={themed($axisText)} />
                  <Text text={sleepView.header.wakeTime} size="xxs" style={themed($axisText)} />
                </View>
              </View>
            )}

            {/* Trends */}
            <View style={themed($trendsRow)}>
              <View style={[themed($trendColumn), { width: halfWidth }]}>
                <Text text="DURATION — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <BarSeriesChart
                  points={sleepView.durationTrend.samples}
                  width={halfWidth}
                  height={80}
                  fill={colors.tint}
                  referenceValue={sleepView.durationTrend.targetHours}
                />
              </View>
              <View style={[themed($trendColumn), { width: halfWidth }]}>
                <Text text="SCORE — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <InlineLineChart
                  points={sleepView.sleepScoreTrend}
                  width={halfWidth}
                  height={80}
                  stroke={colors.tint}
                />
              </View>
            </View>

            {/* Insights */}
            {sleepView.factorInsights.length > 0 && (
              <View style={themed($section)}>
                <Text text="INSIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
                <View style={themed($insightList)}>
                  {sleepView.factorInsights.map((insight) => (
                    <View key={insight.factorTag} style={themed($insightRow)}>
                      <Text text={insight.factorTag} size="xs" weight="semiBold" style={themed($insightTag)} />
                      <View style={themed($insightRight)}>
                        {insight.deepDelta ? (
                          <Text text={insight.deepDelta} size="xxs" style={themed($insightPositive)} />
                        ) : null}
                        {insight.remDelta ? (
                          <Text text={insight.remDelta} size="xxs" style={themed($insightNeutral)} />
                        ) : null}
                        <Text text={`(${insight.sampleCount}n)`} size="xxs" style={themed($insightMuted)} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ═══════════════════════ Styles ═══════════════════════

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

const $navSide: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 36,
  justifyContent: "center",
  width: 36,
})

// Hero
const $heroSection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 4,
  paddingVertical: 8,
})

const $heroScore: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
  fontSize: 56,
  fontWeight: "bold",
  lineHeight: 64,
})

const $heroDuration: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginTop: 2,
})

const $heroLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  letterSpacing: 1,
  marginTop: 2,
})

// Sections
const $section: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

const $sectionEyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  letterSpacing: 1,
})

// Chart axis
const $chartAxis: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
})

const $axisText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

// Key Metrics Row
const $metricsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})

const $metricCell: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-start",
  flex: 1,
  gap: 3,
})

const $metricLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  letterSpacing: 0.3,
})

const $metricValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

// Expand / Collapse row
const $expandRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  borderColor: colors.divider,
  borderRadius: 12,
  borderWidth: 1,
  flexDirection: "row",
  gap: 6,
  justifyContent: "center",
  paddingVertical: 12,
})

const $expandLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $collapsedContent: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
})

// Trends
const $trendsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 12,
})

const $trendColumn: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

// Insights
const $insightList: ThemedStyle<ViewStyle> = () => ({
  gap: 12,
})

const $insightRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
})

const $insightTag: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flex: 1,
})

const $insightRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $insightPositive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.statusGreen,
})

const $insightNeutral: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $insightMuted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

// Empty State
const $emptyState: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 10,
  justifyContent: "center",
  paddingTop: 80,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $mutedCenter: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  textAlign: "center",
})
