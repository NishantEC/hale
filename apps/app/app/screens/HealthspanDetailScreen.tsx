import { FC, useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Info,
} from "phosphor-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg"

import {
  HealthAssessment,
  HealthContributor,
  HealthViewModel,
} from "@/services/api/viewModels"
import { computeLocalHealthView } from "@/services/health/computeLocalHealthView"
import { openDatabase } from "@/services/db"
import { LOCAL_THEME } from "@/utils/localTheme"

// Enable LayoutAnimation on Android (default off). Cheap, no worklets.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const ORB_SIZE = 280

export const HealthspanDetailScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const colors = LOCAL_THEME.colors

  const [data, setData] = useState<HealthViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week, -1 = last, etc.

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    setError(null)
    try {
      const monday = mondayOfWeek(new Date())
      const target = new Date(monday.getTime() + offset * 7 * 86_400_000)
      const isoMonday = target.toISOString().slice(0, 10)
      const v = await computeLocalHealthView(openDatabase(), offset === 0 ? undefined : isoMonday)
      setData(v)
    } catch (e: any) {
      setError(e?.message ?? "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(weekOffset)
  }, [load, weekOffset])

  if (loading && !data) {
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
        <Pressable onPress={() => load(weekOffset)} style={styles.retryBtn}>
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
  const noopAge = current?.noopAge ?? 0
  const chrono = current?.chronologicalAge ?? 0
  const delta = noopAge - chrono
  const isYounger = delta < -0.05
  const isOlder = delta > 0.05
  const orbColors = isYounger
    ? ["#16A34A", "#4ADE80", "#86EFAC"]
    : isOlder
      ? ["#EA580C", "#FB923C", "#FDBA74"]
      : ["#475569", "#64748B", "#94A3B8"]
  const accentColor = isYounger ? "#4ade80" : isOlder ? "#fb923c" : "#64748b"

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }}
    >
      <Header
        weekStart={current?.weekStart ?? null}
        canGoForward={weekOffset < 0}
        onPrev={() => setWeekOffset((w) => w - 1)}
        onNext={() => setWeekOffset((w) => Math.min(0, w + 1))}
      />

      <OrbBlock
        assessment={current}
        orbColors={orbColors}
        accentColor={accentColor}
        delta={delta}
      />

      <PaceBlock value={current?.paceOfAging ?? null} accentColor={accentColor} />

      <CoachingBlock title={current?.coachingTitle ?? null} body={current?.coachingBody ?? null} />

      <Sections contributors={current?.contributors ?? []} />

      <TrendView history={data.history} />

      <Footer />
    </ScrollView>
  )
}

// ── Header w/ week strip + info dialog ────────────────────

const Header: FC<{
  weekStart: string | null
  canGoForward: boolean
  onPrev: () => void
  onNext: () => void
}> = ({ weekStart, canGoForward, onPrev, onNext }) => {
  const colors = LOCAL_THEME.colors
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <CaretLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.headerLabel, { color: colors.text }]}>HEALTHSPAN</Text>
          <Text style={[styles.headerSub, { color: colors.textDim }]}>{nextUpdateLabel()}</Text>
        </View>
        <Pressable style={styles.iconBtn} hitSlop={10} onPress={() => setInfoOpen(true)}>
          <Info size={22} color={colors.textDim} />
        </Pressable>
      </View>

      <Modal
        visible={infoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoOpen(false)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 28 }]}
          onPress={() => setInfoOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: colors.surfaceCard,
              borderColor: colors.surfaceCardBorder,
              borderWidth: 1,
              borderRadius: 16,
              padding: 22,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.dialogTitle, { color: colors.text }]}>About Healthspan</Text>
            <Text style={[styles.dialogBody, { color: colors.textDim }]}>
              Healthspan estimates how your body is tracking against an average healthy person
              your age. We blend a handful of signals — sleep, resting heart rate, cardio
              fitness, strength habits — into a single number expressed as a "biological age".
              {"\n\n"}
              The delta below the number is what matters. Negative means you're aging slower than
              average; positive means faster. Either way, the score moves with your habits week
              over week — it's not a verdict.
              {"\n\n"}
              Pace of Aging answers a different question: at the current rate, how fast is your
              biological age changing? 1.0× means you're aging at the chronological clock.
              Below 1.0× = slower; above 1.0× = faster.
              {"\n\n"}
              Not a medical diagnosis. If anything here surprises you, talk to a doctor.
            </Text>
            <Pressable
              onPress={() => setInfoOpen(false)}
              style={[styles.dialogCta, { backgroundColor: colors.tint }]}
            >
              <Text style={{ color: colors.background, fontSize: 14, fontWeight: "700" }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.weekStrip}>
        <Pressable onPress={onPrev} hitSlop={10} style={styles.chevBtn}>
          <CaretLeft size={18} color={colors.textMuted} />
        </Pressable>
        <Text style={[styles.weekText, { color: colors.text }]}>{formatWeekRange(weekStart)}</Text>
        <Pressable
          onPress={onNext}
          hitSlop={10}
          disabled={!canGoForward}
          style={styles.chevBtn}
        >
          <CaretRight
            size={18}
            color={canGoForward ? colors.textMuted : "transparent"}
          />
        </Pressable>
      </View>
    </View>
  )
}

