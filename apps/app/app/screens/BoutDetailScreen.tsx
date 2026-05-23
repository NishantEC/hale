import { FC, useEffect, useMemo, useState } from "react"
import { Pressable, ScrollView, Share, StyleSheet, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { SymbolView } from "expo-symbols"
import Svg, { Defs, LinearGradient, Line, Path, Stop } from "react-native-svg"

import { ClassPickerSheet, visualForType } from "@/components/activity"
import { Text } from "@/components/Text"
import { useDashboard } from "@/context/DashboardContext"
import {
  confirmActivity,
  deleteActivity,
  dismissActivity,
  fetchActivityBout,
  type ActivityBoutDetail,
} from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

function fmtRange(start: Date, end: Date): string {
  return `${fmtTime(start)} → ${fmtTime(end)}`
}

function fmtTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d)
}

function strainBand(strain: number): { label: string; tint: string } {
  if (strain >= 18) return { label: "All-out", tint: "#ef4444" }
  if (strain >= 14) return { label: "Strenuous", tint: "#ffa42b" }
  if (strain >= 10) return { label: "Moderate", tint: "#fbbf24" }
  if (strain >= 6) return { label: "Light", tint: "#4ade80" }
  return { label: "Minimal", tint: "#9CA3AF" }
}

export const BoutDetailScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { id } = useLocalSearchParams<{ id: string }>()
  const [bout, setBout] = useState<ActivityBoutDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showMotion, setShowMotion] = useState(false)
  const { homeView } = useDashboard()

  useEffect(() => {
    if (typeof id !== "string") return
    fetchActivityBout(id)
      .then(setBout)
      .catch(() => setBout(null))
  }, [id])

  // CRITICAL: compute peakIdx BEFORE the null-guard return below. Putting
  // the useMemo after `if (!bout) return …` violates the Rules of Hooks —
  // when the fetch resolves and `bout` flips from null to non-null, the
  // hook count changes on the next render and React throws "Rendered more
  // hooks than during the previous render." Hooks must always run on every
  // render in the same order.
  const peakIdx = useMemo(() => {
    if (!bout || bout.hrCurve.length === 0) return 0
    let best = 0
    for (let i = 1; i < bout.hrCurve.length; i++) {
      if (bout.hrCurve[i].hr > bout.hrCurve[best].hr) best = i
    }
    return best
  }, [bout])

  if (!bout) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
        <TopBar onShare={null} />
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
  const peakSample = bout.hrCurve[peakIdx]

  const dayStrainNum = parseFloat(homeView?.rings.strain.value ?? "")
  const dayStrainValid = Number.isFinite(dayStrainNum) && dayStrainNum > 0
  const shareOfDay = dayStrainValid
    ? Math.min(100, Math.round((bout.strainScore / dayStrainNum) * 100))
    : null
  const boutBand = strainBand(bout.strainScore)

  const onShare = isCandidate
    ? null
    : async () => {
        const day = fmtDay(startD)
        const summary =
          `${bout.activityType} · ${day} · ${fmtTime(startD)}\n` +
          `Strain ${bout.strainScore.toFixed(1)} of 21 · ${Math.round(bout.durationMinutes)} min · HR ${Math.round(
            bout.heartRateAvg,
          )} avg / ${Math.round(bout.heartRateMax)} max`
        await Share.share({ message: summary }).catch(() => {})
      }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }}>
      <TopBar onShare={onShare} />
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

        <Hero
          activityType={bout.activityType}
          isCandidate={isCandidate}
          startD={startD}
          endD={endD}
          strain={bout.strainScore}
          band={boutBand}
          tint={v.tintHex}
          backgroundHex={v.backgroundHex}
          sfSymbol={v.sfSymbol}
          durationMin={bout.durationMinutes}
          hrAvg={bout.heartRateAvg}
          hrMax={bout.heartRateMax}
        />

        {!isCandidate ? (
          <ImpactCard
            boutStrain={bout.strainScore}
            dayStrain={dayStrainValid ? dayStrainNum : null}
            shareOfDayPct={shareOfDay}
            band={boutBand}
          />
        ) : null}

        <HrCard samples={bout.hrCurve} tint={v.tintHex} peakBpm={peakSample?.hr ?? bout.heartRateMax} peakAt={peakSample ? new Date(peakSample.t) : null} />

        <ZoneStack zones={bout.zonePercents} minutes={bout.zoneMinutes} />

        {bout.motionIntensity && bout.motionIntensity.length > 0 ? (
          <Pressable onPress={() => setShowMotion((s) => !s)} style={{ marginHorizontal: 16, marginBottom: 14 }}>
            <View style={[styles.disclosureHead, { backgroundColor: colors.surfaceCard }]}>
              <Text
                text={`SIGNAL DETAIL${showMotion ? " — TAP TO HIDE" : " — TAP TO SHOW"}`}
                style={{ color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}
              />
              <Text text={showMotion ? "▴" : "▾"} style={{ color: colors.textDim, fontSize: 11 }} />
            </View>
            {showMotion ? (
              <View style={[styles.disclosureBody, { backgroundColor: colors.surfaceCard }]}>
                <Text
                  text="Motion intensity · |Δgravity|"
                  style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 }}
                />
                <MotionBars samples={bout.motionIntensity} tint={v.tintHex} />
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={[styles.actionSecondary, { backgroundColor: colors.surfaceCard }]}
          >
            <SymbolView name={v.sfSymbol as never} size={14} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
            <Text
              text={isCandidate ? "Pick a class" : "Reclassify"}
              style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginLeft: 6 }}
            />
          </Pressable>
          {onShare ? (
            <Pressable onPress={onShare} style={[styles.actionPrimary, { backgroundColor: colors.text }]}>
              <SymbolView name="square.and.arrow.up" size={14} tintColor={colors.background} resizeMode="scaleAspectFit" />
              <Text text="Share" style={{ color: colors.background, fontSize: 13, fontWeight: "800", marginLeft: 6 }} />
            </Pressable>
          ) : null}
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
          style={styles.destructLink}
        >
          <Text
            text={isCandidate ? "Dismiss" : "Delete bout"}
            style={{
              color: isCandidate ? colors.textDim : "#ff8a8a",
              fontSize: 12,
              fontWeight: "600",
              textAlign: "center",
              textDecorationLine: "underline",
              opacity: 0.7,
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

const TopBar: FC<{ onShare: (() => void) | null }> = ({ onShare }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.topbar}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text text="← Strain" style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} />
      </Pressable>
      {onShare ? (
        <Pressable onPress={onShare} hitSlop={10} style={{ padding: 4 }}>
          <SymbolView name="square.and.arrow.up" size={18} tintColor={colors.text} resizeMode="scaleAspectFit" />
        </Pressable>
      ) : (
        <View />
      )}
    </View>
  )
}

