import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pressable, ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import { useFocusEffect } from "@react-navigation/native"

import { DateSwitcher } from "@/components/DateSwitcher"
import { ComposeButton, type QuickLogAction } from "@/components/home/ComposeButton"
import { DevicePill } from "@/components/home/DevicePill"
import { AuroraBackdrop, type AuroraState } from "@/components/health/AuroraBackdrop"
import {
  type DeltaDirection,
  type VitalRow,
  type VitalStatus,
} from "@/components/health/CollapsibleVitalsCard"
import { HealthMonitorCard } from "@/components/health/HealthMonitorCard"
import { HealthspanCard } from "@/components/health/HealthspanCard"
import { TrendCard } from "@/components/health/TrendCard"
import { ContributorList } from "@/components/health/ContributorList"
import { Info } from "phosphor-react-native"
import { InfoSheet } from "@/components/InfoSheet"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import {
  useBleBatteryLevel,
  useBleConnectionState,
  useBleIsCharging,
} from "@/stores/bleStore"
import { type HealthViewModel } from "@/services/api/noopClient"
import { computeLocalHealthView } from "@/services/health/computeLocalHealthView"
import { openDatabase } from "@/services/db"
import { LOCAL_THEME } from "@/utils/localTheme"
import { usePreference } from "@/utils/usePreferences"
import { buildVitalContributors } from "@/utils/healthVitals"

