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

export const HomeDetailsScreen: FC = () => {
  const { themed, theme: { colors } } = useAppTheme()
  const { width } = useWindowDimensions()
  const { homeView, liveDeviceState } = useDashboard()

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <DetailScreenHeader
        title="Your Day in Review"
        subtitle={homeView?.todayOverview.dateLabel ?? "Selected day"}
      />

      <GlassCard style={themed($card)}>
        <Text
          text={homeView?.todayOverview.headline ?? "Run a sync to generate your daily review."}
          size="lg"
          weight="bold"
          style={themed($headline)}
        />
        <Text text={homeView?.todayOverview.detail ?? "--"} size="xs" style={themed($subtitle)} />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <Text text="Live Heart Rate" size="xxs" weight="bold" style={themed($eyebrow)} />
        <InlineLineChart
          points={liveDeviceState.realtimeSamples}
          width={width - 72}
          height={140}
          stroke={colors.tint}
          emptyLabel="Connect the strap for realtime heart rate"
        />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <Text text="Derived Metrics" size="xxs" weight="bold" style={themed($eyebrow)} />
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

      <GlassCard style={themed($card)}>
        <Text text="Recovery Confidence" size="xxs" weight="bold" style={themed($eyebrow)} />
        <MetricRow label="Confidence" value={homeView?.confidence.confidence ?? "--"} />
        <MetricRow label="Pipeline" value={homeView?.confidence.pipelineStatus ?? "--"} />
        <MetricRow label="Source" value={homeView?.confidence.sourceBlend ?? "--"} />
        <MetricRow label="Storage" value={homeView?.confidence.storageMode ?? "--"} />
        <MetricRow label="Persistence" value={homeView?.confidence.persistenceHealth ?? "--"} />
        <Text text={homeView?.confidence.disclaimer ?? "--"} size="xxs" style={themed($subtitle)} />
      </GlassCard>
    </Screen>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($rowBetween)}>
      <Text text={label} size="xs" style={themed($subtitle)} />
      <Text text={value} size="xs" weight="semiBold" style={themed($value)} />
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

const $headline: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  letterSpacing: 0.8,
  textTransform: "uppercase",
})

const $rowBetween: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
})

const $value: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flexShrink: 1,
  textAlign: "right",
})