// ───────────────── Hero ─────────────────

const Hero: FC<{
  activityType: string
  isCandidate: boolean
  startD: Date
  endD: Date
  strain: number
  band: { label: string; tint: string }
  tint: string
  backgroundHex: string
  sfSymbol: string
  durationMin: number
  hrAvg: number
  hrMax: number
}> = ({
  activityType,
  isCandidate,
  startD,
  endD,
  strain,
  band,
  tint,
  backgroundHex,
  sfSymbol,
  durationMin,
  hrAvg,
  hrMax,
}) => {
  const colors = LOCAL_THEME.colors
  const dayLine = `${fmtDay(startD).toUpperCase()} · ${fmtRange(startD, endD)}`
  return (
    <View style={[styles.hero, { backgroundColor: colors.surfaceCard }]}>
      <View style={[styles.heroGlow, { backgroundColor: backgroundHex }]} />
      <View style={styles.heroBreadcrumb}>
        <View style={[styles.heroIconSmall, { backgroundColor: tint + "33" }]}>
          <SymbolView name={sfSymbol as never} size={13} tintColor={tint} resizeMode="scaleAspectFit" />
        </View>
        <Text
          text={`${isCandidate ? "POSSIBLE " : ""}${activityType.toUpperCase()} · ${dayLine}`}
          style={{ color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}
          numberOfLines={1}
        />
      </View>

      <View style={styles.strainHero}>
        <Text
          text={strain.toFixed(1)}
          style={{
            color: tint,
            fontSize: 64,
            fontWeight: "800",
            lineHeight: 64,
            letterSpacing: -2,
            fontVariant: ["tabular-nums"],
          }}
        />
        <View style={styles.strainMeta}>
          <Text
            text={isCandidate ? "EST." : "STRAIN"}
            style={{ color: tint, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }}
          />
          <Text
            text="of 21"
            style={{ color: colors.textDim, fontSize: 12, fontWeight: "600", marginTop: 1 }}
          />
          <Text
            text={band.label}
            style={{ color: band.tint, fontSize: 11, fontWeight: "700", marginTop: 6 }}
          />
        </View>
      </View>

      <View style={[styles.heroStats, { borderTopColor: colors.divider }]}>
        <QuickStat label="Duration" value={`${Math.round(durationMin)}m`} />
        <QuickStat label="HR avg" value={`${Math.round(hrAvg)}`} unit="bpm" />
        <QuickStat label="HR peak" value={`${Math.round(hrMax)}`} unit="bpm" />
      </View>
    </View>
  )
}

const QuickStat: FC<{ label: string; value: string; unit?: string }> = ({ label, value, unit }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "800",
            lineHeight: 20,
            fontVariant: ["tabular-nums"],
          }}
        />
        {unit ? (
          <Text
            text={unit}
            style={{ color: colors.textDim, fontSize: 11, fontWeight: "600", marginLeft: 3 }}
          />
        ) : null}
      </View>
      <Text
        text={label.toUpperCase()}
        style={{
          color: colors.textMuted,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1,
          marginTop: 4,
        }}
      />
    </View>
  )
}

