import { FC, useEffect } from "react"
import { Dimensions, StyleSheet, View } from "react-native"
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia"
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window")
// Aurora covers the top ~55% of the screen. The vignette fades the rest to
// the screen's base background so the cards below stay readable.
const AURORA_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55)

export type AuroraState = "ok" | "warn" | "alert" | "stale"

const PALETTES: Record<AuroraState, [string, string, string, string]> = {
  ok: ["#1ed760", "#40CEC4", "#8C7BB8", "#26B286"],
  warn: ["#FFA42B", "#FFC85A", "#C58642", "#C76542"],
  alert: ["#F3727F", "#C3425A", "#8E2A40", "#3A1018"],
  stale: ["#2a2a2a", "#3a3a3a", "#1f1f1f", "#181818"],
}

type Props = {
  state: AuroraState
  background?: string
}

export const AuroraBackdrop: FC<Props> = ({ state, background = "#0d0d0d" }) => {
  const palette = PALETTES[state]
  const t = useSharedValue(0)

  // Drive a single 18-second loop. All blob positions are derived from this
  // shared value so the animation cost stays at one withRepeat tween.
  // Critical: cancel on unmount so navigation tear-down doesn't leak the
  // repeating timing onto a discarded shared value (caused intermittent
  // crashes when switching tabs).
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
    return () => {
      cancelAnimation(t)
    }
  }, [t])

  const blob1 = useDerivedValue(() => ({
    cx: SCREEN_WIDTH * (0.22 + t.value * 0.05),
    cy: AURORA_HEIGHT * (0.14 - t.value * 0.03),
    r: SCREEN_WIDTH * (0.55 + t.value * 0.04),
  }))
  const blob2 = useDerivedValue(() => ({
    cx: SCREEN_WIDTH * (0.78 - t.value * 0.04),
    cy: AURORA_HEIGHT * (0.18 + t.value * 0.02),
    r: SCREEN_WIDTH * (0.5 + t.value * 0.05),
  }))
  const blob3 = useDerivedValue(() => ({
    cx: SCREEN_WIDTH * (0.55 + t.value * 0.06),
    cy: AURORA_HEIGHT * (0.34 - t.value * 0.04),
    r: SCREEN_WIDTH * (0.42 + t.value * 0.03),
  }))
  const blob4 = useDerivedValue(() => ({
    cx: SCREEN_WIDTH * (0.32 - t.value * 0.03),
    cy: AURORA_HEIGHT * (0.42 + t.value * 0.03),
    r: SCREEN_WIDTH * (0.38 + t.value * 0.04),
  }))

  // Skia animates these via the derived values; need scalar accessors for the
  // Circle props (Skia consumes SharedValue<number> directly).
  const cx1 = useDerivedValue(() => blob1.value.cx)
  const cy1 = useDerivedValue(() => blob1.value.cy)
  const r1 = useDerivedValue(() => blob1.value.r)
  const cx2 = useDerivedValue(() => blob2.value.cx)
  const cy2 = useDerivedValue(() => blob2.value.cy)
  const r2 = useDerivedValue(() => blob2.value.r)
  const cx3 = useDerivedValue(() => blob3.value.cx)
  const cy3 = useDerivedValue(() => blob3.value.cy)
  const r3 = useDerivedValue(() => blob3.value.r)
  const cx4 = useDerivedValue(() => blob4.value.cx)
  const cy4 = useDerivedValue(() => blob4.value.cy)
  const r4 = useDerivedValue(() => blob4.value.r)

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: background }]}>
      <Canvas style={{ width: SCREEN_WIDTH, height: AURORA_HEIGHT }}>
        <Group opacity={0.85}>
          <BlurMask blur={70} style="normal" />
          <Circle cx={cx1} cy={cy1} r={r1} color={palette[0]} opacity={0.55} />
          <Circle cx={cx2} cy={cy2} r={r2} color={palette[1]} opacity={0.45} />
          <Circle cx={cx3} cy={cy3} r={r3} color={palette[2]} opacity={0.4} />
          <Circle cx={cx4} cy={cy4} r={r4} color={palette[3]} opacity={0.45} />
        </Group>
        {/* Vertical fade-to-background so the aurora settles into the screen
            color before the first card surface — keeps body cards readable. */}
        <Rect x={0} y={0} width={SCREEN_WIDTH} height={AURORA_HEIGHT}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, AURORA_HEIGHT)}
            colors={["transparent", "transparent", `${background}AA`, background]}
            positions={[0, 0.55, 0.85, 1]}
          />
        </Rect>
      </Canvas>
    </View>
  )
}
