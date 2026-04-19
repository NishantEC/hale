import { FC } from "react"
import { ScrollView, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Text } from "@/components/Text"
import { XStack } from "@/components/tamagui-primitives"
import { useDashboard } from "@/context/DashboardContext"

export const HomeDetailsScreen: FC = () => {
  const { width } = useWindowDimensions()
  const { homeView, liveDeviceState } = useDashboard()

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingVertical: 24 }}>
        <DetailScreenHeader
          title="Your Day in Review"
          subtitle={homeView?.todayOverview.dateLabel ?? "Selected day"}
        />

        <GlassCard style={{ gap: 12 }}>
          <Text
            text={homeView?.todayOverview.headline ?? "Run a sync to generate your daily review."}
            size="lg"
            weight="bold"
          />
          <Text text={homeView?.todayOverview.detail ?? "--"} size="xs" style={{ opacity: 0.7 }} />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Live Heart Rate" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
          <InlineLineChart
            points={liveDeviceState.realtimeSamples}
            width={width - 72}
            height={140}
            stroke="#C76542"
            emptyLabel="Connect the strap for realtime heart rate"
          />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Derived Metrics" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
          <MetricRow label="Stress" value={homeView?.activities.stress ?? "--"} />
          <MetricRow label="SpO₂" value={homeView?.activities.spo2 ?? "--"} />
          <MetricRow label="Skin Temp" value={homeView?.activities.skinTemp ?? "--"} />
          <MetricRow label="Skin Temp Delta" value={homeView?.activities.skinTempDelta ?? "--"} />
          <MetricRow label="Strain" value={homeView?.activities.strain ?? "--"} />
          <MetricRow label="Recovery Index" value={homeView?.activities.recoveryIndex ?? "--"} />
          <MetricRow label="Training Load" value={homeView?.activities.trainingLoad ?? "--"} />
          <MetricRow label="Load Risk" value={homeView?.activities.trainingLoadRiskZone ?? "--"} />
          <MetricRow label="SpO₂ Dips" value={homeView?.activities.spo2Dips ?? "--"} />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Recovery Confidence" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
          <MetricRow label="Confidence" value={homeView?.confidence.confidence ?? "--"} />
          <MetricRow label="Pipeline" value={homeView?.confidence.pipelineStatus ?? "--"} />
          <MetricRow label="Source" value={homeView?.confidence.sourceBlend ?? "--"} />
          <MetricRow label="Storage" value={homeView?.confidence.storageMode ?? "--"} />
          <MetricRow label="Persistence" value={homeView?.confidence.persistenceHealth ?? "--"} />
          <Text text={homeView?.confidence.disclaimer ?? "--"} size="xxs" style={{ opacity: 0.7 }} />
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