// ───────────────── Impact card ─────────────────

const ImpactCard: FC<{
  boutStrain: number
  dayStrain: number | null
  shareOfDayPct: number | null
  band: { label: string; tint: string }
}> = ({ boutStrain, dayStrain, shareOfDayPct, band }) => {
  const colors = LOCAL_THEME.colors
  const indigo = "#9492f5"
  const indigoBg = "rgba(94, 92, 230, 0.10)"
  const indigoBorder = "rgba(94, 92, 230, 0.18)"
  return (
    <View style={[styles.impactCard, { backgroundColor: indigoBg, borderColor: indigoBorder }]}>
      <Text
        text="IMPACT"
        style={{ color: indigo, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 10 }}
      />
      <ImpactRow label="This bout" value={`${boutStrain.toFixed(1)} · ${band.label.toLowerCase()}`} valueColor={band.tint} />
      {dayStrain != null ? (
        <ImpactRow
          label="Today's day strain"
          value={`${dayStrain.toFixed(1)} of 21`}
          valueColor={colors.text}
        />
      ) : null}
      {shareOfDayPct != null ? (
        <ImpactRow
          label="Share of today's strain"
          value={`${shareOfDayPct}%`}
          valueColor={colors.text}
        />
      ) : null}
    </View>
  )
}

