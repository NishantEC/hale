import { FC, useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { SymbolView } from "expo-symbols"
import Svg, { Line, Path } from "react-native-svg"

import { ClassPickerSheet, visualForType } from "@/components/activity"
import { Text } from "@/components/Text"
import {
  confirmActivity,
  deleteActivity,
  dismissActivity,
  fetchActivityBout,
  type ActivityBoutDetail,
} from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

function fmtRange(start: Date, end: Date): string {
  const t = (d: Date) => {
    const h = d.getHours(),
      m = d.getMinutes()
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
  }
  return `${t(start)} → ${t(end)}`
}

export const BoutDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { id } = useLocalSearchParams<{ id: string }>()
  const [bout, setBout] = useState<ActivityBoutDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (typeof id !== "string") return
    fetchActivityBout(id)
      .then(setBout)
      .catch(() => setBout(null))
  }, [id])

  if (!bout) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
        <TopBar />
        <View style={{ padding: 24 }}>
          <Text text="Loading…" style={{ color: colors.textDim }} />
        </View>
      </SafeAreaView>
    )
  }

  const v = visualForType(bout.activityType)
  const isCandidate = bout.source === "candidate"
  const startD = new Date(bout.startTime)
  const endD = new Date(bout.endTime)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {isCandidate ? (
          <CandidateBanner
            conf={bout.confidence}
            onConfirm={async () => {
              await confirmActivity(bout.id, bout.activityType)
              router.back()
            }}
          />
        ) : null}

        <View
          style={[
            styles.hero,
            { borderColor: v.tintHex, backgroundColor: v.backgroundHex },
          ]}
        >
          <View style={[styles.heroIcon, { backgroundColor: v.tintHex + "55" }]}>
            <SymbolView name={v.sfSymbol as never} size={22} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
          </View>
          <Text
            text={isCandidate ? `Possible ${bout.activityType}` : bout.activityType}
            style={{ color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 }}
          />
          <Text
            text={fmtRange(startD, endD)}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 12 }}>
            <Text
              text={bout.strainScore.toFixed(1)}
              style={{
                color: v.tintHex,
                fontSize: 38,
                fontWeight: "800",
                lineHeight: 38,
                fontVariant: ["tabular-nums"],
              }}
            />
            <Text
              text={isCandidate ? "est. strain (not counted)" : "/ 21 strain"}
              style={{ color: colors.textDim, fontSize: 12, fontWeight: "600" }}
            />
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat label="Duration" value={Math.round(bout.durationMinutes).toString()} unit="min" />
          <Stat label="HR avg" value={Math.round(bout.heartRateAvg).toString()} unit="bpm" />
          <Stat label="HR max" value={Math.round(bout.heartRateMax).toString()} unit="bpm" />
        </View>

        <Section title="Heart rate" meta="over the bout">
          <HrChart samples={bout.hrCurve} tint={v.tintHex} />
        </Section>

        <Section title="HR zones" meta="% of bout">
          <ZoneBar zones={bout.zonePercents} />
          <ZoneLegend minutesPerZone={bout.zoneMinutes} />
        </Section>

        {bout.motionIntensity && bout.motionIntensity.length > 0 ? (
          <Section title="Motion intensity" meta="|Δgravity|">
            <MotionBars samples={bout.motionIntensity} tint={v.tintHex} />
          </Section>
        ) : null}

        <View style={[styles.reclass, { backgroundColor: colors.surfaceCard }]}>
          <Text
            text={isCandidate ? "Not what you did?" : "Wrong class?"}
            style={{ flex: 1, color: colors.textDim, fontSize: 13 }}
          />
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={[styles.chip, { backgroundColor: v.backgroundHex }]}
          >
            <View style={[styles.chipIcon, { backgroundColor: v.tintHex + "44" }]}>
              <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
            </View>
            <Text
              text={isCandidate ? "Pick a class" : bout.activityType}
              style={{ color: v.tintHex, fontSize: 12, fontWeight: "700" }}
            />
            <Text text="▾" style={{ color: v.tintHex, fontSize: 9, opacity: 0.7 }} />
          </Pressable>
        </View>

        <Pressable
          onPress={async () => {
            if (isCandidate) {
              await dismissActivity(bout.id)
            } else {
              await deleteActivity(bout.id)
            }
            router.back()
          }}
          style={[styles.destruct, { backgroundColor: colors.surfaceCard }]}
        >
          <Text
            text={isCandidate ? "Dismiss" : "Delete bout"}
            style={{
              color: isCandidate ? colors.textDim : "#ff8a8a",
              fontSize: 13,
              fontWeight: "700",
              textAlign: "center",
            }}
          />
        </Pressable>
      </ScrollView>

      <ClassPickerSheet
        visible={sheetOpen}
        currentType={bout.activityType}
        onCancel={() => setSheetOpen(false)}
        onPick={async (t) => {
          setSheetOpen(false)
          await confirmActivity(bout.id, t)
          router.back()
        }}
      />
    </SafeAreaView>
  )
}

const TopBar: FC = () => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.topbar}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text text="← Strain" style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} />
      </Pressable>
      <View />
    </View>
  )
}

