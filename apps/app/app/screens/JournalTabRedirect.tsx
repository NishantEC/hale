import { useCallback } from "react"
import { View } from "react-native"
import { router, useFocusEffect } from "expo-router"

import { LOCAL_THEME } from "@/utils/localTheme"

/**
 * NativeTabs in expo-router fire tab presses with `canPreventDefault: false`,
 * so we can't intercept the press and open a modal in place. Instead this
 * route is a "phantom" tab — it renders nothing, and on focus it bounces back
 * to the Home tab while pushing the journal-entry modal on top. The user sees
 * the modal open over Home (not over an empty Journal tab), and when they
 * dismiss the modal they land on Home as expected.
 */
export const JournalTabRedirect = () => {
  const colors = LOCAL_THEME.colors

  useFocusEffect(
    useCallback(() => {
      // Switch back to the Home tab first so the modal slides up over it.
      router.navigate("/(tabs)/")
      // Then push the modal.
      router.push("/journal-entry" as never)
    }, []),
  )

  return <View style={{ flex: 1, backgroundColor: colors.background }} />
}
