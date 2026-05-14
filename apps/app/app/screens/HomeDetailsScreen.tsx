import { FC } from "react"
import { ScrollView, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Text } from "@/components/Text"
import { XStack } from "@/components/tamagui-primitives"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"

export const HomeDetailsScreen: FC = () => {
  const { width } = useWindowDimensions()
  const { homeView, sleepView } = useDashboard()
  const { realtimeSamples } = useBle()

  const lookupSleepMetric = (label: string): string => {
    const m = sleepView?.metrics.find((x) => x.label === label)
    return m?.value ?? "--"
  }
  const lookupSleepMetricDetail = (label: string): string | null => {
    const m = sleepView?.metrics.find((x) => x.label === label)
    return m?.detail ?? null
  }
  const vitals = [
    { key: "rhr", label: "Resting HR", value: lookupSleepMetric("Resting HR"), delta: lookupSleepMetricDetail("Resting HR") },
    { key: "hrv", label: "HRV (RMSSD)", value: lookupSleepMetric("HRV (RMSSD)"), delta: null as string | null },
    { key: "rr", label: "Respiratory Rate", value: lookupSleepMetric("Respiratory Rate"), delta: null as string | null },
    { key: "spo2", label: "Blood Oxygen", value: lookupSleepMetric("Blood Oxygen"), delta: null as string | null },
    { key: "skin", label: "Skin Temp", value: lookupSleepMetric("Skin Temp"), delta: homeView?.activities.skinTempDelta ?? null },
  ]

  const odiNumeric = homeView?.activities.odiPerHour ?? null
  const odiZone =
    odiNumeric == null
      ? null
      : odiNumeric < 5
        ? { label: "Normal", tint: "#82c46d" }
        : odiNumeric < 15
          ? { label: "Mild", tint: "#e3b34a" }
          : odiNumeric < 30
            ? { label: "Moderate", tint: "#d68064" }
            : { label: "Elevated", tint: "#d96a55" }
  const spo2Dips = lookupSleepMetric("SpO2 Dips")

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
            points={realtimeSamples}
            width={width - 72}
            height={140}
            stroke="#C76542"
            emptyLabel="Connect the strap for realtime heart rate"
          />
        </GlassCard>

        {odiNumeric != null ? (
          <GlassCard style={{ gap: 8 }}>
            <Text text="Breathing Disturbance" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
            <XStack alignItems="baseline" gap={12}>
              <Text text={`${odiNumeric.toFixed(1)}`} size="lg" weight="bold" />
              <Text text="dips/hr" size="xxs" style={{ opacity: 0.7 }} />
              {odiZone ? (
                <Text text={odiZone.label} size="xxs" weight="semiBold" style={{ color: odiZone.tint, marginLeft: 4 }} />
              ) : null}
            </XStack>
            <Text text={`${spo2Dips} desaturation events tonight (ODI · oxygen-desaturation index)`} size="xxs" style={{ opacity: 0.6 }} />
            <Text text="Screening signal only — not a clinical diagnosis. Persistent high values may warrant a medical sleep study." size="xxs" style={{ opacity: 0.5, marginTop: 4 }} />
          </GlassCard>
        ) : null}

        <GlassCard style={{ gap: 12 }}>
          <Text text="Health Monitor · 5 Vitals" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
          {vitals.map((v) => (
            <XStack key={v.key} alignItems="center" justifyContent="space-between" gap={12}>
              <Text text={v.label} size="xs" style={{ opacity: 0.7 }} />
              <XStack alignItems="baseline" gap={8}>
                <Text text={v.value} size="xs" weight="semiBold" style={{ textAlign: "right" }} />
                {v.delta ? (
                  <Text text={v.delta} size="xxs" style={{ opacity: 0.5 }} />
                ) : null}
              </XStack>
            </XStack>
          ))}
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <Text text="Derived Metrics" size="xxs" weight="bold" style={{ letterSpacing: 0.8, textTransform: "uppercase" }} />
          <MetricRow label="Stress" value={homeView?.activities.stress ?? "--"} />
          <MetricRow label="SpO₂" value={homeView?.activities.spo2 ?? "--"} />
          <MetricRow label="Skin Temp" value={homeView?.activities.skinTemp ?? "--"} />
          <MetricRow label="Skin Temp Delta" value={homeView?.activities.skinTempDelta ?? "--"} />
          <MetricRow label="Strain" value={homeView?.activities.strain ?? "--"} />
          <MetricRow label="Recovery" value={homeView?.todayOverview.dailyBalance ?? "--"} />
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
