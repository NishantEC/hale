import { FC, useRef, useEffect } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  RefreshControl,
  ScrollView,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRoute } from "@react-navigation/native"
import { router } from "expo-router"

import { DateSwitcher } from "@/components/DateSwitcher"
import { HypnogramChart } from "@/components/HypnogramChart"
import { LabsAccordion } from "@/components/LabsAccordion"
import { SleepHero } from "@/components/SleepHero"
import { StagePills } from "@/components/StagePills"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { TrendSparkline } from "@/components/TrendSparkline"
import { VitalCard } from "@/components/VitalCard"
import { WhyPanel } from "@/components/WhyPanel"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

export const SleepDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const route = useRoute<any>()
  const { width } = useWindowDimensions()
  const {
    sleepView, isRefreshing, refreshDashboard, error, clearError, selectedDate, setSelectedDate,
  } = useDashboard()

  const date: string = (route.params?.date as string) ?? selectedDate
  const lastShownError = useRef<string | null>(null)

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  const chartWidth = width - 48

  const formattedDate = (() => {
    const [year, month, day] = date.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
  })()

  if (!sleepView || sleepView.emptyState.isEmpty) {
    return (
      <View style={themed($screenWrap)}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <ScrollView
            contentContainerStyle={themed($container)}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />
            }
          >
          <View style={themed($emptyState)}>
            <Text
              text={sleepView?.emptyState.title ?? "No sleep data"}
              size="lg"
              weight="semiBold"
              style={themed($emptyTitle)}
            />
            <Text
              text={sleepView?.emptyState.subtitle ?? "Sync your strap to load the sleep breakdown."}
              size="xs"
              style={themed($mutedCenter)}
            />
          </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    )
  }

  const onPrevDay = () => {
    const d = new Date(selectedDate + "T12:00:00Z")
    d.setUTCDate(d.getUTCDate() - 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }
  const onNextDay = () => {
    const d = new Date(selectedDate + "T12:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  const formatAlarmTime = (mins: number): string => {
    const h = Math.floor(mins / 60), m = mins % 60
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = h % 12 || 12
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`
  }
  const alarmLabel = sleepView.planner.alarmEnabled
    ? formatAlarmTime(sleepView.planner.alarmMinutes)
    : "Set alarm"
  const onPressAlarm = () => router.push("/sleep-planner" as any)

  const durationMinutes = (() => {
    const s = sleepView.header.duration
    const m = /(?:(\d+)h)?\s*(?:(\d+)m)?/.exec(s)
    if (!m) return sleepView.epochTimeline.length
    const val = (Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0)
    return val || sleepView.epochTimeline.length
  })()

  const totalMin = sleepView.epochTimeline.length || durationMinutes
  const stageMin = (id: string): number => {
    const row = sleepView.stageRows.find((r) => r.id === id)
    return row ? Math.round(row.barFraction * totalMin) : 0
  }
  const awakeMin = stageMin("awake")
  const remMin = stageMin("rem")
  const coreMin = stageMin("core") || stageMin("light")
  const deepMin = stageMin("deep")

  const lookupMetric = (label: string): string => {
    const m = sleepView.metrics.find((x) => x.label === label)
    return m?.value ?? "--"
  }

  const skinTempDeltaValue = (() => {
    const raw = sleepView.vitalsDelta?.skinTempDelta
    if (raw == null || !Number.isFinite(raw)) return "--"
    return `${raw > 0 ? "+" : ""}${raw}°C`
  })()

  const toDate = (ts: string) => ts.slice(0, 10)
  const durationTrendPoints = (sleepView.durationTrend.samples ?? []).map((p) => ({
    date: toDate(p.timestamp),
    value: p.value,
  }))
  const scoreTrendPoints = (sleepView.sleepScoreTrend ?? []).map((p) => ({
    date: toDate(p.timestamp),
    value: p.value,
  }))

  const hasJournalEntries = (sleepView.factorInsights ?? []).length > 0

  const labsRows: Array<{ label: string; value: string }> = [
    { label: "Blood Oxygen", value: lookupMetric("Blood Oxygen") },
    { label: "SpO2 Dips", value: lookupMetric("SpO2 Dips") },
    { label: "Respiratory Rate", value: lookupMetric("Respiratory Rate") },
    { label: "Sleep Consistency", value: lookupMetric("Consistency") },
  ]

  return (
    <View style={themed($screenWrap)}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={themed($container)}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refreshDashboard} tintColor={colors.tint} />
          }
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <DateSwitcher
              title={formattedDate}
              onPrevious={onPrevDay}
              onNext={onNextDay}
            />
            <TouchableOpacity onPress={onPressAlarm} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="alarm-outline" size={18} color={colors.text} />
              <Text text={alarmLabel} size="xs" style={{ color: colors.text }} />
            </TouchableOpacity>
          </View>

          <SleepHero
            durationMinutes={durationMinutes}
            bedtimeLabel={sleepView?.header.bedtime}
            wakeTimeLabel={sleepView?.header.wakeTime}
            score={sleepView?.score?.value ?? null}
            scoreLabel={sleepView?.score?.label ?? "Unknown"}
            scoreConfidence={sleepView?.score?.confidence ?? "Low"}
            scoreDelta={sleepView?.score?.deltaVsWeek ?? null}
            detail={sleepView?.score?.detail ?? ""}
          />

          {sleepView?.epochTimeline.length ? (
            <HypnogramChart
              epochs={sleepView.epochTimeline}
              width={chartWidth}
              bedtimeLabel={sleepView.header.bedtime}
              wakeTimeLabel={sleepView.header.wakeTime}
            />
          ) : null}

          <StagePills
            awakeMin={awakeMin}
            remMin={remMin}
            coreMin={coreMin}
            deepMin={deepMin}
          />

          <WhyPanel
            factors={sleepView?.factorInsights ?? []}
            hasJournal={hasJournalEntries}
            fallbackInsight={null}
            onPressLogJournal={() => router.push("/journal-entry" as any)}
            onPressFactor={(tag) => router.push(`/journal-history?factor=${encodeURIComponent(tag)}` as any)}
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 22 }}>
            <VitalCard
              label="Efficiency"
              value={lookupMetric("Efficiency")}
              delta={sleepView?.vitalsDelta?.efficiency ?? null}
              deltaUnit="%"
            />
            <VitalCard
              label="Resting HR"
              value={lookupMetric("Resting HR")}
              delta={sleepView?.vitalsDelta?.rhr ?? null}
              deltaUnit="bpm"
              deltaPositiveIsGood={false}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <VitalCard
              label="HRV (RMSSD)"
              value={lookupMetric("HRV (RMSSD)")}
              delta={sleepView?.vitalsDelta?.hrv ?? null}
              deltaUnit="ms"
            />
            <VitalCard
              label="Skin Temp Δ"
              value={skinTempDeltaValue}
              delta={sleepView?.vitalsDelta?.skinTempDelta ?? null}
              deltaUnit="°C"
            />
          </View>

          <View style={{ marginTop: 22, padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
            <TrendSparkline
              label="Duration · 7-night"
              points={durationTrendPoints}
              currentDate={selectedDate}
              color="#3FB1E7"
              onPressPoint={(d) => setSelectedDate(d)}
            />
            <View style={{ height: 12 }} />
            <TrendSparkline
              label="Score · 7-night"
              points={scoreTrendPoints}
              currentDate={selectedDate}
              color="#ffa42b"
              onPressPoint={(d) => setSelectedDate(d)}
            />
          </View>

          <LabsAccordion rows={labsRows} />
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 60,
  paddingHorizontal: 24,
  paddingTop: 12,
})

const $navSide: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 36,
  justifyContent: "center",
  width: 36,
})

const $emptyState: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 10,
  justifyContent: "center",
  paddingTop: 80,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $mutedCenter: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  textAlign: "center",
})
