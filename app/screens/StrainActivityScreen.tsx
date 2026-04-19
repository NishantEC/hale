import { FC } from "react"
import { ScrollView, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Text } from "@/components/Text"
import { XStack, YStack } from "@/components/tamagui-primitives"
import { useDashboard } from "@/context/DashboardContext"

export const StrainActivityScreen: FC = () => {
  const { width } = useWindowDimensions()
  const { homeView, liveDeviceState } = useDashboard()

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingVertical: 24 }}>
        <DetailScreenHeader title="Strain Activity" subtitle="Load and live context" />

        <GlassCard style={{ alignItems: "center", gap: 8, paddingVertical: 32 }}>
          <Text text="NOOP" size="xxs" weight="medium" style={{ letterSpacing: 1.2 }} />
          <Text text={homeView?.rings.strain.value ?? "--"} size="xxl" weight="bold" />
          <Text text="STRAIN" size="lg" weight="bold" style={{ letterSpacing: 2 }} />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Last 7 days" size="xxs" weight="bold" style={{ letterSpacing: 1.2 }} />
          <InlineLineChart
            points={homeView?.strainTrend ?? []}
            width={width - 72}
            height={120}
            stroke="#C76542"
          />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Load Context" size="xxs" weight="bold" style={{ letterSpacing: 1.2 }} />
          <InlineLineChart
            points={homeView?.trendSummary.samples ?? []}
            width={width - 72}
            height={110}
            stroke="#191015"
          />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <MetricRow
            label="Heart Rate (Live)"
            value={liveDeviceState.realtimeHeartRate ? `${liveDeviceState.realtimeHeartRate}` : "--"}
          />
          <MetricRow label="Stress Load" value={homeView?.activities.stress ?? "--"} />
          <MetricRow label="Load Pressure" value={homeView?.todayOverview.loadPressure ?? "--"} />
          <MetricRow label="Oxygen Saturation" value={homeView?.activities.spo2 ?? "--"} />
          <MetricRow label="Training Load Ratio" value={homeView?.activities.trainingLoad ?? "--"} />
          <MetricRow label="Load Risk Zone" value={homeView?.activities.trainingLoadRiskZone ?? "--"} />
          <MetricRow label="Recovery Index" value={homeView?.activities.recoveryIndex ?? "--"} />
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap={12}>
      <Text text={label} size="xs" weight="semiBold" />
      <Text text={value} size="xs" weight="bold" />
    </XStack>
  )
}
