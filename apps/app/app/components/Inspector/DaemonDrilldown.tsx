import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  visible: boolean
  ticks: number
  skippedBusy: number
  skippedDisconnected: number
  intervalMs: number
  running: boolean
}

export const DaemonDrilldown: FC<Props> = ({
  visible,
  ticks,
  skippedBusy,
  skippedDisconnected,
  intervalMs,
  running,
}) => {
  const { colors } = LOCAL_THEME
  if (!visible) return null
  return (
    <View
      style={[
        $wrap,
        { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceElevated },
      ]}
    >
      <Stat label={running ? "ticks" : "ticks (last run)"} value={String(ticks)} />
      <Stat label="skip busy" value={String(skippedBusy)} />
      <Stat label="skip disc." value={String(skippedDisconnected)} />
      <Stat label="interval" value={`${Math.round(intervalMs / 1000)}s`} />
    </View>
  )
}

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text text={value} size="sm" weight="semiBold" style={{ color: colors.text }} />
      <Text
        text={label}
        size="xxs"
        style={{ color: colors.textDim, textTransform: "uppercase" }}
      />
    </View>
  )
}

const $wrap: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingHorizontal: 10,
  paddingVertical: 8,
  marginTop: 6,
  marginBottom: 12,
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "dashed",
}
