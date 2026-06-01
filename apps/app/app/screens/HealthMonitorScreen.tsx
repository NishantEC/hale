import { FC, useCallback, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"

import { CaretLeft, Drop, Heartbeat, Info, Thermometer, WaveSine, Wind } from "phosphor-react-native"
import { Text } from "@/components/Text"
import { VitalRow } from "@/components/home/VitalRow"
import { GlowScoreCard } from "@/components/health/GlowScoreCard"
import { ContributorList } from "@/components/health/ContributorList"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"
import { InfoSheet } from "@/components/InfoSheet"
import { buildVitalContributors } from "@/utils/healthVitals"

export const HealthMonitorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const { homeView } = useDashboard()

  const health = homeView?.monitors?.health
  const activities = homeView?.activities
  const [infoOpen, setInfoOpen] = useState(false)

  const goBack = useCallback(() => router.back(), [])

  const tone = {
    fg: colors.statusGreen,
    bg: "rgba(30,215,96,0.18)",
  }
  if (health?.state === "warn") {
    tone.fg = colors.statusAmber
    tone.bg = "rgba(255,164,43,0.18)"
  } else if (health?.state === "alert") {
    tone.fg = colors.statusRed
    tone.bg = "rgba(243,114,127,0.18)"
  } else if (health?.state === "stale") {
    tone.fg = colors.statusStale
    tone.bg = "rgba(102,102,102,0.18)"
  }

  const vitals = health?.vitals ?? []
  const baselineReady = health?.baselineReady ?? false
  const heroBody = !health
    ? "Connect the strap to populate your vitals."
    : !baselineReady
      ? "Calibrating — HRV and resting-HR ranges lock in after about five nights of sleep tracking."
      : (health.totalMetrics ?? 0) === 0
        ? "No readings yet today. Wear the strap to populate your vitals."
        : `${health.inRangeCount} of ${health.totalMetrics} vitals are inside your typical range.`
  const contributors7 = buildVitalContributors(vitals, "avg7d")
  const contributors30 = buildVitalContributors(vitals, "avg30d")

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <CaretLeft size={20} color={colors.text} />
          <Text text="Health Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setInfoOpen(true)} hitSlop={12}>
          <Info size={20} color={colors.textDim} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <GlowScoreCard
          title="Health Monitor"
          score={`${health?.inRangeCount ?? 0}`}
          scoreSubscript={`of ${health?.totalMetrics ?? 5}`}
          verdict={health?.verdict ?? "No data yet"}
          body={heroBody}
          tint={tone.fg}
        />

        <View style={[styles.list, { backgroundColor: colors.surfaceCard }]}>
          <VitalRow
            icon={WaveSine}
            iconColor={colors.ringHrv}
            label="HRV"
            name="Heart rate variability"
            value={activities?.hrv ?? "--"}
            unit="ms"
            onPress={() => router.push("/hrv-detail")}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            icon={Heartbeat}
            iconColor={colors.ringStrain}
            label="RHR"
            name="Resting heart rate"
            value={activities?.restingHr ?? "--"}
            unit="bpm"
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            icon={Wind}
            iconColor={colors.ringSleep}
            label="RR"
            name="Respiratory rate"
            value={activities?.respiratoryRate != null ? activities.respiratoryRate.toFixed(1) : "--"}
            unit="/min"
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            icon={Drop}
            iconColor={colors.ringRecovery}
            label="SpO₂"
            name="Blood oxygen"
            value={(activities?.spo2 ?? "--").replace("%", "")}
            unit="%"
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <VitalRow
            icon={Thermometer}
            iconColor={colors.statusAmber}
            label="Skin Temp"
            name="Skin temperature (Δ vs baseline)"
            value={activities?.skinTempDelta ? activities.skinTempDelta.replace("C", "") : "--"}
            unit="°C"
          />
        </View>
        {contributors7.length > 0 ? (
          <ContributorList title="vs last 7 days" items={contributors7} />
        ) : null}
        {contributors30.length > 0 ? (
          <ContributorList title="vs last 30 days" items={contributors30} />
        ) : null}

        <Text
          text="Vitals compare against your personal baseline once it warms up. Respiratory rate and blood oxygen use standard clinical ranges."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
      <InfoSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How the Health Monitor works"
        paragraphs={[
          "Each vital is compared to your personal baseline — HRV and resting heart rate — or to a normal clinical range: respiratory rate 10–20 /min and blood oxygen at or above 95%.",
          "The count shows how many vitals sit inside range today. Your HRV and resting-HR ranges lock in after about five nights of strap data.",
          "This is a wellness signal, not a medical diagnosis.",
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 } as ViewStyle,
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as ViewStyle,
  navBack: { flexDirection: "row", alignItems: "center", gap: 4 } as ViewStyle,
  hero: {
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  } as ViewStyle,
  heroTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  list: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 2,
  } as ViewStyle,
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 42 } as ViewStyle,
})
