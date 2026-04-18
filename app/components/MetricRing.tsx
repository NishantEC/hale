import { TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import Svg, { Circle } from "react-native-svg"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type MetricRingProps = {
  value: string
  label: string
  progress: number
  accent?: string
  onPress?: () => void
  size?: "sm" | "lg"
  flexWeight?: number
}

export function MetricRing({
  value,
  label,
  progress,
  accent,
  onPress,
  size = "sm",
  flexWeight = 1,
}: MetricRingProps) {
  const { themed, theme: { colors } } = useAppTheme()
  const ringAccent = accent ?? colors.tint
  const clampedProgress = Math.max(0.02, Math.min(1, progress || 0))
  const ringSize = size === "lg" ? 120 : 104
  const strokeWidth = size === "lg" ? 9 : 8
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={!onPress}
      onPress={onPress}
      style={[themed($container), { flex: flexWeight }]}
    >
      <View style={[themed($ringWrap), { height: ringSize, width: ringSize }]}>
        <Svg width={ringSize} height={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={colors.surfaceElevated}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={clampedProgress > 0.021 ? ringAccent : colors.surfaceElevated}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clampedProgress)}
            origin={`${ringSize / 2}, ${ringSize / 2}`}
            rotation="-90"
          />
        </Svg>

        <View style={themed($valueWrap)}>
          <Text
            text={value}
            size={size === "lg" ? "xl" : "lg"}
            weight="bold"
            style={themed($valueText)}
          />
        </View>
      </View>

      <View style={themed($labelRow)}>
        <Text text={label} weight="semiBold" size="md" style={themed($label)} />
        <Ionicons name="chevron-forward" size={14} color={colors.iconDefault} />
      </View>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  gap: 16,
})

const $ringWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $valueWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  inset: 0,
  justifyContent: "center",
  position: "absolute",
})

const $valueText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $labelRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 6,
})

const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})
