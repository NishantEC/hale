import { FC, useEffect } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"
import { Easing, useSharedValue, withTiming } from "react-native-reanimated"

import { CircularProgress } from "@/components/reactx/circular-progress"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Ring = {
  key: string
  label: string
  value: string
  unit: string
  progress: number
  color: string
  hero?: boolean
  onPress?: () => void
}

type Props = {
  rings: [Ring, Ring, Ring]
  // "row" — original three-across layout with one slightly larger hero.
  // "left-hero" — big hero ring on the left, the other two stacked
  // vertically on the right. Used by the home screen for stronger
  // visual hierarchy.
  layout?: "row" | "left-hero"
}

export const MetricRingsRow: FC<Props> = ({ rings, layout = "row" }) => {
  if (layout === "left-hero") {
    const hero = rings.find((r) => r.hero) ?? rings[1]
    const others = rings.filter((r) => r !== hero)
    return (
      <View style={styles.heroRow}>
        <View style={styles.heroLeftCol}>
          <RingItem ring={hero} size="hero-xl" />
        </View>
        <View style={styles.heroRightCol}>
          {others.map((r) => (
            <RingItem key={r.key} ring={r} size="compact" />
          ))}
        </View>
      </View>
    )
  }
  return (
    <View style={styles.row}>
      {rings.map((r) => (
        <RingItem key={r.key} ring={r} size={r.hero ? "hero" : "default"} />
      ))}
    </View>
  )
}

type RingSize = "default" | "hero" | "hero-xl" | "compact"

const SIZE_TABLE: Record<
  RingSize,
  {
    size: number
    strokeWidth: number
    valueSize: number
    valueLineHeight: number
    unitSize: number
    labelMarginTop: number
  }
> = {
  default: { size: 96, strokeWidth: 5, valueSize: 24, valueLineHeight: 28, unitSize: 10, labelMarginTop: 8 },
  hero: { size: 125, strokeWidth: 6, valueSize: 32, valueLineHeight: 36, unitSize: 13, labelMarginTop: 8 },
  "hero-xl": { size: 170, strokeWidth: 9, valueSize: 50, valueLineHeight: 54, unitSize: 17, labelMarginTop: 12 },
  compact: { size: 130, strokeWidth: 7, valueSize: 28, valueLineHeight: 34, unitSize: 14, labelMarginTop: 8 },
}

const RingItem: FC<{ ring: Ring; size: RingSize }> = ({ ring, size }) => {
  const { colors } = LOCAL_THEME
  const progress = useSharedValue(0)

  useEffect(() => {
    const target = Math.round(Math.max(0, Math.min(1, ring.progress)) * 100)
    progress.value = withTiming(target, { duration: 800, easing: Easing.out(Easing.ease) })
  }, [ring.progress, progress])

  const dims = SIZE_TABLE[size]

  return (
    <View style={styles.col}>
      <CircularProgress
        progress={progress}
        size={dims.size}
        strokeWidth={dims.strokeWidth}
        progressCircleColor={ring.color}
        outerCircleColor={colors.surfaceElevated}
        backgroundColor="transparent"
        gap={0}
        onPress={ring.onPress}
        renderIcon={() => (
          <View style={styles.center}>
            <Text
              text={ring.value}
              style={{
                color: ring.color,
                fontSize: dims.valueSize,
                fontWeight: "800",
                letterSpacing: -0.5,
                lineHeight: dims.valueLineHeight,
                fontVariant: ["tabular-nums"],
              }}
            />
            <Text
              text={ring.unit}
              style={{
                color: colors.textDim,
                fontSize: dims.unitSize,
                marginTop: 1,
              }}
            />
          </View>
        )}
      />
      <Text
        text={ring.label}
        style={{
          color: colors.textDim,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.6,
          marginTop: dims.labelMarginTop,
          textTransform: "uppercase",
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 18,
  } as ViewStyle,
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 36,
    gap: 12,
  } as ViewStyle,
  heroLeftCol: {
    alignItems: "center",
    flex: 1,
  } as ViewStyle,
  heroRightCol: {
    alignItems: "center",
    gap: 20,
  } as ViewStyle,
  col: {
    alignItems: "center",
    flex: 1,
  } as ViewStyle,
  center: {
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
})
