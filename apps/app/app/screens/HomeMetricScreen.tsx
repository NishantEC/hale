import { FC, ReactNode, useMemo } from "react"
import { ScrollView, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRoute } from "@react-navigation/native"

import { BarSeriesChart } from "@/components/BarSeriesChart"
import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Text } from "@/components/Text"
import { XStack, YStack } from "@/components/tamagui-primitives"
import { useBleConnectionState, useBleRealtimeSamples } from "@/stores/bleStore"
import { useDashboard } from "@/context/DashboardContext"

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
  const { width } = useWindowDimensions()
  const { homeView, sleepView } = useDashboard()
  const connectionState = useBleConnectionState()
  const realtimeSamples = useBleRealtimeSamples()
  const accent = "#C76542"

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
              fill={accent}
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
            <InlineLineChart points={homeView.trendSummary.samples} width={width - 72} height={120} stroke={accent} />
          ),
        }
      case "strain":
        return {
          title: "Strain",
          subtitle: "Daily load score on a 0 to 21 strain scale.",
          chart: (
            <InlineLineChart points={homeView.strainTrend} width={width - 72} height={120} stroke={accent} />
          ),
        }
      case "stress":
        return {
          title: "Stress",
          subtitle: "RR-derived stress trend from available high-quality signal.",
          chart: (
            <InlineLineChart points={homeView.stressTrend} width={width - 72} height={120} stroke={accent} />
          ),
        }
      case "loadPressure":
        return {
          title: "Load Pressure",
          subtitle: "Recent load pressure and daily balance context.",
          chart: (
            <InlineLineChart points={homeView.trendSummary.samples} width={width - 72} height={120} stroke={accent} />
          ),
        }
      case "liveHeartRate":
        return {
          title: "Live Heart Rate",
          subtitle:
            connectionState === "ready"
              ? "Realtime heart-rate stream from strap packets."
              : homeView.noDataReasons.liveHeartRate,
          chart: (
            <InlineLineChart
              points={realtimeSamples}
              width={width - 72}
              height={120}
              stroke={accent}
            />
          ),
        }
      case "activities":
      default:
        return { title: "Today's Activities", subtitle: "Current load and stress summary for activity planning.", chart: null }
    }
  }, [homeView, connectionState, realtimeSamples, metric, sleepView, width])

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingVertical: 24 }}>
        <DetailScreenHeader title={content.title} subtitle={content.subtitle} />

        <GlassCard style={{ gap: 12 }}>
          <Text text="Overview" size="xxs" weight="bold" style={{ opacity: 0.7 }} />
        </GlassCard>

        {content.chart ? <GlassCard style={{ gap: 12 }}>{content.chart}</GlassCard> : null}

        <GlassCard style={{ gap: 12 }}>
          {metric === "activities" ? (
            <YStack gap={10}>
              <MetricRow label="Stress" value={homeView?.activities.stress ?? "--"} />
              <MetricRow label="SpO₂" value={homeView?.activities.spo2 ?? "--"} />
              <MetricRow label="Skin Temp" value={homeView?.activities.skinTemp ?? "--"} />
              <MetricRow label="Skin Temp Delta" value={homeView?.activities.skinTempDelta ?? "--"} />
              <MetricRow label="Strain" value={homeView?.activities.strain ?? "--"} />
              <MetricRow label="Recovery" value={homeView?.todayOverview.dailyBalance ?? "--"} />
              <MetricRow label="Training Load" value={homeView?.activities.trainingLoad ?? "--"} />
              <MetricRow label="Load Risk" value={homeView?.activities.trainingLoadRiskZone ?? "--"} />
              <MetricRow label="SpO₂ Dips" value={homeView?.activities.spo2Dips ?? "--"} />
            </YStack>
          ) : metric === "readiness" || metric === "recovery" ? (
            <YStack gap={10}>
              <MetricRow label="Confidence" value={homeView?.confidence.confidence ?? "--"} />
              <MetricRow label="Pipeline" value={homeView?.confidence.pipelineStatus ?? "--"} />
              <MetricRow label="Source" value={homeView?.confidence.sourceBlend ?? "--"} />
              <MetricRow label="Storage" value={homeView?.confidence.storageMode ?? "--"} />
              <MetricRow label="Persistence" value={homeView?.confidence.persistenceHealth ?? "--"} />
            </YStack>
          ) : (
            <YStack gap={10}>
              <MetricRow label="Selected day" value={homeView?.selectedDateSubtitle ?? "--"} />
              <MetricRow label="Daily Balance" value={homeView?.todayOverview.dailyBalance ?? "--"} />
              <MetricRow label="Load Pressure" value={homeView?.todayOverview.loadPressure ?? "--"} />
              <MetricRow label="Sleep Reserve" value={homeView?.todayOverview.sleepReserve ?? "--"} />
              <MetricRow label="Confidence" value={homeView?.todayOverview.confidence ?? "--"} />
            </YStack>
          )}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap={12}>
      <Text text={label} size="xs" style={{ opacity: 0.7 }} />
      <Text text={value} size="xs" weight="semiBold" style={{ flexShrink: 1, textAlign: "right" }} />
    </XStack>
  )
}
