import { FC, useEffect, useMemo, useState } from "react"
import { RefreshControl, ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"

import { Text } from "@/components/Text"
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import {
  fetchInsights,
  type InsightsViewModel,
  type MetricInsights,
} from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

export const InsightsScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const [view, setView] = useState<InsightsViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const v = await fetchInsights(30)
      setView(v)
    } catch (e) {
      console.warn("[insights] fetch failed", e)
      setView(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 32,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
      >
        <Text
          text="INSIGHTS"
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            marginBottom: 4,
          }}
        />
        <Text
          text="What's helping and hurting"
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.4,
            marginBottom: 14,
          }}
        />

        {loading && !view ? (
          <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
            <Text
              text="Loading…"
              style={{ color: colors.textDim, fontSize: 13 }}
            />
          </View>
        ) : !view || !view.hasEnoughData ? (
          <CalibratingCard
            daysUntilReady={view?.daysUntilReady ?? 14}
            totalDays={view?.totalDays ?? 0}
          />
        ) : view.insights.every((m) => m.factors.length === 0) ? (
          <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
            <Text
              text="No correlations yet"
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "700",
                marginBottom: 6,
              }}
            />
            <Text
              text={`Tracked ${view.totalDays} days over the last ${view.windowDays}, but no single factor has been logged on ≥3 separate days AND skipped on ≥3 separate days yet — the threshold the correlator needs to tell signal from noise. Keep logging.`}
              style={{
                color: colors.textDim,
                fontSize: 13,
                lineHeight: 19,
              }}
            />
          </View>
        ) : (
          view.insights
            .filter((m) => m.factors.length > 0)
            .map((m) => <MetricSection key={m.metric} insights={m} />)
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const CalibratingCard: FC<{ daysUntilReady: number; totalDays: number }> = ({
  daysUntilReady,
  totalDays,
}) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text="Calibrating"
        style={{
          color: colors.text,
          fontSize: 16,
          fontWeight: "700",
        }}
      />
      <Text
        text={`Tracked ${totalDays} day${totalDays === 1 ? "" : "s"}. ${daysUntilReady} more day${daysUntilReady === 1 ? "" : "s"} of data + journal entries before the correlator can tell signal from noise.`}
        style={{
          color: colors.textDim,
          fontSize: 13,
          fontWeight: "400",
          lineHeight: 19,
          marginTop: 6,
        }}
      />
      <View style={{ marginTop: 14 }}>
        <Text
          text="START A JOURNAL ENTRY"
          style={{
            color: colors.tint,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
          }}
          onPress={() => router.push("/journal-entry")}
        />
      </View>
    </View>
  )
}

const MetricSection: FC<{ insights: MetricInsights }> = ({ insights }) => {
  const { colors } = LOCAL_THEME
  const maxMagnitude = useMemo(() => {
    let max = 0
    for (const f of insights.factors) max = Math.max(max, Math.abs(f.delta))
    return Math.max(0.1, max)
  }, [insights.factors])

  return (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text={insights.metricLabel.toUpperCase()}
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
        }}
      />
      <Text
        text={`What ${insights.metricLabel.toLowerCase()} responds to · ${insights.sampleDays} tracked days`}
        style={{
          color: colors.textMuted,
          fontSize: 11,
          marginTop: 2,
          marginBottom: 14,
        }}
      />
      {insights.factors.map((f) => (
        <ImpactRow
          key={f.factorTag}
          tag={f.factorTag}
          delta={f.delta}
          daysWith={f.daysWith}
          helps={f.helps}
          maxMagnitude={maxMagnitude}
        />
      ))}
    </View>
  )
}

const ImpactRow: FC<{
  tag: string
  delta: number
  daysWith: number
  helps: boolean
  maxMagnitude: number
}> = ({ tag, delta, daysWith, helps, maxMagnitude }) => {
  const { colors } = LOCAL_THEME
  const factor = JOURNAL_FACTORS.find((j) => j.tag === tag)
  const label = factor?.label ?? tag
  const barColor = helps ? colors.statusGreen : colors.statusRed
  const fraction = Math.min(1, Math.abs(delta) / maxMagnitude)
  // Bars anchor on center axis: helps fills right, hurts fills left.
  const halfWidthPct = fraction * 50

  return (
    <View style={$row}>
      <Text
        text={label}
        style={{ color: colors.text, fontSize: 13, flex: 1 }}
        numberOfLines={1}
      />
      <View style={$barTrackWrap}>
        <View style={[$barCenterLine, { backgroundColor: colors.surfaceElevated }]} />
        {delta >= 0 ? (
          <View
            style={[
              $barFill,
              {
                backgroundColor: barColor,
                left: "50%",
                width: `${halfWidthPct}%`,
              },
            ]}
          />
        ) : (
          <View
            style={[
              $barFill,
              {
                backgroundColor: barColor,
                right: "50%",
                width: `${halfWidthPct}%`,
              },
            ]}
          />
        )}
      </View>
      <View style={$rowRight}>
        <Text
          text={`${delta >= 0 ? "+" : ""}${delta}`}
          style={{
            color: barColor,
            fontSize: 13,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          text={`${daysWith}d`}
          style={{
            color: colors.textMuted,
            fontSize: 10,
            fontVariant: ["tabular-nums"],
          }}
        />
      </View>
    </View>
  )
}

const $card: ViewStyle = {
  borderRadius: 14,
  padding: 16,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 8,
  gap: 10,
}

const $barTrackWrap: ViewStyle = {
  flex: 1.5,
  height: 18,
  position: "relative",
  justifyContent: "center",
}

const $barCenterLine: ViewStyle = {
  position: "absolute",
  left: "50%",
  top: 4,
  bottom: 4,
  width: 1,
}

const $barFill: ViewStyle = {
  position: "absolute",
  top: 6,
  bottom: 6,
  borderRadius: 3,
  opacity: 0.85,
}

const $rowRight: ViewStyle = {
  width: 44,
  alignItems: "flex-end",
}
