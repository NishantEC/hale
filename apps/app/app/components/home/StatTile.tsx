import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  label: string
  value: string
  desc?: string
  /** Hex color for the corner halo (e.g. "#A78BFA"). */
  tint: string
  onPress?: () => void
}

export const StatTile: FC<Props> = ({ label, value, desc, tint, onPress }) => {
  const colors = LOCAL_THEME.colors
  // Stable per-tile gradient id so multiple tiles in a screen don't collide.
  const gradientId = `stat-halo-${tint.replace(/[^a-zA-Z0-9]/g, "")}`

  const content = (
    <View style={[$tile, { backgroundColor: colors.surfaceCard }]}>
      <Svg style={$halo} viewBox="0 0 100 100" pointerEvents="none">
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={tint} stopOpacity={0.55} />
            <Stop offset="40%" stopColor={tint} stopOpacity={0.25} />
            <Stop offset="75%" stopColor={tint} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="50" rx="50" ry="50" fill={`url(#${gradientId})`} />
      </Svg>
      <Text
        text={label.toUpperCase()}
        style={{
          color: colors.textDim,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
        }}
      />
      <Text
        text={value}
        style={{
          color: colors.text,
          fontSize: 26,
          fontWeight: "900",
          letterSpacing: -0.6,
          marginTop: 4,
          fontVariant: ["tabular-nums"],
        }}
      />
      {desc ? (
        <Text
          text={desc}
          style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        />
      ) : null}
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}
    >
      {content}
    </Pressable>
  )
}

const $tile: ViewStyle = {
  borderRadius: 14,
  padding: 14,
  overflow: "hidden",
  position: "relative",
  flex: 1,
  minHeight: 96,
}

const $halo: ViewStyle = {
  position: "absolute",
  top: -36,
  right: -36,
  width: 120,
  height: 120,
}
