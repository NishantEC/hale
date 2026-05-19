import { FC, useState } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { SymbolView } from "expo-symbols"
import Svg, { Path } from "react-native-svg"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"
import { ClassPickerSheet } from "./ClassPickerSheet"

export type CandidatePayload = {
  id: string
  startTime: Date
  endTime: Date
  durationMinutes: number
  heartRateAvg: number
  heartRateMax: number
  confidence: number
  suggestedType: string
  /** Normalised HR series [0..1] sampled at ~24 points for the mini sparkline. */
  hrSparkline?: number[]
}

type Props = {
  card: CandidatePayload
  onConfirm: (id: string, finalType: string) => Promise<unknown> | void
  onDismiss: (id: string) => Promise<unknown> | void
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function sparkPath(samples: number[], width = 280, height = 44): string {
  if (samples.length === 0) return ""
  const step = width / Math.max(1, samples.length - 1)
  return samples
    .map((v, i) => {
      const x = i * step
      const y = height - v * height
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
}

/**
 * Map legacy backend class names that have been dropped from the Rich-10
 * taxonomy to their nearest current equivalent. The backend may still emit
 * "General Exercise" for older candidates; we present them as "Mixed" so
 * the UI stays consistent with the new visual system.
 */
function normalizeClass(t: string): string {
  if (t === "General Exercise") return "Mixed"
  return t
}

export const CandidateCard: FC<Props> = ({ card, onConfirm, onDismiss }) => {
  const colors = LOCAL_THEME.colors
  const [chosenType, setChosenType] = useState(normalizeClass(card.suggestedType))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const v = visualForType(chosenType)
  const conf = Math.round(card.confidence * 100)
  const confLow = card.confidence < 0.5

  const run = async (fn: () => Promise<unknown> | void) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const samples = card.hrSparkline ?? []
  const sparkD = sparkPath(samples)
  const sparkArea = sparkD ? `${sparkD} L 280 44 L 0 44 Z` : ""

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: visualForType("Candidate").tintHex,
        },
      ]}
    >
      <View style={styles.metaRow}>
        <Text
          text={`${fmt(card.startTime)} → ${fmt(card.endTime)}`}
          style={{ color: colors.text, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}
        />
        <View style={[styles.metaDot, { backgroundColor: colors.divider }]} />
        <Text
          text={`${Math.round(card.durationMinutes)} min`}
          style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }}
        />
        <View style={[styles.metaDot, { backgroundColor: colors.divider }]} />
        <Text
          text={`HR ${Math.round(card.heartRateAvg)} avg · ${Math.round(card.heartRateMax)} max`}
          style={{ color: colors.textDim, fontSize: 11, fontWeight: "600" }}
        />
        <View style={{ flex: 1 }} />
        <View
          style={[
            styles.confChip,
            { backgroundColor: confLow ? "rgba(255, 164, 43, 0.18)" : "rgba(94, 92, 230, 0.18)" },
          ]}
        >
          <Text
            text={`${conf}%`}
            style={{
              color: confLow ? "#FFA42B" : "#9492F5",
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 0.4,
            }}
          />
        </View>
      </View>

      {samples.length >= 2 ? (
        <View style={styles.sparkWrap}>
          <Svg width="100%" height="44" viewBox="0 0 280 44" preserveAspectRatio="none">
            <Path d={sparkArea} fill={v.tintHex} fillOpacity={0.18} />
            <Path d={sparkD} stroke={v.tintHex} strokeWidth={1.6} fill="none" />
          </Svg>
        </View>
      ) : null}

      <View style={styles.verdictRow}>
        <Text text={confLow ? "This might be" : "This was"} style={{ color: colors.textDim, fontSize: 12 }} />
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={[styles.chip, { backgroundColor: v.backgroundHex }]}
        >
          <View style={[styles.chipIcon, { backgroundColor: v.tintHex + "44" }]}>
            <SymbolView name={v.sfSymbol as never} size={11} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
          </View>
          <Text text={chosenType} style={{ color: v.tintHex, fontSize: 12, fontWeight: "700" }} />
          <Text text="▾" style={{ color: v.tintHex, fontSize: 9, opacity: 0.7 }} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => run(() => onConfirm(card.id, chosenType))}
          disabled={busy}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.text, opacity: busy || pressed ? 0.65 : 1 },
          ]}
        >
          <Text text="Confirm" style={{ color: colors.background, fontSize: 13, fontWeight: "800" }} />
        </Pressable>
        <Pressable
          onPress={() => run(() => onDismiss(card.id))}
          disabled={busy}
          style={{ paddingVertical: 6, paddingHorizontal: 4 }}
        >
          <Text
            text="Not an activity"
            style={{ color: colors.textDim, fontSize: 12, textDecorationLine: "underline" }}
          />
        </Pressable>
      </View>

      <ClassPickerSheet
        visible={sheetOpen}
        currentType={chosenType}
        onCancel={() => setSheetOpen(false)}
        onPick={(t) => {
          setChosenType(t)
          setSheetOpen(false)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  } as ViewStyle,
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 } as ViewStyle,
  confChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 } as ViewStyle,
  sparkWrap: { marginTop: 12, height: 44 } as ViewStyle,
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
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
  actions: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  primary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
})
