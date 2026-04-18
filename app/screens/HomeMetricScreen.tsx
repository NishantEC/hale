import { FC, ReactNode, useMemo } from "react"
import { TextStyle, View, ViewStyle, useWindowDimensions } from "react-native"
import { useRoute } from "@react-navigation/native"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const METRIC_OPTIONS = [
  "sleep",
  "recovery",
  "readiness",
  "strain",
  "stress",
  "loadPressure",
  "liveHeartRate",
  "activities",
] as const

type MetricOption = (typeof METRIC_OPTIONS)[number]

function resolveMetric(metricParam?: string | string[]) {
  const normalized = Array.isArray(metricParam) ? metricParam[0] : metricParam
  return METRIC_OPTIONS.includes(normalized as MetricOption)
    ? (normalized as MetricOption)
    : "activities"
}

export const HomeMetricScreen: FC = () => {
  const route = useRoute<any>()
  const metricParam = route.params?.metric as string | string[] | undefined
  const metric = resolveMetric(metricParam)
  const { themed, theme: { colors } } = useAppTheme()
  const { width } = useWindowDimensions()
  const { homeView, sleepView, liveDeviceState } = useDashboard()

  const content = useMemo(() => {
    if (!homeView) {
      return {
        title: "Metric Detail",
        subtitle: "Run a sync to load the selected metric.",
        chart: null as ReactNode,
      }
    }

    switch (metric) {
      case "sleep":
        return {
          title: "Sleep",
          subtitle: "Sleep reserve, consistency, and detected overnight duration.",
          chart: sleepView ? (
            <BarSeriesChart
              points={sleepView.durationTrend.samples}
              width={width - 72}
              height={120}
              fill={colors.tint}
              referenceValue={sleepView.durationTrend.targetHours}
            />
          ) : null,
        }
      case "recovery":
      case "readiness":
        return {
          title: metric === "readiness" ? "Readiness" : "Recovery",
          subtitle: "Daily balance and confidence-backed recovery readiness.",
          chart: (
            <InlineLineChart
              points={homeView.trendSummary.samples}
              width={width - 72}
              height={120}
              stroke={colors.tint}
            />
          ),
        }
      case "strain":
        return {
          title: "Strain",
          subtitle: "Daily load score on a 0 to 21 strain scale.",
          chart: (
            <InlineLineChart
              points={homeView.strainTrend}
              width={width - 72}
              height={120}
              stroke={colors.tint}
            />
          ),
        }
      case "stress":
        return {
          title: "Stress",
          subtitle: "RR-derived stress trend from available high-quality signal.",
          chart: (
            <InlineLineChart
              points={homeView.stressTrend}
              width={width - 72}
              height={120}
              stroke={colors.tint}
            />
          ),
        }
      case "loadPressure":
        return {
          title: "Load Pressure",
          subtitle: "Recent load pressure and daily balance context.",
          chart: (
            <InlineLineChart
              points={homeView.trendSummary.samples}
              width={width - 72}
              height={120}
              stroke={colors.tint}
            />
          ),
        }
      case "liveHeartRate":
        return {
          title: "Live Heart Rate",
          subtitle:
            liveDeviceState.connectionState === "ready"
              ? "Realtime heart-rate stream from strap packets."
              : homeView.noDataReasons.liveHeartRate,
          chart: (
            <InlineLineChart
              points={liveDeviceState.realtimeSamples}
              width={width - 72}
              height={120}
              stroke={colors.tint}
            />
          ),
        }
      case "activities":
      default:
        return {
          title: "Today's Activities",
          subtitle: "Current load and stress summary for activity planning.",
          chart: null,
        }
    }
  }, [homeView, liveDeviceState.connectionState, liveDeviceState.realtimeSamples, metric, sleepView, width])

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <DetailScreenHeader title={content.title} subtitle={content.subtitle} />

      <GlassCard style={themed($card)}>
        <Text text="Overview" size="xxs" weight="bold" style={themed($subtitle)} />
      </GlassCard>

      {content.chart ? <GlassCard style={themed($card)}>{content.chart}</GlassCard> : null}

      <GlassCard style={themed($card)}>
        {metric === "activities" ? (
          <View style={themed($metricList)}>
            <MetricRow label="Stress" value={homeView?.activities.stress ?? "--"} />
            <MetricRow label="SpO₂" value={homeView?.activities.spo2 ?? "--"} />
            <MetricRow label="Skin Temp" value={homeView?.activities.skinTemp ?? "--"} />
            <MetricRow label="Skin Temp Delta" value={homeView?.activities.skinTempDelta ?? "--"} />
            <MetricRow label="Strain" value={homeView?.activities.strain ?? "--"} />
            <MetricRow label="Recovery Index" value={homeView?.activities.recoveryIndex ?? "--"} />
            <MetricRow label="Training Load" value={homeView?.activities.trainingLoad ?? "--"} />
            <MetricRow label="Load Risk" value={homeView?.activities.trainingLoadRiskZone ?? "--"} />
            <MetricRow label="SpO₂ Dips" value={homeView?.activities.spo2Dips ?? "--"} />
          </View>
        ) : metric === "readiness" || metric === "recovery" ? (
          <View style={themed($metricList)}>
            <MetricRow label="Confidence" value={homeView?.confidence.confidence ?? "--"} />
            <MetricRow label="Pipeline" value={homeView?.confidence.pipelineStatus ?? "--"} />
            <MetricRow label="Source" value={homeView?.confidence.sourceBlend ?? "--"} />
            <MetricRow label="Storage" value={homeView?.confidence.storageMode ?? "--"} />
            <MetricRow label="Persistence" value={homeView?.confidence.persistenceHealth ?? "--"} />
          </View>
        ) : (
          <View style={themed($metricList)}>
            <MetricRow label="Selected day" value={homeView?.selectedDateSubtitle ?? "--"} />
            <MetricRow label="Daily Balance" value={homeView?.todayOverview.dailyBalance ?? "--"} />
            <MetricRow label="Load Pressure" value={homeView?.todayOverview.loadPressure ?? "--"} />
            <MetricRow label="Sleep Reserve" value={homeView?.todayOverview.sleepReserve ?? "--"} />
            <MetricRow label="Confidence" value={homeView?.todayOverview.confidence ?? "--"} />
          </View>
        )}
      </GlassCard>
    </Screen>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($rowBetween)}>
      <Text text={label} size="xs" style={themed($rowLabel)} />
      <Text text={value} size="xs" weight="semiBold" style={themed($rowValue)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $metricList: ThemedStyle<ViewStyle> = () => ({
  gap: 10,
})

const $rowBetween: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 12,
})

const $rowLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $rowValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flexShrink: 1,
  textAlign: "right",
})
