import { TouchableOpacity, View } from "react-native"
import { PhosphorIcon } from "@/components/PhosphorIcon"
import Svg, { Circle } from "react-native-svg"

import { XStack, YStack, Paragraph } from "./tamagui-primitives"

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
  const ringAccent = accent ?? "#7C3AED"
  const trackColor = "rgba(255,255,255,0.08)"
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
      style={{ flex: flexWeight }}
    >
      <YStack alignItems="center" gap={16}>
        <View
          style={{
            height: ringSize,
            width: ringSize,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={ringSize} height={ringSize}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={trackColor}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={clampedProgress > 0.021 ? ringAccent : trackColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - clampedProgress)}
              origin={`${ringSize / 2}, ${ringSize / 2}`}
              rotation="-90"
            />
          </Svg>
          <View
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Paragraph fontSize={size === "lg" ? 22 : 18} fontWeight="700">
              {value}
            </Paragraph>
          </View>
        </View>
        <XStack alignItems="center" gap={6}>
          <Paragraph fontWeight="600">{label}</Paragraph>
          <PhosphorIcon name="chevron-forward" size={14} color="rgba(255,255,255,0.72)" />
        </XStack>
      </YStack>
    </TouchableOpacity>
  )
}
