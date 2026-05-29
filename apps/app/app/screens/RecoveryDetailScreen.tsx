import { FC, useMemo } from "react"
import { ScrollView, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { GlassCard } from "@/components/GlassCard"
import { InlineLineChart } from "@/components/InlineLineChart"
import { Text } from "@/components/Text"
import { XStack, YStack } from "@/components/tamagui-primitives"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"

type ContributorState = "ok" | "warn" | "alert" | "unknown"

type Contributor = {
  label: string
  value: string
  baseline7d: string
  baseline30d: string
  state: ContributorState
}

export const RecoveryDetailScreen: FC = () => {
  const { width } = useWindowDimensions()
  const { homeView } = useDashboard()
  const colors = LOCAL_THEME.colors

  const recovery = homeView?.rings.recovery
  const numeric = recovery?.numericValue ?? null
  const sevenDay = recovery?.sevenDayAverage ?? null

  const headlineScore = numeric == null ? "--" : `${Math.round(numeric)}`
  const verdict = useMemo(() => recoveryVerdict(numeric), [numeric])

  const contributors = useMemo<Contributor[]>(() => {
    if (!homeView) return []
    const a = homeView.activities
    return [
      hrvContributor(a.hrvMs, sevenDay),
      rhrContributor(a.restingHr, a.baselineRhr),
      respRateContributor(homeView.todayOverview.sleepReserve, a.spo2),
      sleepContributor(homeView.rings.sleep.numericValue, homeView.rings.sleep.sevenDayAverage),
    ]
  }, [homeView, sevenDay])

  const deltaText = formatDeltaText(numeric, sevenDay)
  const trendPoints = homeView?.trendSummary.samples ?? []

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingVertical: 24 }}
      >
        <DetailScreenHeader
          title="Recovery"
          subtitle="Daily balance against your last 7 and 30 days."
        />

        <GlassCard style={{ gap: 12 }}>
          <Text text="TODAY" size="xxs" weight="bold" style={{ opacity: 0.6, letterSpacing: 1.4 }} />
          <XStack alignItems="flex-end" gap={10}>
            <Text
              text={headlineScore}
              size="xxl"
              weight="bold"
              style={{ color: colors.ringRecovery, fontSize: 56, lineHeight: 60 }}
            />
            {deltaText ? (
              <Text
                text={deltaText.label}
                size="xs"
                weight="semiBold"
                style={{
                  color:
                    deltaText.direction === "up"
                      ? colors.statusGreen
                      : deltaText.direction === "down"
                        ? colors.statusRed
                        : colors.textMuted,
                  marginBottom: 10,
                }}
              />
            ) : null}
          </XStack>
          <Text text={verdict} size="sm" weight="semiBold" />
        </GlassCard>

        {trendPoints.length ? (
          <GlassCard style={{ gap: 12 }}>
            <Text text="7-DAY TREND" size="xxs" weight="bold" style={{ opacity: 0.6, letterSpacing: 1.4 }} />
            <InlineLineChart
              points={trendPoints}
              width={width - 72}
              height={120}
              stroke={colors.ringRecovery}
            />
          </GlassCard>
        ) : null}

        <GlassCard style={{ gap: 12 }}>
          <Text text="CONTRIBUTORS" size="xxs" weight="bold" style={{ opacity: 0.6, letterSpacing: 1.4 }} />
          <YStack gap={14}>
            {contributors.map((c) => (
              <ContributorRow key={c.label} contributor={c} />
            ))}
          </YStack>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  )
}