// ── Energy-orb hero ────────────────────────────────────

const OrbBlock: FC<{
  assessment: HealthAssessment | null
  orbColors: string[]
  accentColor: string
  delta: number
}> = ({ assessment, orbColors, accentColor, delta }) => {
  const colors = LOCAL_THEME.colors
  const deltaText = !assessment
    ? "Calibrating · wear the strap"
    : Math.abs(delta) < 0.05
      ? "Tracking with your age"
      : delta < 0
        ? `${Math.abs(delta).toFixed(1)} yr younger than ${assessment.chronologicalAge.toFixed(0)}`
        : `${delta.toFixed(1)} yr older than ${assessment.chronologicalAge.toFixed(0)}`

  return (
    <View style={styles.orbWrap}>
      <View style={styles.orbContainer}>
        <View style={styles.orbAbsolute}>
          <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="orbInner" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={orbColors[0]} stopOpacity="0" />
                <Stop offset="45%" stopColor={orbColors[1]} stopOpacity="0.55" />
                <Stop offset="70%" stopColor={orbColors[1]} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={orbColors[2]} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="orbRing" cx="50%" cy="50%" r="55%">
                <Stop offset="55%" stopColor={accentColor} stopOpacity="0" />
                <Stop offset="68%" stopColor={accentColor} stopOpacity="0.55" />
                <Stop offset="82%" stopColor={accentColor} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="48" fill="url(#orbInner)" />
            <Circle cx="50" cy="50" r="48" fill="url(#orbRing)" />
          </Svg>
        </View>
        <View style={styles.orbCenter}>
          <Text style={[styles.orbNum, { color: colors.text }]}>
            {assessment ? assessment.noopAge.toFixed(1) : "—"}
          </Text>
          <Text style={[styles.orbLabel, { color: colors.textDim }]}>HALE AGE</Text>
          <Text style={[styles.orbDelta, { color: accentColor }]}>{deltaText}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Pace of Aging — read-only animated marker ─────────────

const PaceBlock: FC<{ value: number | null; accentColor: string }> = ({ value, accentColor }) => {
  const colors = LOCAL_THEME.colors
  const fraction = useSharedValue(0.5)

  useEffect(() => {
    if (value == null) return
    const clamped = Math.max(-1, Math.min(3, value))
    // [-1, 3] → [0, 1]
    fraction.value = withSpring((clamped + 1) / 4, { damping: 18, stiffness: 90 })
  }, [value, fraction])

  const markerStyle = useAnimatedStyle(() => ({
    left: `${fraction.value * 100}%`,
  }))

  return (
    <View style={styles.paceBlock}>
      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>PACE OF AGING</Text>
      <View style={styles.paceTrackWrap}>
        <View style={styles.paceTrack}>
          {Array.from({ length: 41 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.paceTick,
                i % 10 === 0 ? styles.paceTickMajor : null,
                { backgroundColor: colors.textMuted },
              ]}
            />
          ))}
        </View>
        {value != null ? (
          <Animated.View style={[styles.paceMarker, markerStyle]}>
            <Text style={[styles.paceMarkerText, { color: colors.text }]}>{value.toFixed(1)}x</Text>
            <View style={[styles.paceMarkerLine, { backgroundColor: accentColor }]} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.paceAxis}>
        <View style={styles.paceEnd}>
          <View style={[styles.paceDot, { borderColor: "#16A34A" }]} />
          <Text style={[styles.paceEndText, { color: colors.textDim }]}>Aging slower</Text>
        </View>
        <Text style={[styles.paceEndText, { color: colors.textDim }]}>1.0× = even</Text>
        <View style={styles.paceEnd}>
          <Text style={[styles.paceEndText, { color: colors.textDim }]}>Aging faster</Text>
          <View style={[styles.paceDot, { backgroundColor: "#EA580C", borderColor: "#EA580C" }]} />
        </View>
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

// ── Sections (Sleep / Strain / Fitness) with disclosure ───

const Sections: FC<{ contributors: HealthContributor[] }> = ({ contributors }) => {
  const groups = useMemo(
    () =>
      (["Sleep", "Strain", "Fitness"] as const)
        .map((name) => ({ name, items: contributors.filter((c) => c.section === name) }))
        .filter((g) => g.items.length > 0),
    [contributors],
  )
  return (
    <>
      {groups.map((g) => (
        <Section key={g.name} title={g.name} items={g.items} />
      ))}
    </>
  )
}

const Section: FC<{ title: string; items: HealthContributor[] }> = ({ title, items }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {items.map((c) => (
        <MetricCard key={c.key} contributor={c} />
      ))}
    </View>
  )
}

const MetricCard: FC<{ contributor: HealthContributor }> = ({ contributor }) => {
  const colors = LOCAL_THEME.colors
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((x) => !x)
  }, [])
  return (
    <View style={[styles.metric, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder }]}>
      <Pressable onPress={toggle} style={styles.metricTrigger}>
        <MetricSummary contributor={contributor} />
        {open ? (
          <CaretUp size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
        ) : (
          <CaretDown size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.metricDetail}>
          <MetricBar contributor={contributor} />
        </View>
      ) : null}
    </View>
  )
}

