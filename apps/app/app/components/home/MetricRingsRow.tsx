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
}

export const MetricRingsRow: FC<Props> = ({ rings }) => {
  return (
    <View style={styles.row}>
      {rings.map((r) => (
        <RingItem key={r.key} ring={r} />
      ))}
    </View>
  )
}

const RingItem: FC<{ ring: Ring }> = ({ ring }) => {
  const { colors } = LOCAL_THEME
  const progress = useSharedValue(0)

  useEffect(() => {
    const target = Math.round(Math.max(0, Math.min(1, ring.progress)) * 100)
    progress.value = withTiming(target, { duration: 800, easing: Easing.out(Easing.ease) })
  }, [ring.progress, progress])

  const size = ring.hero ? 125 : 96
  const strokeWidth = ring.hero ? 6 : 5
  const valueSize = ring.hero ? 32 : 24
  const valueLineHeight = ring.hero ? 36 : 28
  const unitSize = ring.hero ? 13 : 10

  return (
    <View style={styles.col}>
      <CircularProgress
        progress={progress}
        size={size}
        strokeWidth={strokeWidth}
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
                fontSize: valueSize,
                fontWeight: "800",
                letterSpacing: -0.5,
                lineHeight: valueLineHeight,
                fontVariant: ["tabular-nums"],
              }}
            />
            <Text
              text={ring.unit}
              style={{
                color: colors.textDim,
                fontSize: unitSize,
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
          marginTop: 8,
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
  col: {
    alignItems: "center",
    flex: 1,
  } as ViewStyle,
  center: {
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
})
