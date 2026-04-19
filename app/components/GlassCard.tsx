import { PropsWithChildren } from "react"
import { TouchableOpacity, ViewStyle, type StyleProp } from "react-native"
import { YStack } from "./tamagui-primitives"

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  disabled?: boolean
}>

export function GlassCard({ children, style, onPress, disabled }: GlassCardProps) {
  const content = (
    <YStack
      backgroundColor="rgba(255,255,255,0.05)"
      borderColor="rgba(255,255,255,0.08)"
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