const MetricSummary: FC<{ contributor: HealthContributor }> = ({ contributor }) => {
  const colors = LOCAL_THEME.colors
  const impactColor = impactColorOf(contributor.impactYears, colors.textDim as string)
  const impactPrefix = contributor.impactYears > 0 ? "+" : ""
  const impactStr =
    Math.abs(contributor.impactYears) < 0.05 ? "0.0" : `${impactPrefix}${contributor.impactYears.toFixed(1)}`
  return (
    <View style={styles.metricRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.metricLabel, { color: colors.textDim }]}>{contributor.label.toUpperCase()}</Text>
        <Text style={[styles.metricValue, { color: colors.text }]}>
          {formatMetricValue(contributor.thirtyDayValue ?? contributor.sixMonthValue, contributor.unitsLabel)}
        </Text>
      </View>
      <View style={styles.impactCol}>
        <Text style={[styles.impactNum, { color: impactColor }]}>{impactStr}</Text>
        <Text style={[styles.impactLabel, { color: impactColor }]}>years</Text>
      </View>
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

  return (
    <View style={{ paddingTop: 12 }}>
      <View style={styles.barOuter}>
        <LinearGradient
          colors={
            contributor.direction === "lower"
              ? ["#16a34a", "#65a30d", "#ca8a04", "#d97706", "#f97316"]
              : ["#f97316", "#d97706", "#ca8a04", "#65a30d", "#16a34a"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.barFill}
        />
        {sixMoFrac != null ? (
          <View style={[styles.markerDown, { left: `${sixMoFrac * 100}%` }]} pointerEvents="none">
            <Text style={[styles.markerText, { color: colors.text }]}>
              {formatMetricValue(contributor.sixMonthValue, contributor.unitsLabel)}
            </Text>
            <Text style={[styles.markerArrow, { color: colors.text }]}>▼</Text>
          </View>
        ) : null}
        {thirtyFrac != null ? (
          <View style={[styles.markerUp, { left: `${thirtyFrac * 100}%` }]} pointerEvents="none">
            <Text style={[styles.markerArrow, { color: colors.text }]}>▲</Text>
            <Text style={[styles.markerText, { color: colors.text }]}>
              {formatMetricValue(contributor.thirtyDayValue, contributor.unitsLabel)}
            </Text>
          </View>
        ) : null}
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

// ── Trend view ────────────────────────────────────────

const TrendView: FC<{ history: HealthAssessment[] }> = ({ history }) => {
  const colors = LOCAL_THEME.colors
  const sorted = useMemo(
    () => [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [history],
  )
  const points = sorted.map((h) => h.paceOfAging).filter((v): v is number => v != null)
  if (points.length < 2) return null

  const min = Math.min(...points, 0)
  const max = Math.max(...points, 2)
  const range = max - min || 1

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Trend View</Text>
      <View style={[styles.metric, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder, padding: 14 }]}>
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

// ── Helpers ────────────────────────────────────

function mondayOfWeek(d: Date): Date {
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
}

function nextUpdateLabel(): string {
  const today = new Date()
  const day = today.getDay()
  const daysUntilMonday = (8 - day) % 7 || 7
  return `Next update in ${daysUntilMonday} days`
}

function formatWeekRange(weekStartIso: string | null): string {
  if (!weekStartIso) return "—"
  const start = new Date(`${weekStartIso}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
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

function impactColorOf(years: number, neutral: string): string {
  if (years < -0.1) return "#4ade80"
  if (years > 0.1) return "#fb923c"
  return neutral
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  cta: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, marginTop: 22 },
  ctaText: { fontSize: 14, fontWeight: "700" },

  headerWrap: { paddingBottom: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { padding: 4 },
  headerLabel: { fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 3 },

  weekStrip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 8 },
  chevBtn: { padding: 6 },
  weekText: { fontSize: 12, letterSpacing: 1.4, fontWeight: "600" },

  orbWrap: { alignItems: "center", paddingVertical: 22 },
  orbContainer: { width: ORB_SIZE, height: ORB_SIZE, alignItems: "center", justifyContent: "center" },
  orbAbsolute: { position: "absolute", inset: 0 } as any,
  orbCenter: { alignItems: "center", zIndex: 2 },
  orbNum: { fontSize: 56, fontWeight: "700", lineHeight: 60 },
  orbLabel: { fontSize: 12, letterSpacing: 2, fontWeight: "600", marginTop: 4 },
  orbDelta: { fontSize: 13, fontWeight: "600", marginTop: 6 },

  paceBlock: { paddingHorizontal: 22, marginTop: 14 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: "700", marginBottom: 14 },
  paceTrackWrap: { height: 30, position: "relative" },
  paceTrack: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: "100%" },
  paceTick: { width: 1, height: 10, opacity: 0.35 },
  paceTickMajor: { height: 18, opacity: 0.65 },
  paceMarker: { position: "absolute", top: -4, alignItems: "center", transform: [{ translateX: -16 }] },
  paceMarkerText: { fontSize: 17, fontWeight: "700" },
  paceMarkerLine: { width: 2, height: 28, marginTop: 2 },
  paceAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  paceEnd: { flexDirection: "row", alignItems: "center", gap: 6 },
  paceEndText: { fontSize: 11 },
  paceDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },

  coach: { marginHorizontal: 18, marginTop: 22, padding: 16, borderRadius: 14, borderWidth: 1 },
  coachTitle: { fontSize: 16, fontWeight: "700" },
  coachBody: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  coachLinkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  coachLink: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" },

  sectionBlock: { marginTop: 24, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: "700" },

  metric: { borderWidth: 1, borderRadius: 14, marginBottom: 10 },
  metricTrigger: { flexDirection: "row", alignItems: "center", padding: 14 },
  metricRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  metricLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700" },
  metricValue: { fontSize: 16, fontWeight: "600", marginTop: 4 },
  metricDetail: { paddingHorizontal: 14, paddingBottom: 14 },

  impactCol: { width: 60, alignItems: "flex-end" },
  impactNum: { fontSize: 16, fontWeight: "700" },
  impactLabel: { fontSize: 10 },

  barOuter: { height: 14, borderRadius: 4, marginVertical: 22, marginHorizontal: 6, overflow: "visible", position: "relative" },
  barFill: { position: "absolute", inset: 0, borderRadius: 4 } as any,
  markerDown: { position: "absolute", top: -24, alignItems: "center", transform: [{ translateX: -16 }] },
  markerUp: { position: "absolute", bottom: -24, alignItems: "center", transform: [{ translateX: -16 }] },
  markerText: { fontSize: 10, fontWeight: "700" },
  markerArrow: { fontSize: 8 },
  metricAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginHorizontal: 6 },
  axisText: { fontSize: 10 },

  trendChart: { height: 100, marginTop: 8, position: "relative", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 8 },
  trendDot: { position: "absolute", width: 6, height: 6, borderRadius: 3, transform: [{ translateX: -3 }, { translateY: -3 }] },

  footer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 30, marginHorizontal: 32 },

  dialogTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  dialogBody: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  dialogCta: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, alignSelf: "flex-end" },
})
