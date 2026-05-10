import { PropsWithChildren } from "react"
import { TouchableOpacity, ViewStyle, type StyleProp } from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"
import { YStack } from "./tamagui-primitives"

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  disabled?: boolean
}>

export function GlassCard({ children, style, onPress, disabled }: GlassCardProps) {
  const colors = LOCAL_THEME.colors

  const content = (
    <YStack
      backgroundColor={colors.surfaceCard}
      borderColor={colors.surfaceCardBorder}
      borderWidth={1}
      borderRadius={20}
      padding={16}
      overflow="hidden"
      style={style}
    >
      {children}
    </YStack>
  )

  if (!onPress) return content

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} disabled={disabled}>
      {content}
    </TouchableOpacity>
  )
}