const ImpactRow: FC<{ label: string; value: string; valueColor: string }> = ({ label, value, valueColor }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.impactRow}>
      <Text text={label} style={{ color: colors.textDim, fontSize: 13 }} />
      <Text
        text={value}
        style={{ color: valueColor, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

// ───────────────── HR card ─────────────────

const HrCard: FC<{
  samples: { t: number; hr: number }[]
  tint: string
  peakBpm: number
  peakAt: Date | null
}> = ({ samples, tint, peakBpm, peakAt }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={[styles.hrCard, { backgroundColor: colors.surfaceCard }]}>
      <View style={styles.hrHead}>
        <Text
          text="HEART RATE"
          style={{ color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}
        />
        {peakAt ? (
          <Text
            text={`Peak ${Math.round(peakBpm)} bpm @ ${fmtTime(peakAt)}`}
            style={{ color: "#ff8a8a", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}
          />
        ) : null}
      </View>
      <HrChart samples={samples} tint={tint} />
    </View>
  )
}

const HrChart: FC<{ samples: { t: number; hr: number }[]; tint: string }> = ({ samples, tint }) => {
  if (samples.length < 2) return null
  const W = 280
  const H = 90
  const minHr = Math.min(...samples.map((s) => s.hr)) - 4
  const maxHr = Math.max(...samples.map((s) => s.hr)) + 4
  const tMin = samples[0].t
  const tMax = samples[samples.length - 1].t
  const x = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * W
  const y = (hr: number) => H - ((hr - minHr) / Math.max(1, maxHr - minHr)) * H
  const linePath = samples.map((s, i) => `${i === 0 ? "M" : "L"} ${x(s.t).toFixed(1)} ${y(s.hr).toFixed(1)}`).join(" ")
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`
  return (
    <View style={{ height: H }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="hrgrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={tint} stopOpacity="0.32" />
            <Stop offset="100%" stopColor={tint} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line x1={0} y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.5} x2={W} y2={H * 0.5} stroke="#ffffff10" />
        <Line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#ffffff10" />
        <Path d={areaPath} fill="url(#hrgrad)" />
        <Path d={linePath} stroke={tint} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      </Svg>
    </View>
  )
}

// ───────────────── Zone stack ─────────────────

const ZONE_COLORS = ["#4ade80", "#fbbf24", "#ffa42b", "#f87171", "#be123c"]
const ZoneStack: FC<{ zones: number[]; minutes: number[] }> = ({ zones, minutes }) => {
  const colors = LOCAL_THEME.colors
  const totalPct = zones.reduce((s, v) => s + v, 0) || 1
  const totalMin = minutes.reduce((s, v) => s + v, 0)
  const maxPct = Math.max(...zones, 1)
  return (
    <View style={[styles.zoneCard, { backgroundColor: colors.surfaceCard }]}>
      <View style={styles.zoneHead}>
        <Text
          text="HR ZONES"
          style={{ color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}
        />
        <Text
          style={{ color: colors.text, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}
        >
          {Math.round(totalMin)}m
          <Text text="  total" style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }} />
        </Text>
      </View>
      <View style={styles.zoneList}>
        {/* Render Z5 → Z1 so the highest-intensity sits at the top. */}
        {[4, 3, 2, 1, 0].map((i) => {
          const pct = zones[i] ?? 0
          const min = minutes[i] ?? 0
          const tint = ZONE_COLORS[i]
          const fillPct = Math.max(0, Math.min(100, (pct / maxPct) * 100))
          const pctOfTotal = Math.round((pct / totalPct) * 100)
          return (
            <View key={i} style={styles.zoneRow}>
              <View style={[styles.zonePill, { backgroundColor: tint }]}>
                <Text text={`Z${i + 1}`} style={styles.zonePillText} />
              </View>
              <View style={[styles.zoneBarTrack, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
                <View style={[styles.zoneBarFill, { backgroundColor: tint, width: `${fillPct}%` }]} />
              </View>
              <Text
                text={`${Math.round(min)}m · ${pctOfTotal}%`}
                style={{
                  color: colors.textDim,
                  fontSize: 11,
                  fontVariant: ["tabular-nums"],
                  width: 70,
                  textAlign: "right",
                }}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ───────────────── Motion (collapsed by default) ─────────────────

const MotionBars: FC<{ samples: number[]; tint: string }> = ({ samples, tint }) => {
  const W = 280
  const H = 50
  const max = Math.max(...samples, 0.01)
  const barW = W / samples.length
  return (
    <View style={{ height: H }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {samples.map((v, i) => {
          const h = (v / max) * H
          return (
            <Path
              key={i}
              d={`M ${(i * barW).toFixed(1)} ${H} v ${-h.toFixed(1)} h ${(barW * 0.7).toFixed(1)} v ${h.toFixed(1)} Z`}
              fill={tint}
              opacity={0.25 + (v / max) * 0.6}
            />
          )
        })}
      </Svg>
    </View>
  )
}

// ───────────────── Candidate banner ─────────────────

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

// ───────────────── Styles ─────────────────

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
    borderRadius: 18,
    position: "relative",
    overflow: "hidden",
  } as ViewStyle,
  heroGlow: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.6,
  } as ViewStyle,
  heroBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  } as ViewStyle,
  heroIconSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  strainHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 16,
  } as ViewStyle,
  strainMeta: { flex: 1 } as ViewStyle,
  heroStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  } as ViewStyle,

  impactCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  } as ViewStyle,
  impactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 6,
  } as ViewStyle,

  hrCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
  } as ViewStyle,
  hrHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  } as ViewStyle,

  zoneCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
  } as ViewStyle,
  zoneHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  } as ViewStyle,
  zoneList: { flexDirection: "column", gap: 8 } as ViewStyle,
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  } as ViewStyle,
  zonePill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  zonePillText: {
    color: "rgba(0,0,0,0.75)",
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  zoneBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  } as ViewStyle,
  zoneBarFill: {
    height: "100%",
    borderRadius: 4,
  } as ViewStyle,

  disclosureHead: {
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  } as ViewStyle,
  disclosureBody: {
    marginTop: 6,
    padding: 14,
    borderRadius: 14,
  } as ViewStyle,

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
  } as ViewStyle,
  actionPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  actionSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  destructLink: {
    marginTop: 16,
    paddingVertical: 12,
  } as ViewStyle,
})

export default BoutDetailScreen
