import { FC, useCallback } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import {
  CaretLeft,
  Check,
  ClockCountdown,
  Drop,
  Heartbeat,
  Info,
  Icon as PhosphorIcon,
  Warning,
  WarningOctagon,
  WaveSine,
  Wind,
} from "phosphor-react-native"
import { Text } from "@/components/Text"
import { VitalRow } from "@/components/home/VitalRow"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"

export const HealthMonitorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const navigation = useNavigation<any>()
  const { homeView } = useDashboard()

  const health = homeView?.monitors?.health
  const activities = homeView?.activities

  const goBack = useCallback(() => navigation.goBack(), [navigation])

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

  const HeroIcon: PhosphorIcon =
    health?.state === "warn"
      ? Warning
      : health?.state === "alert"
        ? WarningOctagon
        : health?.state === "stale"
          ? ClockCountdown
          : Check

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <CaretLeft size={20} color={colors.text} />
          <Text text="Health Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Info size={20} color={colors.textDim} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
          <View style={[styles.heroTile, { backgroundColor: tone.bg }]}>
            <HeroIcon size={28} color={tone.fg} weight="fill" />
          </View>
          <Text
            text={health?.verdict ?? "--"}
            style={{ color: tone.fg, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: 10 }}
          />
          <Text
            text={`${health?.inRangeCount ?? 0} of ${health?.totalMetrics ?? 4} metrics`}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}
          />
        </View>

        <View style={[styles.list, { backgroundColor: colors.surfaceCard }]}>
          <VitalRow
            icon={WaveSine}
            iconColor={colors.ringHrv}
            label="HRV"
            name="Heart rate variability"
            value={activities?.hrv ?? "--"}
            unit="ms"
            onPress={() => navigation.navigate("HrvDetail" as never)}
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
            value="--"
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
        </View>

        <Text
          text="Each metric is compared to your personal 14-day baseline."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
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
