import { FC, useCallback, useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import { CaretLeft, Info } from "phosphor-react-native"
import { Text } from "@/components/Text"
import { StressColorStrip } from "@/components/home/StressColorStrip"
import { useDashboard } from "@/context/DashboardContext"
import { LOCAL_THEME } from "@/utils/localTheme"
import { scoreToZone } from "@/utils/stressZone"
import { InfoSheet } from "@/components/InfoSheet"
import { HalfArcGauge } from "@/components/HalfArcGauge"
import { ContributorList, type ContributorItem } from "@/components/health/ContributorList"

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
  const [infoOpen, setInfoOpen] = useState(false)

  const tone = useMemo(() => {
    if (zone === "Moderate") return { fg: colors.statusAmber, bg: "rgba(255,164,43,0.18)" }
    if (zone === "High") return { fg: colors.statusRed, bg: "rgba(243,114,127,0.18)" }
    if (zone === "Calm") return { fg: colors.ringHrv, bg: "rgba(83,157,245,0.18)" }
    return { fg: colors.statusStale, bg: "rgba(102,102,102,0.18)" }
  }, [zone, colors])

  const cellsForStrip = stress?.todayStrip ?? new Array(24).fill(null)
  const nowPercent = computeNowPercent()

  const stripValues = (stress?.todayStrip ?? []).filter((c): c is number => c != null)
  const peak = stripValues.length ? Math.max(...stripValues) : null
  const trend = (homeView?.stressTrend ?? [])
    .map((p) => p.value)
    .filter((v): v is number => v != null)
    .slice(-7)
  const avg7d = trend.length ? trend.reduce((a, b) => a + b, 0) / trend.length : null
  const avgDelta = score != null && avg7d != null ? score - avg7d : null
  const contributors: ContributorItem[] = [
    {
      key: "avg",
      label: "Today avg",
      value: score != null ? `${Math.round(score)}` : "--",
      baseline: avg7d != null ? `${Math.round(avg7d)}` : "—",
      deltaText: avgDelta != null ? `${avgDelta >= 0 ? "+" : ""}${Math.round(avgDelta)}` : null,
      direction: avgDelta == null || Math.abs(avgDelta) < 1 ? "flat" : avgDelta < 0 ? "up" : "down",
    },
    {
      key: "peak",
      label: "Today peak",
      value: peak != null ? `${Math.round(peak)}` : "--",
      baseline: "—",
      deltaText: null,
      direction: "flat",
    },
    {
      key: "recovery",
      label: "Recovery",
      value: homeView?.rings.recovery.value ?? "--",
      unit: "%",
      baseline: "—",
      deltaText: null,
      direction: "flat",
    },
    {
      key: "sleep",
      label: "Sleep score",
      value: homeView?.rings.sleep.value ?? "--",
      baseline: "—",
      deltaText: null,
      direction: "flat",
    },
  ]

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenBackground }]} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.navBack}>
          <CaretLeft size={20} color={colors.text} />
          <Text text="Stress Monitor" style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setInfoOpen(true)} hitSlop={12}>
          <Info size={20} color={colors.textDim} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
          <HalfArcGauge
            value={score}
            tint={tone.fg}
            bands={[
              { from: 0, to: 35, color: colors.ringHrv },
              { from: 35, to: 65, color: colors.statusAmber },
              { from: 65, to: 100, color: colors.statusRed },
            ]}
          />
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
        <ContributorList title="today" items={contributors} />

        <Text
          text="Based on HRV + heart rate against your 14-day baseline."
          style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", paddingHorizontal: 24 }}
        />
      </ScrollView>
      <InfoSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How stress is measured"
        paragraphs={[
          "Your stress score (0–100) estimates autonomic load from heart rate relative to your resting and maximum heart rate during waking hours.",
          "A higher heart rate for your personal range pushes the score up. Time-in-zone tallies the minutes you spent Calm (0–34), Moderate (35–64), or High (65–100) today.",
          "Sleep is excluded so overnight recovery doesn't dilute your daytime reading.",
        ]}
      />
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
