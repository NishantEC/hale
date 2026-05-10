import { FC, useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"

import { fetchHealthView, HealthAssessment, HealthContributor, HealthViewModel } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

export const HealthScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const colors = LOCAL_THEME.colors

  const [data, setData] = useState<HealthViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const v = await fetchHealthView()
      setData(v)
    } catch (e: any) {
      setError(e?.message ?? "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    )
  }

  if (error || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textDim }}>{error ?? "No data"}</Text>
        <Pressable onPress={load} style={styles.retryBtn}>
          <Text style={{ color: colors.text }}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  if (data.needsDateOfBirth) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 32 }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Tell us your birthday</Text>
        <Text style={[styles.emptyBody, { color: colors.textDim }]}>
          Healthspan compares your wearable data to where someone your age would typically be. Add your
          date of birth in Settings to unlock it.
        </Text>
        <Pressable
          onPress={() => router.push("/settings")}
          style={[styles.cta, { backgroundColor: colors.tint }]}
        >
          <Text style={[styles.ctaText, { color: colors.background }]}>Open Settings</Text>
        </Pressable>
      </View>
    )
  }

  const current = data.current

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }}
    >
      <Header label="HEALTHSPAN" subtitle={nextUpdateLabel()} />
      <WeekStrip weekStart={current?.weekStart ?? null} />
      <Orb assessment={current} />
      <PaceSlider value={current?.paceOfAging ?? null} />
      <CoachingBlock title={current?.coachingTitle ?? null} body={current?.coachingBody ?? null} />

      <Sections contributors={current?.contributors ?? []} />

      <TrendView history={data.history} />
      <Footer />
    </ScrollView>
  )
}

// ── Header ────────────────────────────────────────────

const Header: FC<{ label: string; subtitle: string }> = ({ label, subtitle }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.headerBlock}>
      <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <View style={{ alignItems: "center" }}>
        <Text style={[styles.headerLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.headerSub, { color: colors.textDim }]}>{subtitle}</Text>
      </View>
      <Pressable style={styles.infoBtn} hitSlop={10}>
        <Ionicons name="information-circle-outline" size={22} color={colors.textDim} />
      </Pressable>
    </View>
  )
}

const WeekStrip: FC<{ weekStart: string | null }> = ({ weekStart }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.weekStrip}>
      <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
      <Text style={[styles.weekText, { color: colors.text }]}>{formatWeekRange(weekStart)}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </View>
  )
}

// ── Orb ────────────────────────────────────────────

