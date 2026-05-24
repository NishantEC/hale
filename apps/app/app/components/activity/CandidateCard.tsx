import { FC, useState } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { SymbolView } from "expo-symbols"
import Svg, { Path } from "react-native-svg"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { Text } from "@/components/Text"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
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
  hrSparkline?: number[]
}

type Props = {
  card: CandidatePayload
  onConfirm: (id: string, finalType: string) => Promise<unknown> | void
  onDismiss: (id: string) => Promise<unknown> | void
}

const SWIPE_THRESHOLD = 90
const SWIPE_OUT_DISTANCE = 500

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function sparkPath(samples: number[], width = 280, height = 32): string {
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
  const confColor = confLow ? colors.statusAmber : "#9492F5"

  const samples = card.hrSparkline ?? []
  const sparkD = sparkPath(samples)
  const sparkArea = sparkD ? `${sparkD} L 280 32 L 0 32 Z` : ""

  const translateX = useSharedValue(0)
  const rotation = useSharedValue(0)

  const runConfirm = (id: string, type: string) => {
    if (busy) return
    setBusy(true)
    Promise.resolve(onConfirm(id, type)).finally(() => setBusy(false))
  }

  const runDismiss = (id: string) => {
    if (busy) return
    setBusy(true)
    Promise.resolve(onDismiss(id)).finally(() => setBusy(false))
  }

  const pan = Gesture.Pan()
    .enabled(!sheetOpen && !busy)
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX
      rotation.value = e.translationX / 18
    })
    .onEnd(() => {
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SWIPE_OUT_DISTANCE, { duration: 280 }, () => {
          runOnJS(runConfirm)(card.id, chosenType)
        })
        rotation.value = withTiming(20, { duration: 280 })
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SWIPE_OUT_DISTANCE, { duration: 280 }, () => {
          runOnJS(runDismiss)(card.id)
        })
        rotation.value = withTiming(-20, { duration: 280 })
      } else {
        translateX.value = withSpring(0, { damping: 14, stiffness: 180 })
        rotation.value = withSpring(0, { damping: 14, stiffness: 180 })
      }
    })

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }))

  const confirmOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }))

  const dismissOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: "#0E0D0A", borderColor: hexWithAlpha(colors.statusAmber, 0.3) },
          cardStyle,
        ]}
      >
        <LinearGradient
          colors={[hexWithAlpha(colors.statusAmber, 0.22), "transparent"]}
          locations={[0, 0.55]}
          style={styles.glow}
          pointerEvents="none"
        />

        <Animated.View
          style={[styles.swipeOverlay, { backgroundColor: hexWithAlpha(colors.statusGreen, 0.18) }, confirmOverlay]}
          pointerEvents="none"
        >
          <View style={[styles.swipeBadge, { borderColor: colors.statusGreen, alignSelf: "flex-end", marginRight: 18 }]}>
            <Text text="✓" style={{ color: colors.statusGreen, fontSize: 22, fontWeight: "800" }} />
          </View>
        </Animated.View>

        <Animated.View
          style={[styles.swipeOverlay, { backgroundColor: hexWithAlpha(colors.error, 0.22) }, dismissOverlay]}
          pointerEvents="none"
        >
          <View style={[styles.swipeBadge, { borderColor: colors.error, marginLeft: 18 }]}>
            <Text text="✕" style={{ color: colors.error, fontSize: 22, fontWeight: "800" }} />
          </View>
        </Animated.View>

        <View style={styles.content}>
          <Pressable onPress={() => setSheetOpen(true)} style={styles.headlineRow}>
            <View style={[styles.iconTile, { backgroundColor: v.backgroundHex }]}>
              <SymbolView name={v.sfSymbol as never} size={14} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
            </View>
            <Text
              text={chosenType}
              style={{ color: colors.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.3, flexShrink: 1 }}
            />
            <Text
              text="▾"
              style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginLeft: 2 }}
            />
            <View style={{ flex: 1 }} />
            <Text
              text={`${conf}%`}
              style={{ color: confColor, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] }}
            />
          </Pressable>

          <View style={[styles.meta, { borderTopColor: colors.divider }]}>
            <Text
              text={`${fmt(card.startTime)} → ${fmt(card.endTime)} · `}
              style={{ color: colors.textDim, fontSize: 10, fontWeight: "600", fontVariant: ["tabular-nums"] }}
            />
            <Text
              text={`${Math.round(card.durationMinutes)} min`}
              style={{ color: colors.text, fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}
            />
            <View style={{ width: 12 }} />
            <Text
              text="HR "
              style={{ color: colors.textDim, fontSize: 10, fontWeight: "600" }}
            />
            <Text
              text={`${Math.round(card.heartRateAvg)}`}
              style={{ color: colors.text, fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}
            />
            <Text
              text=" avg · "
              style={{ color: colors.textDim, fontSize: 10, fontWeight: "600" }}
            />
            <Text
              text={`${Math.round(card.heartRateMax)}`}
              style={{ color: colors.text, fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}
            />
            <Text
              text=" max"
              style={{ color: colors.textDim, fontSize: 10, fontWeight: "600" }}
            />
          </View>

          {samples.length >= 2 ? (
            <View style={styles.sparkWrap}>
              <Svg width="100%" height="32" viewBox="0 0 280 32" preserveAspectRatio="none">
                <Path d={sparkArea} fill={v.tintHex} fillOpacity={0.22} />
                <Path d={sparkD} stroke={v.tintHex} strokeWidth={1.5} fill="none" />
              </Svg>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => runDismiss(card.id)}
              disabled={busy}
              style={({ pressed }) => [
                styles.btn,
                styles.btnDismiss,
                { borderColor: hexWithAlpha("#FFFFFF", 0.08) },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                text="Dismiss"
                style={{ color: colors.textDim, fontSize: 13, fontWeight: "700" }}
              />
            </Pressable>
            <Pressable
              onPress={() => runConfirm(card.id, chosenType)}
              disabled={busy}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.text },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                text="Confirm"
                style={{ color: colors.background, fontSize: 13, fontWeight: "800" }}
              />
            </Pressable>
          </View>
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
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  } as ViewStyle,
  glow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "60%",
  } as ViewStyle,
  content: {
    padding: 14,
    position: "relative",
    zIndex: 1,
  } as ViewStyle,
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  } as ViewStyle,
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: "wrap",
  } as ViewStyle,
  sparkWrap: { marginTop: 8, height: 32 } as ViewStyle,
  actions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  } as ViewStyle,
  btn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  btnDismiss: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
  } as ViewStyle,
  swipeOverlay: {
    position: "absolute",
    inset: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    justifyContent: "center",
  } as ViewStyle,
  swipeBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  } as ViewStyle,
})
