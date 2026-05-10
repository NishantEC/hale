import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
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

  const content = (
    <View style={[$tile, { backgroundColor: colors.surfaceCard }]}>
      <View style={[$halo, { backgroundColor: hexWithAlpha(tint, 0.18) }]} pointerEvents="none" />
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
  top: -24,
  right: -24,
  width: 72,
  height: 72,
  borderRadius: 36,
}