const Orb: FC<{ assessment: HealthAssessment | null }> = ({ assessment }) => {
  const colors = LOCAL_THEME.colors
  const noopAge = assessment?.noopAge ?? 0
  const chrono = assessment?.chronologicalAge ?? 0
  const delta = noopAge - chrono
  const isYounger = delta < -0.05
  const isOlder = delta > 0.05
  const orbColor = isYounger ? "#4ade80" : isOlder ? "#fb923c" : "#64748b"
  const deltaText = isYounger
    ? `${Math.abs(delta).toFixed(1)} years younger`
    : isOlder
      ? `${delta.toFixed(1)} years older`
      : "matching your chronological age"

  return (
    <View style={styles.orbWrap}>
      <View style={[styles.orbOuter, { shadowColor: orbColor, borderColor: `${orbColor}30` }]}>
        <View style={[styles.orbRing, { borderColor: `${orbColor}55` }]} />
        <View style={[styles.orbInner, { backgroundColor: `${orbColor}12` }]} />
        <View style={styles.orbContent}>
          <Text style={[styles.orbNum, { color: colors.text }]}>
            {assessment ? noopAge.toFixed(1) : "—"}
          </Text>
          <Text style={[styles.orbLabel, { color: colors.textDim }]}>NOOP AGE</Text>
          <Text style={[styles.orbDelta, { color: orbColor }]}>{deltaText}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Pace slider ────────────────────────────────────────────

const PaceSlider: FC<{ value: number | null }> = ({ value }) => {
  const colors = LOCAL_THEME.colors
  const clamped = value == null ? null : Math.max(-1, Math.min(3, value))
  // Map [-1, 3] → [0, 1]
  const fraction = clamped == null ? 0.5 : (clamped + 1) / 4

  return (
    <View style={styles.paceBlock}>
      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>PACE OF AGING</Text>
      <View style={styles.paceTrack}>
        <View style={styles.paceTicks}>
          {Array.from({ length: 13 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.paceTick,
                i % 4 === 0 ? styles.paceTickMajor : null,
                { backgroundColor: colors.textMuted },
              ]}
            />
          ))}
        </View>
        {clamped != null ? (
          <View style={[styles.paceMarker, { left: `${fraction * 100}%` }]}>
            <Text style={[styles.paceMarkerText, { color: colors.text }]}>
              {clamped.toFixed(1)}x
            </Text>
            <View style={[styles.paceMarkerLine, { backgroundColor: colors.text }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.paceAxis}>
        <Text style={[styles.paceEnd, { color: colors.textDim }]}>○ Slow</Text>
        <Text style={[styles.paceCenter, { color: colors.textDim }]}>1.0x</Text>
        <Text style={[styles.paceEnd, { color: colors.textDim }]}>Fast ●</Text>
      </View>
    </View>
  )
}

const CoachingBlock: FC<{ title: string | null; body: string | null }> = ({ title, body }) => {
  const colors = LOCAL_THEME.colors
  if (!title && !body) return null
  return (
    <View style={[styles.coach, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder }]}>
      {title ? <Text style={[styles.coachTitle, { color: colors.text }]}>{title}</Text> : null}
      {body ? <Text style={[styles.coachBody, { color: colors.textDim }]}>{body}</Text> : null}
    </View>
  )
}

// ── Sections ────────────────────────────────────────────

const Sections: FC<{ contributors: HealthContributor[] }> = ({ contributors }) => {
  const buckets: { name: HealthContributor["section"]; items: HealthContributor[] }[] = [
    { name: "Sleep", items: contributors.filter((c) => c.section === "Sleep") },
    { name: "Strain", items: contributors.filter((c) => c.section === "Strain") },
    { name: "Fitness", items: contributors.filter((c) => c.section === "Fitness") },
  ]
  return (
    <>
      {buckets.map((b) =>
        b.items.length === 0 ? null : <Section key={b.name} title={b.name} items={b.items} />,
      )}
    </>
  )
}

const Section: FC<{ title: string; items: HealthContributor[] }> = ({ title, items }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.sectionToggle}>
          <Text style={[styles.toggleActive, { color: colors.text }]}>▼ 6 Month avg.</Text>
          <Text style={[styles.toggleDim, { color: colors.textMuted }]}>▲ 30 Day avg.</Text>
        </View>
      </View>
      {items.map((c) => (
        <MetricBar key={c.key} contributor={c} />
      ))}
    </View>
  )
}

