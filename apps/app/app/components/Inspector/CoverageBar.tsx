import { FC } from "react"
import { View, ViewStyle } from "react-native"

type Props = {
  // Total minutes covered out of 1440 in a day.
  coveredMinutes: number
}

const COLORS = {
  track: "rgba(0,0,0,0.08)",
  good: "#22c55e",
  warn: "#fbbf24",
  bad: "#ef4444",
}

function colorForPct(pct: number): string {
  if (pct >= 0.8) return COLORS.good
  if (pct >= 0.3) return COLORS.warn
  return COLORS.bad
}

export const CoverageBar: FC<Props> = ({ coveredMinutes }) => {
  const pct = Math.max(0, Math.min(1, coveredMinutes / 1440))
  const fillColor = colorForPct(pct)
  return (
    <View style={$track}>
      <View style={[$fill, { width: `${pct * 100}%`, backgroundColor: fillColor }]} />
    </View>
  )
}

const $track: ViewStyle = {
  height: 6,
  borderRadius: 3,
  backgroundColor: COLORS.track,
  overflow: "hidden",
}

const $fill: ViewStyle = {
  height: "100%",
}
