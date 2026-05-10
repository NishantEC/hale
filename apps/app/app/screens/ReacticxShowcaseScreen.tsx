import { FC, ReactElement, useMemo, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"

import { LOCAL_THEME } from "@/utils/localTheme"

// Index of every Reacticx component pulled into the codebase. Generated
// by tools/fetch-reacticx.py from the upstream registry.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const COMPONENT_INDEX: Record<string, { category: string; path: string }> = require("@/components/reacticx/_index.json")

type PreviewStatus = "live" | "needsNativeWind" | "needsExtraDep" | "passive"

const NATIVEWIND_BLOCKED = new Set([
  "action-card",
  "Breadcrumbs",
  "List",
  "media-list",
  "Shimmer",
  "subtitle",
  "whats-new",
])
const EXTRA_DEP_BLOCKED = new Set([
  "animated-curve-text", // svg-path-properties
  "animated-header-scrollview", // react-native-easing-gradient
  "circular-loader", // svg-path-properties
])

// Components with a live inline preview. Each entry returns a function
// that produces the rendered element. We use `any` to dodge variable
// export-name conventions across the registry (default, named, etc.).
type PreviewLoader = () => Promise<{ render: () => ReactElement }>

function pickExport(mod: any, ...candidates: string[]): any {
  for (const c of candidates) {
    if (mod?.[c]) return mod[c]
  }
  return mod?.default ?? Object.values(mod ?? {}).find((v) => typeof v === "function" || typeof v === "object")
}

const LIVE_PREVIEWS: Record<string, PreviewLoader> = {
  "energy-orb": async () => {
    const m: any = await import("@/components/reacticx/energy-orb")
    const C = pickExport(m, "EnergyOrb")
    return { render: () => <C width={140} height={140} colors={["#4ADE80", "#3FB1E7", "#A78BFA"]} speed={0.8} intensity={2.0} glowRadius={0.5} /> }
  },
  "pulsing-dots": async () => {
    const m: any = await import("@/components/reacticx/pulsing-dots")
    const C = pickExport(m, "PulsingDots")
    return { render: () => <C /> }
  },
  "circle-loader": async () => {
    const m: any = await import("@/components/reacticx/circle-loader")
    const C = pickExport(m, "CircleLoader")
    return { render: () => <C /> }
  },
  "circular-progress": async () => {
    const m: any = await import("@/components/reacticx/circular-progress")
    const C = pickExport(m, "CircularProgress")
    return { render: () => <C progress={0.7} /> }
  },
  "chroma-ring": async () => {
    const m: any = await import("@/components/reacticx/chroma-ring")
    const C = pickExport(m, "ChromaRing")
    return { render: () => <C size={140} /> }
  },
  aurora: async () => {
    const m: any = await import("@/components/reacticx/aurora")
    const C = pickExport(m, "Aurora")
    return { render: () => <View style={{ width: 240, height: 100 }}><C /></View> }
  },
  "mesh-gradient": async () => {
    const m: any = await import("@/components/reacticx/mesh-gradient")
    const C = pickExport(m, "AnimatedMeshGradient", "MeshGradient")
    return { render: () => <View style={{ width: 240, height: 100, borderRadius: 12, overflow: "hidden" }}><C /></View> }
  },
  "grainy-gradient": async () => {
    const m: any = await import("@/components/reacticx/grainy-gradient")
    const C = pickExport(m, "GrainyGradient")
    return { render: () => <View style={{ width: 240, height: 100, borderRadius: 12, overflow: "hidden" }}><C /></View> }
  },
  "elastic-slider": async () => {
    const m: any = await import("@/components/reacticx/elastic-slider")
    const C = pickExport(m, "ElasticSlider")
    return { render: () => <View style={{ width: 240 }}><C defaultValue={50} startingValue={0} maxValue={100} /></View> }
  },
  "spectral-wave": async () => {
    const m: any = await import("@/components/reacticx/spectral-wave")
    const C = pickExport(m, "SpectralWave")
    return { render: () => <View style={{ width: 240, height: 100 }}><C /></View> }
  },
  "check-box": async () => {
    const m: any = await import("@/components/reacticx/check-box")
    const C = pickExport(m, "Checkbox", "CheckBox")
    return { render: () => <C /> }
  },
  "rolling-counter": async () => {
    const m: any = await import("@/components/reacticx/rolling-counter")
    const C = pickExport(m, "RollingCounter")
    return { render: () => <C value={1234} /> }
  },
  hamburger: async () => {
    const m: any = await import("@/components/reacticx/hamburger")
    const C = pickExport(m, "HamburgerIcon", "Hamburger")
    return { render: () => <C /> }
  },
  "flexi-button": async () => {
    const m: any = await import("@/components/reacticx/flexi-button")
    const C = pickExport(m, "FlexiButton")
    return { render: () => <C /> }
  },
  "gooey-switch": async () => {
    const m: any = await import("@/components/reacticx/gooey-switch")
    const C = pickExport(m, "GooeySwitch")
    return { render: () => <C /> }
  },
  countdown: async () => {
    const m: any = await import("@/components/reacticx/countdown")
    const C = pickExport(m, "CountdownTimer", "Countdown")
    return { render: () => <C /> }
  },
}

function statusFor(name: string): PreviewStatus {
  if (NATIVEWIND_BLOCKED.has(name)) return "needsNativeWind"
  if (EXTRA_DEP_BLOCKED.has(name)) return "needsExtraDep"
  if (LIVE_PREVIEWS[name]) return "live"
  return "passive"
}

export const ReacticxShowcaseScreen: FC = () => {
  const insets = useSafeAreaInsets()
  const colors = LOCAL_THEME.colors
  const [search, setSearch] = useState("")

  const grouped = useMemo(() => {
    const out: Record<string, { name: string; status: PreviewStatus }[]> = {}
    for (const [name, meta] of Object.entries(COMPONENT_INDEX)) {
      if (search && !name.toLowerCase().includes(search.toLowerCase())) continue
      out[meta.category] ??= []
      out[meta.category].push({ name, status: statusFor(name) })
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [search])

  const totalCount = Object.keys(COMPONENT_INDEX).length
  const liveCount = Object.keys(COMPONENT_INDEX).filter((n) => LIVE_PREVIEWS[n]).length

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.headerLabel, { color: colors.text }]}>REACTICX SHOWCASE</Text>
          <Text style={[styles.headerSub, { color: colors.textDim }]}>
            {totalCount} components · {liveCount} live previews
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.legend}>
        <LegendTag color="#4ade80" label="Live" />
        <LegendTag color="#fb923c" label="NativeWind" />
        <LegendTag color="#f87171" label="Extra dep" />
        <LegendTag color={colors.textDim as string} label="Available" />
      </View>

      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, comps]) => (
          <View key={category} style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {category.toUpperCase()}{" "}
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {comps.length}</Text>
            </Text>
            {comps.map(({ name, status }) => (
              <ComponentCard key={name} name={name} status={status} />
            ))}
          </View>
        ))}
    </ScrollView>
  )
}