function ContributorRow({ contributor }: { contributor: Contributor }) {
  const colors = LOCAL_THEME.colors
  const stateColor =
    contributor.state === "ok"
      ? colors.statusGreen
      : contributor.state === "warn"
        ? colors.statusAmber
        : contributor.state === "alert"
          ? colors.statusRed
          : colors.textMuted

  return (
    <XStack alignItems="center" gap={12}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: stateColor,
        }}
      />
      <YStack flex={1} gap={2}>
        <XStack alignItems="baseline" justifyContent="space-between">
          <Text text={contributor.label} size="xs" weight="semiBold" />
          <Text
            text={contributor.value}
            size="xs"
            weight="semiBold"
            style={{ fontVariant: ["tabular-nums"] }}
          />
        </XStack>
        <XStack gap={10}>
          <Text text={`7d ${contributor.baseline7d}`} size="xxs" style={{ opacity: 0.55 }} />
          <Text text={`30d ${contributor.baseline30d}`} size="xxs" style={{ opacity: 0.55 }} />
        </XStack>
      </YStack>
    </XStack>
  )
}

function recoveryVerdict(score: number | null): string {
  if (score == null) return "Not enough data yet"
  if (score >= 67) return "Recovered — green for full effort"
  if (score >= 34) return "Yellow — moderate effort"
  return "Red — prioritise recovery today"
}

function formatDeltaText(
  current: number | null,
  baseline: number | null,
): { direction: "up" | "down" | "flat"; label: string } | null {
  if (current == null || baseline == null) return null
  const diff = current - baseline
  if (Math.abs(diff) < 0.5) return { direction: "flat", label: "— flat vs 7d" }
  if (diff > 0) return { direction: "up", label: `▲ +${Math.round(diff)} vs 7d` }
  return { direction: "down", label: `▼ ${Math.round(diff)} vs 7d` }
}

function hrvContributor(hrvMs: number | null, baseline: number | null): Contributor {
  if (hrvMs == null) {
    return {
      label: "HRV",
      value: "--",
      baseline7d: "--",
      baseline30d: "--",
      state: "unknown",
    }
  }
  const baseline7 = baseline != null ? `${Math.round(baseline)} ms` : "--"
  const state: ContributorState =
    baseline == null ? "unknown" : hrvMs >= baseline * 0.9 ? "ok" : hrvMs >= baseline * 0.75 ? "warn" : "alert"
  return {
    label: "HRV",
    value: `${Math.round(hrvMs)} ms`,
    baseline7d: baseline7,
    baseline30d: baseline7,
    state,
  }
}

function rhrContributor(rhrText: string, baseline: number | null): Contributor {
  const rhrNum = parseFloat(rhrText)
  if (!Number.isFinite(rhrNum)) {
    return {
      label: "Resting HR",
      value: "--",
      baseline7d: "--",
      baseline30d: "--",
      state: "unknown",
    }
  }
  const baselineText = baseline != null ? `${Math.round(baseline)} bpm` : "--"
  const state: ContributorState =
    baseline == null
      ? "unknown"
      : Math.abs(rhrNum - baseline) <= 4
        ? "ok"
        : Math.abs(rhrNum - baseline) <= 8
          ? "warn"
          : "alert"
  return {
    label: "Resting HR",
    value: `${Math.round(rhrNum)} bpm`,
    baseline7d: baselineText,
    baseline30d: baselineText,
    state,
  }
}

function respRateContributor(_: string, __: string): Contributor {
  return {
    label: "Respiratory rate",
    value: "--",
    baseline7d: "--",
    baseline30d: "--",
    state: "unknown",
  }
}

function sleepContributor(score: number | null, baseline: number | null): Contributor {
  if (score == null) {
    return {
      label: "Sleep score",
      value: "--",
      baseline7d: "--",
      baseline30d: "--",
      state: "unknown",
    }
  }
  const baselineText = baseline != null ? `${Math.round(baseline)}` : "--"
  const state: ContributorState =
    baseline == null ? "unknown" : score >= baseline - 5 ? "ok" : score >= baseline - 15 ? "warn" : "alert"
  return {
    label: "Sleep score",
    value: `${Math.round(score)}`,
    baseline7d: baselineText,
    baseline30d: baselineText,
    state,
  }
}
