import { FC } from "react"
import { TouchableOpacity, View, ViewStyle } from "react-native"
import { ArrowsLeftRight, ArrowClockwise } from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  isSyncing: boolean
  onSync: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

export const ActionsRow: FC<Props> = ({ isSyncing, onSync, onRefresh }) => {
  return (
    <View style={$row}>
      <ActBtn
        icon={ArrowsLeftRight}
        label={isSyncing ? "Syncing" : "Sync"}
        disabled={isSyncing}
        onPress={onSync}
      />
      <ActBtn icon={ArrowClockwise} label="Refresh" onPress={onRefresh} />
    </View>
  )
}

const ActBtn: FC<{
  icon: PhosphorIcon
  label: string
  disabled?: boolean
  onPress: () => void | Promise<void>
}> = ({ icon: Icon, label, disabled, onPress }) => {
  const { colors } = LOCAL_THEME
  return (
    <TouchableOpacity
      style={[
        $btn,
        { backgroundColor: colors.surfaceElevated },
        disabled ? { opacity: 0.4 } : null,
      ]}
      disabled={disabled}
      onPress={() => void onPress()}
      activeOpacity={0.7}
    >
      <Icon size={18} color={colors.text} weight="regular" />
      <Text text={label} size="xxs" style={{ color: colors.text }} />
    </TouchableOpacity>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 6 }
const $btn: ViewStyle = {
  flex: 1,
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 4,
}
