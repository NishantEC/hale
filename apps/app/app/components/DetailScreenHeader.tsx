import { FC, ReactNode } from "react"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { useNavigation } from "@react-navigation/native"
import { TouchableOpacity } from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"
import { XStack, YStack, Paragraph } from "./tamagui-primitives"

type DetailScreenHeaderProps = {
  title: string
  subtitle?: string | null
  /** Optional element rendered on the right side (e.g. an icon button). */
  rightAction?: ReactNode
}

export const DetailScreenHeader: FC<DetailScreenHeaderProps> = ({ title, subtitle, rightAction }) => {
  const navigation = useNavigation<any>()
  const colors = LOCAL_THEME.colors

  const handleBack = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack()
      return
    }
    router.replace("/(app)/(tabs)")
  }

  return (
    <XStack alignItems="center" justifyContent="space-between" minHeight={56} marginBottom={12}>
      <TouchableOpacity activeOpacity={0.85} onPress={handleBack}>
        <XStack
          alignItems="center"
          justifyContent="center"
          width={36}
          height={36}
          borderRadius={18}
          borderWidth={1}
          backgroundColor={colors.surfaceCard}
          borderColor={colors.surfaceCardBorder}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </XStack>
      </TouchableOpacity>
      <YStack flex={1} alignItems="center" gap={2}>
        <Paragraph fontWeight="600" color={colors.text}>{title}</Paragraph>
        {subtitle ? (
          <Paragraph fontSize={12} color={colors.textDim}>
            {subtitle}
          </Paragraph>
        ) : null}
      </YStack>
      {rightAction ?? <XStack width={36} />}
    </XStack>
  )
}
