import { FC } from "react"
import { TextStyle, View, ViewStyle, useWindowDimensions } from "react-native"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const StrainActivityScreen: FC = () => {
  const { themed, theme: { colors } } = useAppTheme()
  const { width } = useWindowDimensions()
  const { homeView, liveDeviceState } = useDashboard()

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <DetailScreenHeader title="Strain Activity" subtitle="Load and live context" />

      <GlassCard style={themed($heroCard)}>
        <Text text="NOOP" size="xxs" weight="medium" style={themed($eyebrow)} />
        <Text text={homeView?.rings.strain.value ?? "--"} size="xxl" weight="bold" style={themed($heroValue)} />
        <Text text="STRAIN" size="lg" weight="bold" style={themed($heroLabel)} />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <Text text="Last 7 days" size="xxs" weight="bold" style={themed($eyebrow)} />
        <InlineLineChart
          points={homeView?.strainTrend ?? []}
          width={width - 72}
          height={120}
          stroke={colors.tint}
        />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <Text text="Load Context" size="xxs" weight="bold" style={themed($eyebrow)} />
        <InlineLineChart
          points={homeView?.trendSummary.samples ?? []}
          width={width - 72}
          height={110}
          stroke={colors.text}
        />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <MetricRow label="Heart Rate (Live)" value={liveDeviceState.realtimeHeartRate ? `${liveDeviceState.realtimeHeartRate}` : "--"} />
        <MetricRow label="Stress Load" value={homeView?.activities.stress ?? "--"} />
        <MetricRow label="Load Pressure" value={homeView?.todayOverview.loadPressure ?? "--"} />
        <MetricRow label="Oxygen Saturation" value={homeView?.activities.spo2 ?? "--"} />
        <MetricRow label="Training Load Ratio" value={homeView?.activities.trainingLoad ?? "--"} />
        <MetricRow label="Load Risk Zone" value={homeView?.activities.trainingLoadRiskZone ?? "--"} />
        <MetricRow label="Recovery Index" value={homeView?.activities.recoveryIndex ?? "--"} />
      </GlassCard>
    </Screen>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($row)}>
      <Text text={label} size="xs" weight="semiBold" style={themed($rowLabel)} />
      <Text text={value} size="xs" weight="bold" style={themed($rowValue)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
})

const $heroCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xs,
  paddingVertical: spacing.xl,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  letterSpacing: 1.2,
})

const $heroValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $heroLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  letterSpacing: 2,
})

const $row: ThemedStyle<ViewStyle> = () => ({
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
})