const MetricBar: FC<{ contributor: HealthContributor }> = ({ contributor }) => {
  const colors = LOCAL_THEME.colors
  const range = contributor.axisHi - contributor.axisLo
  const positionOf = (v: number | null): number | null => {
    if (v == null || range <= 0) return null
    return Math.max(0, Math.min(1, (v - contributor.axisLo) / range))
  }
  const sixMoFrac = positionOf(contributor.sixMonthValue)
  const thirtyFrac = positionOf(contributor.thirtyDayValue)

  const impactColor =
    contributor.impactYears < -0.1
      ? "#4ade80"
      : contributor.impactYears > 0.1
        ? "#fb923c"
        : colors.textDim
  const impactPrefix = contributor.impactYears > 0 ? "+" : ""
  const impactStr =
    Math.abs(contributor.impactYears) < 0.05 ? "0.0" : `${impactPrefix}${contributor.impactYears.toFixed(1)}`

  const gradientFlipped = contributor.direction === "lower"

  return (
    <View style={[styles.metric, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder }]}>
      <View style={styles.metricHead}>
        <Text style={[styles.metricLabel, { color: colors.textDim }]}>{contributor.label.toUpperCase()}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>∨</Text>
      </View>
      <View style={styles.metricBarRow}>
        <View style={styles.metricBarOuter}>
          <View style={[styles.metricBar, gradientFlipped ? styles.gradReversed : styles.gradStandard]} />
          {sixMoFrac != null ? (
            <View style={[styles.markerDown, { left: `${sixMoFrac * 100}%` }]}>
              <Text style={[styles.markerText, { color: colors.text }]}>
                {formatMetricValue(contributor.sixMonthValue, contributor.unitsLabel)}
              </Text>
              <Text style={styles.markerArrow}>▼</Text>
            </View>
          ) : null}
          {thirtyFrac != null ? (
            <View style={[styles.markerUp, { left: `${thirtyFrac * 100}%` }]}>
              <Text style={styles.markerArrow}>▲</Text>
              <Text style={[styles.markerText, { color: colors.text }]}>
                {formatMetricValue(contributor.thirtyDayValue, contributor.unitsLabel)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.impactCol}>
          <Text style={[styles.impactNum, { color: impactColor }]}>{impactStr}</Text>
          <Text style={[styles.impactLabel, { color: impactColor }]}>years</Text>
        </View>
      </View>
      <View style={styles.metricAxis}>
        <Text style={[styles.axisText, { color: colors.textMuted }]}>
          {contributor.axisLo}
          {contributor.unitsLabel}
        </Text>
        <Text style={[styles.axisText, { color: colors.textMuted }]}>
          {contributor.axisHi}
          {contributor.unitsLabel}
        </Text>
      </View>
    </View>
  )
}

// ── Trend view ────────────────────────────────────────────

const TrendView: FC<{ history: HealthAssessment[] }> = ({ history }) => {
  const colors = LOCAL_THEME.colors
  if (history.length < 2) return null

  const sorted = [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const points = sorted.map((h) => h.paceOfAging).filter((v): v is number => v != null)
  if (points.length < 2) return null

  const min = Math.min(...points, 0)
  const max = Math.max(...points, 2)
  const range = max - min || 1

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Trend View</Text>
      <View style={[styles.metric, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder, paddingVertical: 12 }]}>
        <Text style={[styles.metricLabel, { color: colors.textDim }]}>PACE OF AGING TREND</Text>
        <View style={styles.trendChart}>
          {points.map((v, i) => {
            const x = (i / (points.length - 1)) * 100
            const y = 100 - ((v - min) / range) * 100
            return (
              <View
                key={i}
                style={[
                  styles.trendDot,
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                    backgroundColor: i === points.length - 1 ? "#4ade80" : colors.tint,
                  },
                ]}
              />
            )
          })}
        </View>
      </View>
    </View>
  )
}

const Footer: FC = () => {
  const colors = LOCAL_THEME.colors
  return (
    <Text style={[styles.footer, { color: colors.textMuted }]}>
      Estimated from your wearable data using published longevity research. Not a medical assessment.
    </Text>
  )
}

// ── Helpers ────────────────────────────────────────────

function nextUpdateLabel(): string {
  const today = new Date()
  const day = today.getDay() // 0 Sun
  const daysUntilMonday = (8 - day) % 7 || 7
  return `Next update in ${daysUntilMonday} days`
}

