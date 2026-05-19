import { FC } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import type { Dot } from "./selectors"

type Props = {
  icon: PhosphorIcon
  name: string
  sub: string
  dot: Dot
  onPress?: () => void
}

export const Chip: FC<Props> = ({ icon: Icon, name, sub, dot, onPress }) => {
  const { colors } = LOCAL_THEME
  const dotColor =
    dot === "green" ? "#4ade80" : dot === "amber" ? "#fbbf24" : "#ef4444"
  const iconColor =
    dot === "green" ? "#86efac" : dot === "amber" ? "#fcd34d" : "#fca5a5"

  const inner = (
    <>
      <View style={[$dot, { backgroundColor: dotColor }]} />
      <Icon size={20} color={iconColor} weight="regular" />
      <Text text={name} size="xxs" style={[$name, { color: colors.textDim }]} />
      <Text
        text={sub}
        size="xxs"
        style={[$sub, { color: colors.textDim }]}
        numberOfLines={2}
      />
    </>
  )

  const baseStyle: ViewStyle = {
    ...$wrap,
    backgroundColor: colors.surfaceCard,
    borderColor: colors.surfaceCardBorder,
  }

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={baseStyle} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    )
  }
  return <View style={baseStyle}>{inner}</View>
}

const $wrap: ViewStyle = {
  flex: 1,
  borderRadius: 14,
  borderWidth: 1,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 3,
  minHeight: 92,
  position: "relative",
}

const $dot: ViewStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 6,
  height: 6,
  borderRadius: 3,
}

const $name = { textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 }
const $sub = { textAlign: "center" as const, fontSize: 9, lineHeight: 11 }