export const HealthScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const { colors } = LOCAL_THEME
  const { selectedDate, homeView, refreshDashboard, goToPreviousDay, goToNextDay } = useDashboard()
  const batteryLevel = useBleBatteryLevel()
  const isCharging = useBleIsCharging()
  const connectionState = useBleConnectionState()
  const { value: showHealthspan } = usePreference("showHealthspan")

  const [healthView, setHealthView] = useState<HealthViewModel | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const lastFocusRefreshAt = useRef(0)

  const reloadHealthView = useCallback(() => {
    let cancelled = false
    computeLocalHealthView(openDatabase())
      .then((v) => {
        if (!cancelled) setHealthView(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return reloadHealthView()
  }, [reloadHealthView])

  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      if (now - lastFocusRefreshAt.current > 30_000) {
        lastFocusRefreshAt.current = now
        refreshDashboard().catch(() => undefined)
        reloadHealthView()
      }
    }, [refreshDashboard, reloadHealthView]),
  )

  const monitorsHealth = homeView?.monitors?.health
  const activities = homeView?.activities
  const sleepRing = homeView?.rings.sleep
  const stressMonitor = homeView?.monitors?.stress
  const healthVitals = monitorsHealth?.vitals ?? []
  const contributors7 = buildVitalContributors(healthVitals, "avg7d")
  const contributors30 = buildVitalContributors(healthVitals, "avg30d")

  const hero = useMemo(() => {
    const inRange = monitorsHealth?.inRangeCount ?? 0
    const total = monitorsHealth?.totalMetrics ?? 0
    const score = total > 0 ? `${inRange}` : "--"
    const sub = total > 0 ? `/${total}` : undefined
    const verdict =
      monitorsHealth?.verdict ??
      (total === 0 ? "Waiting on tonight's sleep" : "")
    const state: AuroraState = monitorsHealth?.state ?? "stale"
    const tint =
      state === "ok"
        ? colors.statusGreen
        : state === "warn"
          ? colors.statusAmber
          : state === "alert"
            ? colors.statusRed
            : colors.textMuted
    // Body explains the *reason* the score is empty so the user knows
    // whether to act (sleep with the strap on) or just wait (the
    // pipeline runs every 5 min in the background after a sleep window).
    const body =
      total === 0
        ? "Vitals lock in after the first full night of sleep with the strap on. Tonight's recording will populate this card by morning."
        : inRange === total
          ? "Every vital sits inside your personal range today."
          : `${inRange} of ${total} vitals are inside your personal range. Tap to expand and drill in.`
    return { score, sub, verdict, tint, body, state }
  }, [monitorsHealth, colors])

  const vitalRows = useMemo<VitalRow[]>(() => {
    const rhrNum = toNumeric(activities?.restingHr)
    const rhrBaseline = activities?.baselineRhr ?? null
    const hrvNum = activities?.hrvMs ?? null
    const respRate = activities?.respiratoryRate ?? null
    const spo2Num = parsePercent(activities?.spo2)
    const skinTempStr = activities?.skinTemp
    const skinTempDelta = activities?.skinTempDelta
    const skinTempNum = skinTempStr ? parseFloat(skinTempStr) : NaN
    const sleepScore = sleepRing?.numericValue ?? null
    const sleepBaseline = sleepRing?.sevenDayAverage ?? null
    const stressNum = stressMonitor?.score ?? null
    const stressZone = stressMonitor?.zone ?? null

    return [
      makeVital(
        "rhr",
        "Resting HR",
        "bpm",
        rhrNum != null ? `${Math.round(rhrNum)}` : "--",
        rhrNum,
        rhrBaseline,
        rangeAroundBaseline(rhrBaseline, 10),
        deltaArrow(rhrNum, rhrBaseline, 0, true),
        rhrStatus(rhrNum, rhrBaseline),
      ),
      makeVital(
        "hrv",
        "HRV",
        "ms",
        hrvNum != null ? `${Math.round(hrvNum)}` : "--",
        hrvNum,
        null,
        null,
        null,
        hrvNum != null ? "ok" : "stale",
        () => router.push("/hrv-detail"),
      ),
      makeVital(
        "rr",
        "Respiratory",
        "br/min",
        respRate != null ? respRate.toFixed(1) : "--",
        respRate,
        null,
        { min: 10, max: 20 },
        null,
        respStatus(respRate),
      ),
      makeVital(
        "spo2",
        "SpO₂",
        "%",
        spo2Num != null ? spo2Num.toFixed(1) : "--",
        spo2Num,
        null,
        { min: 94, max: 99 },
        null,
        spo2Status(spo2Num),
      ),
      makeVital(
        "skintemp",
        "Skin Temp",
        "°C",
        Number.isFinite(skinTempNum) ? skinTempNum.toFixed(1) : "--",
        Number.isFinite(skinTempNum) ? skinTempNum : null,
        null,
        null,
        skinTempDelta && skinTempDelta !== "--" ? skinTempDeltaCaption(skinTempDelta) : null,
        skinTempStatus(skinTempDelta),
      ),
      makeVital(
        "sleep",
        "Sleep",
        "score",
        sleepScore != null ? `${Math.round(sleepScore)}` : "--",
        sleepScore,
        sleepBaseline,
        sleepBaseline != null ? { label: `7d ${Math.round(sleepBaseline)}` } : null,
        deltaArrow(sleepScore, sleepBaseline, 0),
        sleepStatus(sleepScore, sleepBaseline),
        () => router.push({ pathname: "/sleep-detail", params: { date: selectedDate } }),
      ),
      makeVital(
        "stress",
        "Stress",
        stressZone ? `today · ${stressZone}` : "today",
        stressNum != null ? `${Math.round(stressNum)}` : "--",
        stressNum,
        null,
        null,
        null,
        stressMonitorStatus(stressZone),
        () => router.push("/stress-monitor"),
      ),
    ]
  }, [activities, sleepRing, stressMonitor, selectedDate])

  const noopAge = healthView?.current?.noopAge ?? null
  const chronoAge = healthView?.current?.chronologicalAge ?? null
  const ageDelta = noopAge != null && chronoAge != null ? noopAge - chronoAge : null
  const paceOfAging = healthView?.current?.paceOfAging ?? null

  const handleQuickLog = (action: QuickLogAction) => {
    switch (action) {
      case "activity":
        router.push("/strain-activity")
        break
      case "journal":
        router.push({ pathname: "/journal-entry", params: { date: selectedDate } })
        break
      case "bedtime":
        router.push("/sleep-planner")
        break
      case "session":
        router.push("/strain-activity")
        break
    }
  }

  const batteryLabel = batteryLevel == null ? "—" : `${batteryLevel}%`

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AuroraBackdrop state={hero.state} background={colors.background} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={$topbar}>
          <DateSwitcher
            title={formatTitleFor(selectedDate)}
            onPrevious={goToPreviousDay}
            onNext={goToNextDay}
          />
          <View style={$topRight}>
            <ComposeButton onSelect={handleQuickLog} />
            <Pressable onPress={() => setInfoOpen(true)} hitSlop={10} style={{ padding: 4 }}>
              <Info size={20} color={colors.textDim} />
            </Pressable>
            <DevicePill
              batteryLabel={batteryLabel}
              isCharging={isCharging}
              isConnected={connectionState === "ready"}
              onPress={() => router.push("/device-settings")}
            />
          </View>
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
          <HealthMonitorCard
            score={hero.score}
            scoreSubscript={hero.sub}
            verdict={hero.verdict}
            body={hero.body}
            tint={hero.tint}
            rows={vitalRows}
            defaultExpanded={false}
          />

          {contributors7.length > 0 ? (
            <ContributorList title="vs last 7 days" items={contributors7} />
          ) : null}
          {contributors30.length > 0 ? (
            <ContributorList title="vs last 30 days" items={contributors30} />
          ) : null}

          {noopAge != null && showHealthspan ? (
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

          {paceOfAging != null && showHealthspan ? (
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
            text="Tap the Health Monitor card to expand. Range bars lock against your personal range after 14 nights of strap data."
            style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 4, paddingTop: 4 }}
          />
        </ScrollView>
        <InfoSheet
          visible={infoOpen}
          onClose={() => setInfoOpen(false)}
          title="What is Healthspan?"
          paragraphs={[
            "Healthspan estimates your biological age from your wearable trends — resting heart rate, HRV, sleep quality, respiratory rate and more — against population norms for your chronological age.",
            "Hale Age below your real age means your vitals look younger than the calendar; above means older. Pace of Aging shows whether you're trending faster or slower than the chronological clock (1.0× = on pace).",
            "It needs a couple of weeks of nights to stabilise, and it's a wellness estimate — not a medical assessment.",
          ]}
        />
      </SafeAreaView>
    </View>
  )
}

