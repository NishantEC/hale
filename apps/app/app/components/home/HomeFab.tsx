import { FC } from "react"
import { Ionicons } from "@expo/vector-icons"
import { Platform, Pressable, ViewStyle } from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  onPress: () => void
}

export const HomeFab: FC<Props> = ({ onPress }) => {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        $fab,
        { backgroundColor: colors.tint },
        Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.5 : 0.18,
            shadowRadius: 16,
          },
          android: { elevation: 8 },
        }),
        pressed && { transform: [{ scale: 0.95 }], opacity: 0.92 },
      ]}
      accessibilityLabel="Log a journal entry"
      accessibilityRole="button"
    >
      <Ionicons name="add" size={28} color={colors.onPrimary} />
    </Pressable>
  )
}

const $fab: ViewStyle = {
  position: "absolute",
  right: 16,
  bottom: 88,
  width: 56,
  height: 56,
  borderRadius: 28,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
}
