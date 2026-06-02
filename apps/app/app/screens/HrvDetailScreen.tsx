import { FC, useCallback, useEffect, useRef, useState } from "react"
import { Pressable, RefreshControl, View, ViewStyle, useWindowDimensions } from "react-native"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFocusEffect } from "@react-navigation/native"
import { Info } from "phosphor-react-native"

import { ContributorList, type ContributorItem } from "@/components/health/ContributorList"
import { type NumBlockDirection } from "@/components/health/NumBlock"
import { InfoSheet } from "@/components/InfoSheet"
import { InlineLineChart } from "@/components/InlineLineChart"
import { MetricHero } from "@/components/MetricHero"
import { ScreenHeader, SCREEN_HEADER_HEIGHT } from "@/components/ScreenHeader"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import {
  fetchInsights,
  fetchTrendsView,
  type InsightsViewModel,
  type TrendsViewModel,
} from "@/services/api/noopClient"
import { humanizeFactorTag } from "@/utils/factorLabels"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

const HRV_TINT = "#539df5"

const RANGES: Array<{ label: string; days: number }> = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
]

export const HrvDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { sleepView, isRefreshing, refreshDashboard, error, clearError, selectedDate } =
    useDashboard()

  const [rangeDays, setRangeDays] = useState(30)
  const [trends, setTrends] = useState<TrendsViewModel | null>(null)
  const [insights, setInsights] = useState<InsightsViewModel | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const lastShownError = useRef<string | null>(null)
  const lastFetchAt = useRef(0)
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })
  const scrollTopPadding = insets.top + SCREEN_HEADER_HEIGHT + 8
  const chartWidth = width - 48 - 28

  const reload = useCallback(() => {
    let cancelled = false
    // Pull the longest window once; the toggle slices it client-side so the
    // reference frames (7d/30d/max) stay stable regardless of the chart range.
    fetchTrendsView(365)
      .then((t) => {
        if (!cancelled) setTrends(t)
      })
      .catch(() => {})
    fetchInsights(90)
      .then((i) => {
        if (!cancelled) setInsights(i)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => reload(), [reload])

  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      if (now - lastFetchAt.current > 30_000) {
        lastFetchAt.current = now
        reload()
      }
    }, [reload]),
  )

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  const formattedDate = (() => {
    const [y, m, d] = selectedDate.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(y, m - 1, d, 12))
  })()

  // Selected-night RMSSD is authoritative for the hero; the trend series backs
  // the chart and the trailing baselines.
  const hrvValueRaw = sleepView?.metrics.find((x) => x.label === "HRV (RMSSD)")?.value ?? "--"
  const hrvNumeric = parseFloat(hrvValueRaw)
  const validHrv = Number.isFinite(hrvNumeric)
  const hrvDelta = sleepView?.vitalsDelta?.hrv ?? null

  const hrvTrend = trends?.hrvTrend ?? []
  const values = hrvTrend.map((p) => p.value).filter((v) => Number.isFinite(v))
  const last7 = values.slice(-7)
  const last30 = values.slice(-30)
  const avg7d = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : null
  const avg30d = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : null
  const personalMax = values.length ? Math.max(...values) : null
  const current = validHrv ? hrvNumeric : values.length ? values[values.length - 1] : null
  const chartPoints = hrvTrend.slice(-rangeDays)

  const classification = (() => {
    if (current == null) return { label: "No data", tint: colors.textMuted }
    if (avg30d == null) return { label: "Tracking", tint: HRV_TINT }
    const ratio = current / avg30d
    if (ratio >= 1.05) return { label: "Elevated", tint: colors.statusGreen }
    if (ratio >= 0.9) return { label: "Typical", tint: HRV_TINT }
    return { label: "Suppressed", tint: colors.statusAmber }
  })()

  const refItems: ContributorItem[] = []
  if (current != null) {
    const add = (key: string, label: string, base: number | null, isReference: boolean) => {
      if (base == null) return
      const delta = current - base
      const direction: NumBlockDirection = isReference
        ? "flat"
        : Math.abs(delta) < 0.5
          ? "flat"
          : delta > 0
            ? "up"
            : "down"
      refItems.push({
        key,
        label,
        value: `${Math.round(current)}`,
        unit: "ms",
        baseline: `${Math.round(base)}`,
        deltaText: `${delta >= 0 ? "+" : ""}${Math.round(delta)}`,
        direction,
      })
    }
    add("d7", "vs 7-night avg", avg7d, false)
    add("d30", "vs 30-night avg", avg30d, false)
    add("max", "vs personal best", personalMax, true)
  }

  const hrvFactors = (insights?.insights.find((m) => m.metric === "hrv")?.factors ?? [])
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const infoAction = (
    <Pressable onPress={() => setInfoOpen(true)} hitSlop={12}>
      <Info size={20} color={colors.textDim} />
    </Pressable>
  )

  return (
    <View style={themed($screenWrap)}>
      <ScreenHeader title="HRV" subtitle={formattedDate} scrollY={scrollY} rightAction={infoAction} />
      <Animated.ScrollView
        contentContainerStyle={[themed($container), { paddingTop: scrollTopPadding }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <MetricHero
          value={current != null ? `${Math.round(current)}` : "--"}
          valueDetail="RMSSD · ms"
          badge={{ label: classification.label, tint: classification.tint }}
          delta={hrvDelta}
          deltaUnit="ms"
          detail="Heart-rate variability measured during sleep. Higher generally means better autonomic recovery."
        />

        {refItems.length > 0 ? <ContributorList title="reference" items={refItems} /> : null}

        <View style={{ padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {RANGES.map((r) => {
              const active = r.days === rangeDays
              return (
                <Pressable
                  key={r.days}
                  onPress={() => setRangeDays(r.days)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: active ? HRV_TINT : colors.surfaceElevated,
                    alignItems: "center",
                  }}
                >
                  <Text
                    text={r.label}
                    style={{ color: active ? "#fff" : colors.textDim, fontSize: 13, fontWeight: "700" }}
                  />
                </Pressable>
              )
            })}
          </View>
          <InlineLineChart
            points={chartPoints}
            width={chartWidth}
            height={150}
            stroke={HRV_TINT}
            referenceValue={avg30d ?? undefined}
            emptyLabel="No HRV history yet"
          />
        </View>

        {hrvFactors.length > 0 ? (
          <View style={{ padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
            <Text
              text="WHAT MOVES YOUR HRV"
              style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginBottom: 4 }}
            />
            {hrvFactors.slice(0, 6).map((f) => (
              <View key={f.factorTag} style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                <Text text={humanizeFactorTag(f.factorTag)} style={{ flex: 1, color: colors.text, fontSize: 14 }} />
                <Text
                  text={`${f.delta >= 0 ? "+" : ""}${Math.round(f.delta)} ms`}
                  style={{
                    color: f.helps ? colors.statusGreen : colors.statusRed,
                    fontSize: 13,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                />
              </View>
            ))}
            <Text
              text="Average HRV on days with vs. without each logged behaviour."
              style={{ color: colors.textMuted, fontSize: 11, marginTop: 12 }}
            />
          </View>
        ) : insights && !insights.hasEnoughData ? (
          <Text
            text={`Keep journaling — HRV drivers unlock in ${insights.daysUntilReady} day${insights.daysUntilReady === 1 ? "" : "s"}.`}
            style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", paddingHorizontal: 24 }}
          />
        ) : null}
      </Animated.ScrollView>

      <InfoSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Why HRV matters"
        paragraphs={[
          "Heart-rate variability (RMSSD) is the beat-to-beat variation in your heart rate during sleep. It reflects how well your autonomic nervous system balances stress and recovery.",
          "Higher HRV generally means you're well-recovered and adaptable; a drop often shows up before you feel run down — after alcohol, poor sleep, hard training, or illness.",
          "HRV is deeply personal — compare it to your own baseline, not to other people. It takes a couple of weeks of nights to establish your normal range.",
        ]}
      />
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