type Range = { min: number; max: number } | { label: string } | null

function makeVital(
  key: string,
  name: string,
  unit: string,
  value: string,
  current: number | null,
  baseline: number | null,
  range: Range,
  deltaText: string | null,
  status: VitalStatus,
  onPress?: () => void,
): VitalRow {
  const computed = computeRangeFill(current, range)
  const direction: DeltaDirection =
    !deltaText || deltaText.startsWith("—")
      ? "flat"
      : deltaText.startsWith("▲") || deltaText.startsWith("+")
        ? "up"
        : "down"
  return {
    key,
    name,
    unit,
    value,
    status,
    rangeLabel: computed.label,
    rangeFraction: computed.fraction,
    fillStart: computed.fillStart,
    fillEnd: computed.fillEnd,
    deltaText,
    deltaDirection: direction,
    onPress,
  }
}

function computeRangeFill(
  current: number | null,
  range: Range,
): {
  label: string | null
  fraction: number | null
  fillStart: number
  fillEnd: number
} {
  if (!range) return { label: null, fraction: null, fillStart: 0.2, fillEnd: 0.8 }
  if ("label" in range) {
    return { label: range.label, fraction: null, fillStart: 0.2, fillEnd: 0.8 }
  }
  const { min, max } = range
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const span = hi - lo
  const padded = span * 0.4
  const axisLo = lo - padded
  const axisHi = hi + padded
  const axisSpan = axisHi - axisLo
  const fillStart = (lo - axisLo) / axisSpan
  const fillEnd = (hi - axisLo) / axisSpan
  let fraction: number | null = null
  if (current != null && Number.isFinite(current) && axisSpan > 0) {
    fraction = (current - axisLo) / axisSpan
  }
  const label = `${formatRangeNum(lo)} – ${formatRangeNum(hi)}`
  return { label, fraction, fillStart, fillEnd }
}

function formatRangeNum(n: number): string {
  if (Math.abs(n) >= 100) return `${Math.round(n)}`
  if (Math.abs(n) >= 10) return n.toFixed(0)
  return n.toFixed(1)
}

function rangeAroundBaseline(baseline: number | null, halfSpan: number) {
  if (baseline == null) return null
  return { min: baseline - halfSpan, max: baseline + halfSpan }
}

function deltaArrow(
  current: number | null,
  baseline: number | null,
  precision: number = 0,
  invert: boolean = false,
): string | null {
  if (current == null || baseline == null) return null
  const diff = current - baseline
  if (Math.abs(diff) < 0.5) return "— 0"
  const magnitude = Math.abs(diff).toFixed(precision)
  const isPositive = invert ? diff < 0 : diff > 0
  return `${isPositive ? "▲" : "▼"} ${magnitude}`
}

function rhrStatus(current: number | null, baseline: number | null): VitalStatus {
  if (current == null) return "stale"
  if (baseline == null) return "ok"
  const diff = Math.abs(current - baseline)
  if (diff > 12) return "alert"
  if (diff > 6) return "warn"
  return "ok"
}

function respStatus(rate: number | null): VitalStatus {
  if (rate == null) return "stale"
  if (rate < 9 || rate > 22) return "alert"
  if (rate < 10 || rate > 20) return "warn"
  return "ok"
}

function spo2Status(value: number | null): VitalStatus {
  if (value == null) return "stale"
  if (value < 92) return "alert"
  if (value < 95) return "warn"
  return "ok"
}

function skinTempStatus(deltaText: string | undefined): VitalStatus {
  if (!deltaText || deltaText === "--") return "stale"
  const n = parseFloat(deltaText)
  if (!Number.isFinite(n)) return "ok"
  if (Math.abs(n) > 0.5) return "warn"
  return "ok"
}

function skinTempDeltaCaption(raw: string): string {
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return raw
  return `${n > 0 ? "▲" : n < 0 ? "▼" : "—"} ${Math.abs(n).toFixed(2)}`
}

function sleepStatus(score: number | null, baseline: number | null): VitalStatus {
  if (score == null) return "stale"
  if (baseline == null) return "ok"
  if (score < baseline - 15) return "alert"
  if (score < baseline - 5) return "warn"
  return "ok"
}

function stressMonitorStatus(
  zone: "Calm" | "Moderate" | "High" | null | undefined,
): VitalStatus {
  if (zone == null) return "stale"
  if (zone === "High") return "alert"
  if (zone === "Moderate") return "warn"
  return "ok"
}

function toNumeric(value: string | undefined): number | null {
  if (!value || value === "--") return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function parsePercent(value: string | undefined): number | null {
  if (!value || value === "--") return null
  const cleaned = value.replace("%", "")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
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

const $topbar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 16,
  paddingVertical: 8,
  gap: 10,
}

const $topRight: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
}
