import { FC, useMemo } from "react"
import { ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"

import { DateSwitcher } from "@/components/DateSwitcher"
import { ContributorList } from "@/components/health/ContributorList"
import { GlowScoreCard } from "@/components/health/GlowScoreCard"
import { HealthspanCard } from "@/components/health/HealthspanCard"
import { TrendCard } from "@/components/health/TrendCard"
import { VitalsGrid, type VitalsGridItem } from "@/components/health/VitalsGrid"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import { fetchHealthView, type HealthViewModel } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useEffect, useState } from "react"

export const HealthScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { colors } = LOCAL_THEME
  const {
    selectedDate,
    homeView,
    goToPreviousDay,
    goToNextDay,
  } = useDashboard()

  const [healthView, setHealthView] = useState<HealthViewModel | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchHealthView()
      .then((v) => {
        if (!cancelled) setHealthView(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const monitorsHealth = homeView?.monitors?.health
  const activities = homeView?.activities
  const sleepRing = homeView?.rings.sleep
  const recoveryRing = homeView?.rings.recovery
  const stressMonitor = homeView?.monitors?.stress

  const hero = useMemo(() => {
    const inRange = monitorsHealth?.inRangeCount ?? 0
    const total = monitorsHealth?.totalMetrics ?? 0
    const score = total > 0 ? `${inRange}` : "--"
    const sub = total > 0 ? `/${total}` : undefined
    const verdict =
      monitorsHealth?.verdict ??
      (total === 0 ? "Calibrating — no vitals yet" : "")
    const tint =
      monitorsHealth?.state === "ok"
        ? colors.statusGreen
        : monitorsHealth?.state === "warn"
          ? colors.statusAmber
          : monitorsHealth?.state === "alert"
            ? colors.statusRed
            : colors.textMuted
    const body =
      total === 0
        ? "Wear the strap overnight to lock in your baseline. Vitals appear after the first night."
        : inRange === total
          ? "Every vital sits inside your personal range today. Carry on as normal."
          : `${inRange} of ${total} vitals are inside your personal range. Tap to see which need attention.`
    return { score, sub, verdict, tint, body }
  }, [monitorsHealth, colors])

  const vitals = useMemo<VitalsGridItem[]>(() => {
    return [
      tile(
        "rhr",
        "RHR",
        activities?.restingHr ?? "--",
        activities?.baselineRhr != null ? `bpm · 30d ${Math.round(activities.baselineRhr)}` : "bpm",
        colors.ringRecovery,
      ),
      tile(
        "hrv",
        "HRV",
        activities?.hrvMs != null ? `${Math.round(activities.hrvMs)}` : "--",
        "ms",
        colors.ringHrv ?? colors.statusGreen,
      ),
      tile(
        "rr",
        "Respiratory",
        activities?.respiratoryRate != null ? activities.respiratoryRate.toFixed(1) : "--",
        "br/min",
        colors.ringSleep,
      ),
      tile("spo2", "SpO₂", activities?.spo2 ?? "--", undefined, colors.statusGreen),
      tile(
        "skintemp",
        "Skin Temp",
        activities?.skinTemp ?? "--",
        activities?.skinTempDelta && activities.skinTempDelta !== "--"
          ? activities.skinTempDelta
          : undefined,
        colors.statusAmber,
      ),
      tile(
        "sleep",
        "Sleep",
        sleepRing?.numericValue != null ? `${Math.round(sleepRing.numericValue)}` : "--",
        sleepRing?.sevenDayAverage != null
          ? `score · 7d ${Math.round(sleepRing.sevenDayAverage)}`
          : "score",
        colors.ringSleep,
      ),
      tile(
        "recovery",
        "Recovery 7d",
        recoveryRing?.sevenDayAverage != null
          ? `${Math.round(recoveryRing.sevenDayAverage)}`
          : "--",
        "avg",
        colors.ringRecovery,
      ),
      tile(
        "stress",
        "Stress",
        stressMonitor?.score != null ? `${Math.round(stressMonitor.score)}` : "--",
        stressMonitor?.zone ?? "today",
        stressMonitor?.zone === "High"
          ? colors.statusRed
          : stressMonitor?.zone === "Moderate"
            ? colors.statusAmber
            : colors.statusGreen,
      ),
    ]
  }, [activities, sleepRing, recoveryRing, stressMonitor, colors])

  const contributors7d = useMemo(() => {
    if (!homeView) return []
    return [
      contributor(
        "hrv-7d",
        "HRV",
        activities?.hrvMs,
        null,
        "ms",
        7,
      ),
      contributor(
        "rhr-7d",
        "Resting HR",
        toNumeric(activities?.restingHr),
        activities?.baselineRhr ?? null,
        "bpm",
        7,
      ),
      contributor(
        "sleep-7d",
        "Sleep score",
        sleepRing?.numericValue ?? null,
        sleepRing?.sevenDayAverage ?? null,
        "",
        7,
      ),
      contributor(
        "recovery-7d",
        "Recovery",
        recoveryRing?.numericValue ?? null,
        recoveryRing?.sevenDayAverage ?? null,
        "",
        7,
      ),
    ]
  }, [homeView, activities, sleepRing, recoveryRing])

  const contributors30d = useMemo(() => {
    if (!homeView) return []
    return [
      contributor(
        "rhr-30d",
        "Resting HR",
        toNumeric(activities?.restingHr),
        activities?.baselineRhr ?? null,
        "bpm",
        30,
      ),
      contributor(
        "sleep-30d",
        "Sleep score",
        sleepRing?.numericValue ?? null,
        sleepRing?.sevenDayAverage ?? null,
        "",
        30,
      ),
    ]
  }, [homeView, activities, sleepRing])

  const noopAge = healthView?.current?.noopAge ?? null
  const chronoAge = healthView?.current?.chronologicalAge ?? null
  const ageDelta = noopAge != null && chronoAge != null ? noopAge - chronoAge : null
  const paceOfAging = healthView?.current?.paceOfAging ?? null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={$headerRow}>
        <DateSwitcher
          title={formatTitleFor(selectedDate)}
          onPrevious={goToPreviousDay}
          onNext={goToNextDay}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 100,
          gap: 14,
        }}
      >
        <GlowScoreCard
          title="Health Monitor"
          score={hero.score}
          scoreSubscript={hero.sub}
          verdict={hero.verdict}
          body={hero.body}
          tint={hero.tint}
          onPress={() => router.push("/health-monitor")}
        />

        <VitalsGrid items={vitals} columns={3} />

        <ContributorList title="vs last 7 days" items={contributors7d} />
        <ContributorList title="vs last 30 days" items={contributors30d} />

        {noopAge != null ? (
          <HealthspanCard
            noopAge={noopAge.toFixed(1)}
            chronologicalAge={chronoAge != null ? chronoAge.toFixed(1) : "--"}
            deltaText={
              ageDelta == null || Math.abs(ageDelta) < 0.05
                ? "matching"
                : `${ageDelta > 0 ? "+" : ""}${ageDelta.toFixed(1)} yr`
            }
            deltaDirection={
              ageDelta == null || Math.abs(ageDelta) < 0.05
                ? "even"
                : ageDelta < 0
                  ? "younger"
                  : "older"
            }
            onPress={() => router.push("/healthspan")}
          />
        ) : null}

        {paceOfAging != null ? (
          <TrendCard
            title="Pace of Aging"
            value={`${paceOfAging.toFixed(2)}×`}
            caption={
              paceOfAging < 1
                ? "Below 1.0× — you're aging slower than the chronological clock."
                : paceOfAging > 1
                  ? "Above 1.0× — you're aging faster than the chronological clock."
                  : "Even with the chronological clock."
            }
            points={paceHistoryPoints(healthView)}
            tint={colors.ringRecovery}
            onPress={() => router.push("/healthspan")}
          />
        ) : null}

        <Text
          text="Tap any tile to drill in. Vitals lock against your personal range after 14 nights of strap data."
          style={{
            color: colors.textMuted,
            fontSize: 11,
            paddingHorizontal: 4,
            paddingTop: 4,
          }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function tile(
  key: string,
  label: string,
  value: string,
  desc: string | undefined,
  tint: string,
): VitalsGridItem {
  return { key, label, value, desc, tint }
}

function contributor(
  key: string,
  label: string,
  current: number | null | undefined,
  baseline: number | null,
  unit: string,
  windowDays: number,
) {
  if (current == null || !Number.isFinite(current)) {
    return {
      key,
      label,
      value: "--",
      unit,
      baseline: baseline != null ? `${windowDays}d ${Math.round(baseline)}` : "--",
      deltaText: null,
      direction: "flat" as const,
    }
  }
  if (baseline == null) {
    return {
      key,
      label,
      value: formatNumeric(current),
      unit,
      baseline: "no baseline",
      deltaText: null,
      direction: "flat" as const,
    }
  }
  const diff = current - baseline
  const direction =
    Math.abs(diff) < 0.5 ? ("flat" as const) : diff > 0 ? ("up" as const) : ("down" as const)
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—"
  const magnitude = Math.abs(diff)
  const deltaText =
    direction === "flat" ? `— ${windowDays}d` : `${arrow} ${magnitude.toFixed(magnitude >= 10 ? 0 : 1)}`
  return {
    key,
    label,
    value: formatNumeric(current),
    unit,
    baseline: `${windowDays}d ${formatNumeric(baseline)}`,
    deltaText,
    direction,
  }
}

function toNumeric(value: string | undefined): number | null {
  if (!value || value === "--") return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function formatNumeric(n: number): string {
  if (!Number.isFinite(n)) return "--"
  if (Math.abs(n) >= 100) return `${Math.round(n)}`
  if (Math.abs(n) >= 10) return n.toFixed(1)
  return n.toFixed(1)
}

function formatTitleFor(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return dateKey
  const date = new Date(y, m - 1, d, 12)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (date.getTime() === today.getTime()) return "Today"
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000)
  if (date.getTime() === yesterday.getTime()) return "Yesterday"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}

function paceHistoryPoints(view: HealthViewModel | null): number[] {
  if (!view) return []
  return view.history
    .map((h) => h.paceOfAging)
    .filter((p): p is number => p != null && Number.isFinite(p))
}

const $headerRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "center",
  paddingHorizontal: 16,
  paddingVertical: 8,
}
