import { FC, useCallback } from "react"
import { ActionSheetIOS, Platform, TouchableOpacity, ViewStyle } from "react-native"
import { Plus } from "phosphor-react-native"

import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

export type QuickLogAction = "activity" | "journal" | "bedtime" | "session"

export const ComposeButton: FC<{ onSelect: (action: QuickLogAction) => void }> = ({
  onSelect,
}) => {
  const colors = LOCAL_THEME.colors

  const open = useCallback(() => {
    const labels = ["Add activity", "Journal", "Bedtime", "Start session", "Cancel"]
    const actions: QuickLogAction[] = ["activity", "journal", "bedtime", "session"]
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: 4,
          userInterfaceStyle: "dark",
        },
        (idx) => {
          if (idx >= 0 && idx < actions.length) onSelect(actions[idx])
        },
      )
      return
    }
    onSelect("journal")
  }, [onSelect])

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Quick log"
      style={themed($composeButton)}
      onPress={open}
    >
      <Plus size={18} color={colors.text} />
    </TouchableOpacity>
  )
}

const $composeButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})
