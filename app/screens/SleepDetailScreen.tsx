import { FC, useRef, useEffect } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  RefreshControl,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import { useNavigation, useRoute } from "@react-navigation/native"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { HypnogramChart } from "@/components/HypnogramChart"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Screen } from "@/components/Screen"
import { SleepHeartRateChart } from "@/components/SleepHeartRateChart"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const ACCENT = "#BDD7FF"
const SCREEN_BG = "#06070A"
const KEY_METRIC_LABELS = ["Efficiency", "Resting HR", "HRV (RMSSD)", "Interruptions"]

function scoreColor(score: number): string {
  if (score >= 80) return "#57D37C"
  if (score >= 60) return "#FFD666"
  return "#FF7F7F"
}

function scoreQuality(score: number): string {
  if (score >= 80) return "Good"
  if (score >= 60) return "Fair"
  return "Poor"
}

export const SleepDetailScreen: FC = () => {
  const { themed } = useAppTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { width } = useWindowDimensions()
  const { sleepView, isRefreshing, refreshDashboard, error, clearError, selectedDate } =
    useDashboard()

  const date: string = (route.params?.date as string) ?? selectedDate

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

  // Resolve the sleep score for the given date
  const scorePoint =
    sleepView?.sleepScoreTrend?.find((p) => p.timestamp.startsWith(date)) ??
    (sleepView?.sleepScoreTrend?.length
      ? sleepView.sleepScoreTrend[sleepView.sleepScoreTrend.length - 1]
      : null)
  const scoreValue = scorePoint ? Math.round(scorePoint.value) : null

  // Format the date for the nav bar
  const formattedDate = (() => {
    const [year, month, day] = date.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
  })()

  // --- Nav Bar ---
  const NavBar = (
    <View style={themed($navBar)}>
      <TouchableOpacity style={themed($backButton)} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      <Text text="Sleep" size="lg" weight="semiBold" style={themed($navTitle)} />
      <Text text={formattedDate} size="sm" style={themed($navDate)} />
    </View>
  )

  // --- Empty / Loading State ---
  if (!sleepView || sleepView.emptyState.isEmpty) {
    return (
      <View style={themed($screenWrap)}>
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
          }}
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
        </Screen>
      </View>
    )
  }

  // --- Key metrics row ---
  const keyMetrics = KEY_METRIC_LABELS.map((label) =>
    sleepView.metrics.find((m) => m.label === label),
  ).filter(Boolean) as Array<{ label: string; value: string; detail: string | null }>

  // --- Trends half-width ---
  const halfWidth = (width - 48 - 12) / 2

  return (
    <View style={themed($screenWrap)}>
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
        }}
      >
        {/* 1. Nav Bar */}
        {NavBar}

        {/* 2. Hero Score */}
        <View style={themed($heroSection)}>
          {scoreValue !== null ? (
            <>
              <Text
                text={String(scoreValue)}
                style={[themed($heroScore), { color: scoreColor(scoreValue) }]}
              />
              <Text
                text={scoreQuality(scoreValue)}
                size="sm"
                weight="semiBold"
                style={{ color: scoreColor(scoreValue) }}
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

        {/* 5. Heart Rate Chart */}
        {sleepView.hrChart.samples.length > 0 ? (
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
        ) : null}

        {/* 6. Trends (7 Night) */}
        <View style={themed($trendsRow)}>
          <View style={[themed($trendColumn), { width: halfWidth }]}>
            <Text text="DURATION — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
            <BarSeriesChart
              points={sleepView.durationTrend.samples}
              width={halfWidth}
              height={80}
              fill={ACCENT}
              referenceValue={sleepView.durationTrend.targetHours}
            />
          </View>
          <View style={[themed($trendColumn), { width: halfWidth }]}>
            <Text text="SCORE — 7 NIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
            <InlineLineChart
              points={sleepView.sleepScoreTrend}
              width={halfWidth}
              height={80}
              stroke={ACCENT}
            />
          </View>
        </View>

        {/* 7. Insights */}
        {sleepView.factorInsights.length > 0 && (
          <View style={themed($section)}>
            <Text text="INSIGHTS" size="xxs" weight="bold" style={themed($sectionEyebrow)} />
            <View style={themed($insightList)}>
              {sleepView.factorInsights.map((insight) => (
                <View key={insight.factorTag} style={themed($insightRow)}>
                  <Text
                    text={insight.factorTag}
                    size="xs"
                    weight="semiBold"
                    style={themed($insightTag)}
                  />
                  <View style={themed($insightRight)}>
                    {insight.deepDelta ? (
                      <Text text={insight.deepDelta} size="xxs" style={themed($insightPositive)} />
                    ) : null}
                    {insight.remDelta ? (
                      <Text text={insight.remDelta} size="xxs" style={themed($insightNeutral)} />
                    ) : null}
                    <Text
                      text={`(${insight.sampleCount}n)`}
                      size="xxs"
                      style={themed($insightMuted)}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </Screen>
    </View>
  )
}

// --------------- Styles ---------------

const $screenWrap: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: SCREEN_BG,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 60,
  paddingHorizontal: 24,
  paddingTop: 12,
})

// Nav Bar
const $navBar: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 8,
  minHeight: 44,
})

const $backButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 36,
  justifyContent: "center",
  marginRight: 4,
  width: 36,
})

const $navTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
  flex: 1,
})

const $navDate: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.52)",
})

// Hero
const $heroSection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 4,
  paddingVertical: 8,
})

const $heroScore: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 56,
  fontWeight: "bold",
  lineHeight: 64,
})

const $heroDuration: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.52)",
  marginTop: 2,
})

const $heroLabel: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
  letterSpacing: 1,
  marginTop: 2,
})

// Sections
const $section: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

const $sectionEyebrow: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
  letterSpacing: 1,
})

// Chart axis
const $chartAxis: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
})

const $axisText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.38)",
})

// Key Metrics Row
const $metricsRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 0,
})

const $metricCell: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-start",
  flex: 1,
  gap: 3,
})

const $metricLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
  letterSpacing: 0.3,
})

const $metricValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
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

const $insightTag: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
  flex: 1,
})

const $insightRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $insightPositive: ThemedStyle<TextStyle> = () => ({
  color: "#57D37C",
})

const $insightNeutral: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.84)",
})

const $insightMuted: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.46)",
})

// Empty State
const $emptyState: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 10,
  justifyContent: "center",
  paddingTop: 80,
})

const $emptyTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
})

const $mutedCenter: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.52)",
  textAlign: "center",
})