// ── Component preview card ────────────────────────────

const ComponentCard: FC<{ name: string; status: PreviewStatus }> = ({ name, status }) => {
  const colors = LOCAL_THEME.colors
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder }]}>
      <Pressable
        onPress={() => setExpanded((x) => !x)}
        style={styles.cardHead}
        disabled={status !== "live"}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.cardPath, { color: colors.textMuted }]}>
            @/components/reacticx/{name}
          </Text>
        </View>
        <StatusBadge status={status} />
        {status === "live" ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
            style={{ marginLeft: 6 }}
          />
        ) : null}
      </Pressable>
      {expanded && status === "live" ? <LivePreview name={name} /> : null}
    </View>
  )
}

const LivePreview: FC<{ name: string }> = ({ name }) => {
  const colors = LOCAL_THEME.colors
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; node: ReactElement }
    | { kind: "err"; message: string }
  >({ kind: "loading" })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    let cancelled = false
    LIVE_PREVIEWS[name]()
      .then((m) => {
        if (cancelled) return
        try {
          setState({ kind: "ok", node: m.render() })
        } catch (e: any) {
          setState({ kind: "err", message: e?.message ?? "render failed" })
        }
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "err", message: e?.message ?? "import failed" })
      })
    return () => {
      cancelled = true
    }
  })

  return (
    <View style={[styles.preview, { borderColor: colors.surfaceCardBorder }]}>
      {state.kind === "loading" ? (
        <ActivityIndicator color={colors.textDim} />
      ) : state.kind === "err" ? (
        <Text style={{ color: "#f87171", fontSize: 11 }}>error: {state.message}</Text>
      ) : (
        state.node
      )}
    </View>
  )
}

const StatusBadge: FC<{ status: PreviewStatus }> = ({ status }) => {
  const colors = LOCAL_THEME.colors
  const map: Record<PreviewStatus, { color: string; label: string }> = {
    live: { color: "#4ade80", label: "live" },
    needsNativeWind: { color: "#fb923c", label: "nativewind" },
    needsExtraDep: { color: "#f87171", label: "extra-dep" },
    passive: { color: colors.textMuted as string, label: "available" },
  }
  const m = map[status]
  return (
    <View style={[styles.badge, { borderColor: m.color }]}>
      <Text style={[styles.badgeText, { color: m.color }]}>{m.label}</Text>
    </View>
  )
}

const LegendTag: FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={[styles.legendTag, { borderColor: color }]}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={[styles.legendText, { color }]}>{label}</Text>
  </View>
)

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: { padding: 4, width: 32 },
  headerLabel: { fontSize: 13, letterSpacing: 2, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 3 },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  legendTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },

  sectionBlock: { paddingHorizontal: 18, paddingBottom: 18 },
  sectionTitle: { fontSize: 13, letterSpacing: 1.4, fontWeight: "700", marginBottom: 10, marginTop: 4 },

  card: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
  cardName: { fontSize: 14, fontWeight: "600" },
  cardPath: { fontSize: 10, marginTop: 2 },

  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },

  preview: {
    borderTopWidth: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
})