function formatWeekRange(weekStartIso: string | null): string {
  if (!weekStartIso) return "—"
  const start = new Date(`${weekStartIso}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
  return `${fmt(start)} – ${fmt(end)}`
}

function formatMetricValue(value: number | null, units: string): string {
  if (value == null) return "—"
  if (units === "%") return `${Math.round(value)}%`
  if (units === "h") {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    return m === 0 ? `${h}h` : `${h}:${m.toString().padStart(2, "0")}h`
  }
  if (units === "steps") return Math.round(value).toLocaleString()
  if (units === "ml/kg/min") return `${value.toFixed(0)} ml/kg/min`
  if (units === "bpm") return `${Math.round(value)} bpm`
  return value.toFixed(1)
}

// ── Styles ────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  cta: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, marginTop: 22 },
  ctaText: { fontSize: 14, fontWeight: "700" },

  headerBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { padding: 4 },
  infoBtn: { padding: 4 },
  headerLabel: { fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 3 },

  weekStrip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 10 },
  weekText: { fontSize: 12, letterSpacing: 1.4, fontWeight: "600" },

  orbWrap: { alignItems: "center", paddingVertical: 22 },
  orbOuter: { width: 260, height: 260, borderRadius: 130, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowOpacity: 0.55, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
  orbRing: { position: "absolute", inset: 14, borderRadius: 116, borderWidth: 2 } as any,
  orbInner: { position: "absolute", inset: 24, borderRadius: 106 } as any,
  orbContent: { alignItems: "center", zIndex: 2 },
  orbNum: { fontSize: 56, fontWeight: "700", lineHeight: 60 },
  orbLabel: { fontSize: 12, letterSpacing: 2, fontWeight: "600", marginTop: 4 },
  orbDelta: { fontSize: 13, fontWeight: "600", marginTop: 6 },

  paceBlock: { paddingHorizontal: 22, marginTop: 14 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: "700", marginBottom: 14 },
  paceTrack: { height: 30, position: "relative" },
  paceTicks: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: "100%" },
  paceTick: { width: 1, height: 12, opacity: 0.35 },
  paceTickMajor: { height: 20, opacity: 0.65 },
  paceMarker: { position: "absolute", top: -2, alignItems: "center", transform: [{ translateX: -16 }] },
  paceMarkerText: { fontSize: 16, fontWeight: "700" },
  paceMarkerLine: { width: 2, height: 26, marginTop: 2 },
  paceAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  paceEnd: { fontSize: 11 },
  paceCenter: { fontSize: 11 },

  coach: { marginHorizontal: 18, marginTop: 22, padding: 14, borderRadius: 14, borderWidth: 1 },
  coachTitle: { fontSize: 15, fontWeight: "700" },
  coachBody: { fontSize: 13, lineHeight: 19, marginTop: 6 },

  sectionBlock: { marginTop: 24, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: "700" },
  sectionToggle: { flexDirection: "row", gap: 10 },
  toggleActive: { fontSize: 11, fontWeight: "600" },
  toggleDim: { fontSize: 11 },

  metric: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  metricHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700" },
  metricBarRow: { flexDirection: "row", alignItems: "center", marginTop: 24, marginBottom: 6 },
  metricBarOuter: { flex: 1, height: 18, position: "relative", borderRadius: 4, overflow: "visible" },
  metricBar: { position: "absolute", inset: 0, borderRadius: 4 } as any,
  gradStandard: { backgroundColor: "#f97316" }, // start orange; ideally a gradient — RN needs LinearGradient lib
  gradReversed: { backgroundColor: "#16a34a" },
  markerDown: { position: "absolute", top: -22, alignItems: "center", transform: [{ translateX: -16 }] },
  markerUp: { position: "absolute", bottom: -22, alignItems: "center", transform: [{ translateX: -16 }] },
  markerText: { fontSize: 10, fontWeight: "700" },
  markerArrow: { fontSize: 9, color: "rgba(255,255,255,0.8)" },
  impactCol: { width: 56, alignItems: "flex-end" },
  impactNum: { fontSize: 16, fontWeight: "700" },
  impactLabel: { fontSize: 10 },
  metricAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { fontSize: 10 },

  trendChart: { height: 100, marginTop: 8, position: "relative", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 8 },
  trendDot: { position: "absolute", width: 6, height: 6, borderRadius: 3, transform: [{ translateX: -3 }, { translateY: -3 }] },

  footer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 30, marginHorizontal: 32 },
})
