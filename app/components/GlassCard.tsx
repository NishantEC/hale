import { PropsWithChildren } from "react"
import { TouchableOpacity, View, ViewStyle, type StyleProp } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  disabled?: boolean
}>

export function GlassCard({ children, style, onPress, disabled }: GlassCardProps) {
  const { themed } = useAppTheme()
  const content = <View style={[themed($card), style]}>{children}</View>

  if (!onPress) return content

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} disabled={disabled}>
      {content}
    </TouchableOpacity>
  )
}

const $card: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  backgroundColor: colors.surfaceCard,
  borderRadius: 20,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: colors.surfaceCardBorder,
  overflow: "hidden",
})
