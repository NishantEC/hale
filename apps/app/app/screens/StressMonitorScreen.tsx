import { FC, useCallback, useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import { CaretLeft, Info } from "phosphor-react-native"
import { Text } from "@/components/Text"
import { StressColorStrip } from "@/components/home/StressColorStrip"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"
import { scoreToZone } from "@/utils/stressZone"

function fmtMins(mins: number): string {
  if (mins <= 0) return "0m"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export const StressMonitorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const navigation = useNavigation<any>()
  const { homeView } = useDashboard()

  const stress = homeView?.monitors?.stress
  const score = stress?.score ?? null
  const zone = stress?.zone ?? scoreToZone(score)

  const goBack = useCallback(() => navigation.goBack(), [navigation])

  const tone = useMemo(() => {
    if (zone === "Moderate") return { fg: colors.statusAmber, bg: "rgba(255,164,43,0.18)" }
    if (zone === "High") return { fg: colors.statusRed, bg: "rgba(243,114,127,0.18)" }
    if (zone === "Calm") return { fg: colors.ringHrv, bg: "rgba(83,157,245,0.18)" }
    return { fg: colors.statusStale, bg: "rgba(102,102,102,0.18)" }
  }, [zone, colors])

  const cellsForStrip = stress?.todayStrip ?? new Array(24).fill(null)
  const nowPercent = computeNowPercent()

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <CaretLeft size={20} color={colors.text} />
          <Text text="Stress Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Info size={20} color={colors.textDim} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
          <View style={styles.heroNumRow}>
            <Text
              text={score == null ? "--" : `${Math.round(score)}`}
              style={{
                color: tone.fg,
                fontSize: 64,
                fontWeight: "800",
                letterSpacing: -3,
                lineHeight: 64,
                fontVariant: ["tabular-nums"],
              }}
            />
            <Text
              text="/ 100"
              style={{ color: colors.textMuted, fontSize: 18, fontWeight: "600", marginLeft: 6, marginBottom: 4 }}
            />
          </View>
          <Text
            text={(zone ?? "Stale").toUpperCase()}
            style={{
              color: tone.fg,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 1.6,
              marginTop: 6,
            }}
          />
          <Text
            text={
              stress?.lastReadingAt
                ? `last reading ${new Date(stress.lastReadingAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "no recent reading"
            }
            style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}
          />
        </View>

        <View>
          <Text
            text="TODAY · 24H"
            style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginLeft: 4, marginBottom: 8 }}
          />
          <View style={[styles.stripCard, { backgroundColor: colors.surfaceCard }]}>
            <StressColorStrip
              cells={cellsForStrip}
              nowPercent={nowPercent}
              axisLabels={["12 AM", "6 AM", "12 PM", "6 PM", "11 PM"]}
              height={22}
            />
          </View>
        </View>

        <View>
          <Text
            text="TIME IN ZONE"
            style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginLeft: 4, marginBottom: 8 }}
          />
          <View style={[styles.zoneCard, { backgroundColor: colors.surfaceCard }]}>
            <ZoneRow color={colors.ringHrv} name="Calm" range="0 – 34" mins={stress?.timeInZone.calm ?? 0} />
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <ZoneRow color={colors.statusAmber} name="Moderate" range="35 – 64" mins={stress?.timeInZone.moderate ?? 0} />
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <ZoneRow color={colors.statusRed} name="High" range="65 – 100" mins={stress?.timeInZone.high ?? 0} />
          </View>
        </View>

        <Text
          text="Based on HRV + heart rate against your 14-day baseline."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function computeNowPercent(): number {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return (minutes / (24 * 60)) * 100
}

type ZoneRowProps = { color: string; name: string; range: string; mins: number }
const ZoneRow: FC<ZoneRowProps> = ({ color, name, range, mins }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={styles.zoneRow}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text
        text={name}
        style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}
      />
      <Text
        text={range}
        style={{ color: colors.textMuted, fontSize: 11, marginRight: 12 }}
      />
      <Text
        text={fmtMins(mins)}
        style={{ color: colors.textDim, fontSize: 12, fontVariant: ["tabular-nums"] }}
      />
    </View>
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
    padding: 22,
    alignItems: "center",
  } as ViewStyle,
  heroNumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  } as ViewStyle,
  stripCard: {
    borderRadius: 14,
    padding: 14,
  } as ViewStyle,
  zoneCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
  } as ViewStyle,
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  } as ViewStyle,
  zoneDot: { width: 10, height: 10, borderRadius: 5 } as ViewStyle,
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 24 } as ViewStyle,
})