const CandidateBanner: FC<{ conf: number; onConfirm: () => Promise<void> }> = ({ conf, onConfirm }) => {
  const candidate = visualForType("Candidate")
  return (
    <View style={[styles.banner, { backgroundColor: candidate.backgroundHex, borderColor: candidate.tintHex }]}>
      <View style={[styles.bannerIcon, { backgroundColor: candidate.tintHex + "44" }]}>
        <SymbolView name="questionmark" size={11} tintColor={candidate.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          text={`Possible activity · ${Math.round(conf * 100)}% sure`}
          style={{ color: "#c8c7f6", fontSize: 12, fontWeight: "700" }}
        />
        <Text
          text="Confirm to count toward your strain"
          style={{ color: "#9492f5", fontSize: 11, marginTop: 1 }}
        />
      </View>
      <Pressable
        onPress={onConfirm}
        style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: candidate.tintHex, borderRadius: 8 }}
      >
        <Text text="Confirm" style={{ color: "#fff", fontSize: 11, fontWeight: "800" }} />
      </Pressable>
    </View>
  )
}

const Stat: FC<{ label: string; value: string; unit: string }> = ({ label, value, unit }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text={label.toUpperCase()}
        style={{ color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}
      />
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
        <Text
          text={value}
          style={{ color: colors.text, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={unit}
          style={{ color: colors.textDim, fontSize: 11, fontWeight: "600", marginLeft: 2 }}
        />
      </View>
    </View>
  )
}

const Section: FC<{ title: string; meta?: string; children: React.ReactNode }> = ({ title, meta, children }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={[styles.section, { backgroundColor: colors.surfaceCard }]}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <Text
          text={title.toUpperCase()}
          style={{ color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}
        />
        {meta ? (
          <Text text={meta} style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }} />
        ) : null}
      </View>
      {children}
    </View>
  )
}

const HrChart: FC<{ samples: { t: number; hr: number }[]; tint: string }> = ({ samples, tint }) => {
  if (samples.length < 2) return null
  const W = 280,
    H = 110
  const minHr = Math.min(...samples.map((s) => s.hr)) - 4
  const maxHr = Math.max(...samples.map((s) => s.hr)) + 4
  const tMin = samples[0].t,
    tMax = samples[samples.length - 1].t
  const x = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * W
  const y = (hr: number) => H - ((hr - minHr) / Math.max(1, maxHr - minHr)) * H
  const d = samples.map((s, i) => `${i === 0 ? "M" : "L"} ${x(s.t).toFixed(1)} ${y(s.hr).toFixed(1)}`).join(" ")
  return (
    <View style={{ height: 110 }}>
      <Svg width="100%" height="110" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={0} y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.5} x2={W} y2={H * 0.5} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#ffffff10" />
        <Path d={d} stroke={tint} strokeWidth={1.8} fill="none" />
      </Svg>
    </View>
  )
}

const ZONE_COLORS = ["#4ade80", "#fbbf24", "#ffa42b", "#f87171", "#be123c"]
const ZoneBar: FC<{ zones: number[] }> = ({ zones }) => {
  const total = zones.reduce((s, v) => s + v, 0) || 1
  return (
    <View
      style={{
        flexDirection: "row",
        height: 14,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: "#ffffff08",
      }}
    >
      {zones.map((z, i) => (
        <View key={i} style={{ flex: z / total, backgroundColor: ZONE_COLORS[i] }} />
      ))}
    </View>
  )
}

const ZoneLegend: FC<{ minutesPerZone: number[] }> = ({ minutesPerZone }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={{ flexDirection: "row", marginTop: 8 }}>
      {minutesPerZone.map((m, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Text text={`Z${i + 1}`} style={{ color: colors.text, fontSize: 10, fontWeight: "700" }} />
          <Text
            text={`${Math.round(m)}m`}
            style={{ color: colors.textDim, fontSize: 10, fontVariant: ["tabular-nums"] }}
          />
        </View>
      ))}
    </View>
  )
}

const MotionBars: FC<{ samples: number[]; tint: string }> = ({ samples, tint }) => {
  const W = 280,
    H = 60
  const max = Math.max(...samples, 0.01)
  const barW = W / samples.length
  return (
    <View style={{ height: 60 }}>
      <Svg width="100%" height="60" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {samples.map((v, i) => {
          const h = (v / max) * H
          return (
            <Path
              key={i}
              d={`M ${(i * barW).toFixed(1)} ${H} v ${-h.toFixed(1)} h ${(barW * 0.7).toFixed(1)} v ${h.toFixed(1)} Z`}
              fill={tint}
              opacity={0.25 + (v / max) * 0.75}
            />
          )
        })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  topbar: {
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  } as ViewStyle,
  banner: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
  } as ViewStyle,
  bannerIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  hero: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderRadius: 16,
  } as ViewStyle,
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  statRow: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 14 },
  stat: { flex: 1, padding: 12, borderRadius: 12 } as ViewStyle,
  section: { marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 14 } as ViewStyle,
  reclass: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as ViewStyle,
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
  } as ViewStyle,
  chipIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  destruct: { marginHorizontal: 16, marginTop: 0, padding: 14, borderRadius: 14 } as ViewStyle,
})

export default BoutDetailScreen
