import { FC, useCallback, useEffect, useState } from "react"
import { RefreshControl, TextStyle, View, ViewStyle, useWindowDimensions } from "react-native"
import { Chart, Host } from "@expo/ui/swift-ui"
import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { BlurHeader } from "@/components/BlurHeader"
import { GlassCard } from "@/components/GlassCard"
import { Text } from "@/components/Text"
import { fetchTrendsView, TrendsViewModel, SeriesPoint } from "@/services/api/noopClient"
import { isAuthenticated } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { getViewCache, setViewCache } from "@/services/db/repositories/viewCache"
import { LOCAL_THEME } from "@/utils/localTheme"

// Each trend card: distinct data that can't be seen from a single day
const TREND_CARDS: Array<{
  id: string
  title: string
  subtitle: string
  dataKey: keyof TrendsViewModel
  color: string
  unit: string
  icon: PhosphorIconName
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
  {
    id: "respiratory",
    title: "Respiratory Rate",
    subtitle: "Nightly avg — illness & recovery signal",
    dataKey: "respiratoryRateTrend",
    color: "#6BCB77",
    unit: "br/min",
    icon: "leaf-outline",
  },
  {
    id: "spo2",
    title: "Blood Oxygen (SpO₂)",
    subtitle: "Nightly avg — breathing quality",
    dataKey: "spo2Trend",
    color: "#FF6BB5",
    unit: "%",
    icon: "water-outline",
  },
]

export const TrendsScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const themed = <T,>(s: T): T => s
  const { width } = useWindowDimensions()
  const [trends, setTrends] = useState<TrendsViewModel | null>(null)
  const [loading, setLoading] = useState(false)

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  const load = useCallback(async () => {
    if (!isAuthenticated()) return
    setLoading(true)

    // Render from local cache first for instant open + offline resilience.
    try {
      const db = openDatabase()
      const cached = await getViewCache<TrendsViewModel>(db, "trends", "30d")
      if (cached) setTrends(cached)
    } catch (err) {
      console.warn("[trends] cache read failed", err)
    }

    try {
      const data = await fetchTrendsView(30)
      setTrends(data)
      try {
        const db = openDatabase()
        await setViewCache(db, "trends", "30d", data)
      } catch (cacheErr) {
        console.warn("[trends] cache write failed", cacheErr)
      }
    } catch {
      // Silently fail — keep whatever cached data we showed
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const chartWidth = width - 72

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Animated.ScrollView
        contentContainerStyle={themed($container)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.tint} />
        }
      >
      <Text text="Trends" preset="heading" style={$heading(colors)} />
      <Text
        text={
          trends ? `${trends.days}-day window · ${trends.dataPoints} nights` : "Pull to refresh"
        }
        size="xs"
        style={$subtitle(colors)}
      />

      {/* Summary cards */}
      {trends?.summaries && (
        <View style={themed($summaryRow)}>
          <SummaryPill
            label="HRV"
            value={
              trends.summaries.hrv.current != null
                ? `${Math.round(trends.summaries.hrv.current)}`
                : "--"
            }
            unit="ms"
            trend={trends.summaries.hrv.trend}
            colors={colors}
          />
          <SummaryPill
            label="RHR"
            value={
              trends.summaries.restingHr.current != null
                ? `${Math.round(trends.summaries.restingHr.current)}`
                : "--"
            }
            unit="bpm"
            trend={trends.summaries.restingHr.trend}
            invertTrend
            colors={colors}
          />
          <SummaryPill
            label="Sleep"
            value={
              trends.summaries.sleepDuration.avgHours != null
                ? `${trends.summaries.sleepDuration.avgHours}`
                : "--"
            }
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
              <PhosphorIcon name={card.icon} size={18} color={card.color} />
              <View style={{ flex: 1 }}>
                <Text text={card.title} size="xs" weight="semiBold" style={$cardTitle(colors)} />
                <Text text={card.subtitle} size="xxs" style={$cardSubtitle(colors)} />
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
                <Text
                  text={`No ${card.title.toLowerCase()} data yet`}
                  size="xxs"
                  style={$emptyText(colors)}
                />
              </View>
            )}
          </GlassCard>
        )
      })}
      </Animated.ScrollView>

      <BlurHeader title="Trends" scrollY={scrollY} fadeOver={56} />
    </SafeAreaView>
  )
}

// ── Summary pill ─────────────────────────────────────────

function SummaryPill({
  label,
  value,
  unit,
  trend,
  invertTrend,
  colors,
}: {
  label: string
  value: string
  unit: string
  trend: string | null
  invertTrend?: boolean
  colors: any
}) {
  const trendIcon =
    trend === "improving" ? "trending-up" : trend === "declining" ? "trending-down" : null
  const trendColor =
    trend === "improving"
      ? colors.statusGreen
      : trend === "declining"
        ? invertTrend
          ? colors.statusGreen
          : colors.statusRed
        : colors.textDim

  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text text={label} size="xxs" style={{ color: colors.textDim, letterSpacing: 0.5 }} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text text={value} size="lg" weight="bold" style={{ color: colors.text }} />
        <Text text={unit} size="xxs" style={{ color: colors.textDim }} />
      </View>
      {trendIcon && <PhosphorIcon name={trendIcon as any} size={14} color={trendColor} />}
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────

const $container: ViewStyle = {
  paddingHorizontal: 24,
  paddingVertical: 32,
  gap: 16,
  paddingBottom: 100,
}

const $heading = (colors: typeof LOCAL_THEME.colors): TextStyle => ({ color: colors.text })

const $subtitle = (colors: typeof LOCAL_THEME.colors): TextStyle => ({
  color: colors.textDim,
  marginBottom: 8,
})

const $summaryRow: ViewStyle = {
  flexDirection: "row",
  gap: 12,
  marginBottom: 8,
}

const $card: ViewStyle = { gap: 12 }

const $cardHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
}

const $cardTitle = (colors: typeof LOCAL_THEME.colors): TextStyle => ({ color: colors.text })

const $emptyChart: ViewStyle = {
  height: 120,
  alignItems: "center",
  justifyContent: "center",
}

const $emptyText = (colors: typeof LOCAL_THEME.colors): TextStyle => ({ color: colors.textDim })

const $cardSubtitle = (colors: typeof LOCAL_THEME.colors): TextStyle => ({ color: colors.textDim })
