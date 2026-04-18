import { FC, ReactNode } from "react"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { useNavigation } from "@react-navigation/native"
import { TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type DetailScreenHeaderProps = {
  title: string
  subtitle?: string | null
  /** Optional element rendered on the right side (e.g. an icon button). */
  rightAction?: ReactNode
}

export const DetailScreenHeader: FC<DetailScreenHeaderProps> = ({ title, subtitle, rightAction }) => {
  const navigation = useNavigation<any>()
  const { themed, theme: { colors } } = useAppTheme()

  const handleBack = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack()
      return
    }
    router.replace("/(app)/(tabs)")
  }

  return (
    <View style={themed($container)}>
      <TouchableOpacity activeOpacity={0.85} onPress={handleBack} style={themed($backButton)}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <View style={themed($copyBlock)}>
        <Text text={title} size="sm" weight="semiBold" style={themed($title)} />
        {subtitle ? <Text text={subtitle} size="xs" style={themed($subtitle)} /> : null}
      </View>
      {rightAction ?? <View style={themed($spacer)} />}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 56,
  marginBottom: 12,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceSubtle,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 18,
  borderWidth: 1,
  height: 36,
  justifyContent: "center",
  width: 36,
})

const $copyBlock: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
  alignItems: "center",
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $spacer: ThemedStyle<ViewStyle> = () => ({
  width: 36,
})
