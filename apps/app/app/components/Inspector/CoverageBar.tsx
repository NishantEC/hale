import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  // Total minutes covered out of 1440 in a day.
  coveredMinutes: number
}

export const CoverageBar: FC<Props> = ({ coveredMinutes }) => {
  const { colors } = LOCAL_THEME
  const pct = Math.max(0, Math.min(1, coveredMinutes / 1440))
  const fillColor =
    pct >= 0.8 ? colors.statusGreen : pct >= 0.3 ? colors.statusAmber : colors.statusRed
  return (
    <View style={[$track, { backgroundColor: colors.surfaceElevated }]}>
      <View style={[$fill, { width: `${pct * 100}%`, backgroundColor: fillColor }]} />
    </View>
  )
}

const $track: ViewStyle = {
  height: 6,
  borderRadius: 3,
  overflow: "hidden",
}

const $fill: ViewStyle = {
  height: "100%",
}
