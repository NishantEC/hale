import { FC } from "react"
import { TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"
import { Lightning, Watch } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

type Props = {
  batteryLabel: string
  isCharging: boolean
  isConnected: boolean
  onPress: () => void
}

export const DevicePill: FC<Props> = ({ batteryLabel, isCharging, isConnected, onPress }) => {
  const colors = LOCAL_THEME.colors

  return (
    <TouchableOpacity style={themed($devicePill)} onPress={onPress}>
      <View style={themed($deviceIconWrap)}>
        <Watch size={18} color={isConnected ? colors.text : colors.textDim} />
        {isCharging ? (
          <Lightning size={9} color={colors.statusGreen} style={themed($chargeBolt)} />
        ) : null}
      </View>
      <Text text={batteryLabel} size="xs" weight="bold" style={themed($devicePillText)} />
    </TouchableOpacity>
  )
}

const $devicePill: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 3,
  minHeight: 32,
  paddingHorizontal: 0,
  paddingVertical: 0,
})

const $deviceIconWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  height: 22,
  justifyContent: "center",
  position: "relative",
  width: 22,
})

const $chargeBolt: ThemedStyle<TextStyle> = () => ({
  position: "absolute",
  right: -2,
  top: -4,
})

const $devicePillText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 18,
  lineHeight: 22,
  minWidth: 34,
  textAlign: "center",
})
