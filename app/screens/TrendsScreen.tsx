import { FC, useCallback, useEffect, useState } from "react"
import { RefreshControl, TextStyle, View, ViewStyle, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { Chart, Host } from "@expo/ui/swift-ui"

import { GlassCard } from "@/components/GlassCard"
import { ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { fetchTrendsView, TrendsViewModel, SeriesPoint } from "@/services/api/noopClient"
import { isAuthenticated } from "@/services/api/noopClient"

// Each trend card: distinct data that can't be seen from a single day
const TREND_CARDS: Array<{
  id: string
  title: string
  subtitle: string
  dataKey: keyof TrendsViewModel
  color: string
  unit: string
  icon: keyof typeof Ionicons.glyphMap
  invertTrend?: boolean // true if lower = better (e.g. resting HR)
}> = [
  {
    id: "hrv",
    title: "HRV (RMSSD)",
    subtitle: "Autonomic health — higher is better",
    dataKey: "hrvTrend",
    color: "#5EC4E6",
    unit: "ms",
    icon: "pulse-outline",
  },
  {
    id: "rhr",
    title: "Resting Heart Rate",
    subtitle: "Fitness marker — lower is better",
    dataKey: "restingHrTrend",
    color: "#FF6B6B",
    unit: "bpm",
    icon: "heart-outline",
    invertTrend: true,
  },
  {
    id: "sleep",
    title: "Sleep Duration",
    subtitle: "Nightly hours over time",
    dataKey: "sleepDurationTrend",
    color: "#7C6FF7",
    unit: "h",
    icon: "moon-outline",
  },
  {
    id: "recovery",
    title: "Recovery Score",
    subtitle: "Daily readiness trend",
    dataKey: "recoveryTrend",
    color: "#4ECDC4",
    unit: "%",
    icon: "battery-charging-outline",
  },
  {
    id: "training",
    title: "Training Load Ratio",
    subtitle: "Acute vs chronic — 0.8-1.3 is optimal",
    dataKey: "trainingLoadTrend",
    color: "#FFB347",
    unit: "",
    icon: "barbell-outline",
  },
  {
    id: "consistency",
    title: "Sleep Consistency",
    subtitle: "Schedule regularity score",
    dataKey: "consistencyTrend",
    color: "#A78BFA",
    unit: "",
    icon: "calendar-outline",
  },
]

export const TrendsScreen: FC = () => {
  const { themed, theme: { colors } } = useAppTheme()
  const { width } = useWindowDimensions()
  const [trends, setTrends] = useState<TrendsViewModel | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!isAuthenticated()) return
    setLoading(true)
    try {
      const data = await fetchTrendsView(30)
      setTrends(data)
    } catch {
      // Silently fail — shows empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const chartWidth = width - 72

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={themed($container)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.tint} />}
      >
      <Text text="Trends" preset="heading" style={themed($heading)} />
      <Text
        text={trends ? `${trends.days}-day window · ${trends.dataPoints} nights` : "Pull to refresh"}
        size="xs"
        style={themed($subtitle)}
      />

      {/* Summary cards */}
      {trends?.summaries && (
        <View style={themed($summaryRow)}>
          <SummaryPill
            label="HRV"
            value={trends.summaries.hrv.current != null ? `${Math.round(trends.summaries.hrv.current)}` : "--"}
            unit="ms"
            trend={trends.summaries.hrv.trend}
            colors={colors}
          />
          <SummaryPill
            label="RHR"
            value={trends.summaries.restingHr.current != null ? `${Math.round(trends.summaries.restingHr.current)}` : "--"}
            unit="bpm"
            trend={trends.summaries.restingHr.trend}
            invertTrend
            colors={colors}
          />
          <SummaryPill
            label="Sleep"
            value={trends.summaries.sleepDuration.avgHours != null ? `${trends.summaries.sleepDuration.avgHours}` : "--"}
            unit="h avg"
            trend={null}
            colors={colors}
          />
        </View>
      )}

      {/* Trend chart cards */}
      {TREND_CARDS.map((card) => {
        const data = trends?.[card.dataKey] as SeriesPoint[] | undefined
        return (
          <GlassCard key={card.id} style={themed($card)}>
            <View style={themed($cardHeader)}>
              <Ionicons name={card.icon} size={18} color={card.color} />
              <View style={{ flex: 1 }}>
                <Text text={card.title} size="xs" weight="semiBold" style={themed($cardTitle)} />
                <Text text={card.subtitle} size="xxs" style={themed($cardSubtitle)} />
              </View>
              {data && data.length > 1 && (
                <Text
                  text={`${data[data.length - 1].value.toFixed(card.unit === "h" ? 1 : 0)}${card.unit}`}
                  size="sm"
                  weight="bold"
                  style={{ color: card.color }}
                />
              )}
            </View>
            {data && data.length > 0 ? (
              <Host style={{ width: chartWidth, height: 120 }}>
                <Chart
                  data={data.map((p, i) => ({ x: i, y: p.value }))}
                  type="line"
                  showGrid
                  animate
                  lineStyle={{
                    color: card.color,
                    width: 2.5,
                    pointStyle: "circle",
                    pointSize: 24,
                  }}
                />
              </Host>
            ) : (
              <View style={themed($emptyChart)}>
                <Text text={`No ${card.title.toLowerCase()} data yet`} size="xxs" style={themed($emptyText)} />
              </View>
            )}
          </GlassCard>
        )
      })}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Summary pill ─────────────────────────────────────────

function SummaryPill({
  label, value, unit, trend, invertTrend, colors,
}: {
  label: string
  value: string
  unit: string
  trend: string | null
  invertTrend?: boolean
  colors: any
}) {
  const trendIcon = trend === "improving" ? "trending-up" : trend === "declining" ? "trending-down" : null
  const trendColor =
    trend === "improving" ? colors.statusGreen :
    trend === "declining" ? (invertTrend ? colors.statusGreen : colors.statusRed) :
    colors.textDim

  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text text={label} size="xxs" style={{ color: colors.textDim, letterSpacing: 0.5 }} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text text={value} size="lg" weight="bold" style={{ color: colors.text }} />
        <Text text={unit} size="xxs" style={{ color: colors.textDim }} />
      </View>
      {trendIcon && (
        <Ionicons name={trendIcon as any} size={14} color={trendColor} />
      )}
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xl,
  gap: 16,
  paddingBottom: 100,
})

const $heading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  marginBottom: 8,
})

const $summaryRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 12,
  marginBottom: 8,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $cardHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
})

const $cardTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $emptyChart: ThemedStyle<ViewStyle> = () => ({
  height: 120,
  alignItems: "center",
  justifyContent: "center",
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $cardSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})
