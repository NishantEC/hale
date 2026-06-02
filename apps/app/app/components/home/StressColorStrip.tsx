import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { scoreToZone } from "@/utils/stressZone"

type Props = {
  /** Array of stress scores (0–3) or null for future / no-data cells. */
  cells: Array<number | null>
  /** Position of the "now" tick as a percentage (0–100). null hides the tick. */
  nowPercent?: number | null
  /** Axis labels rendered under the strip. Length must be 2 or more. */
  axisLabels?: string[]
  /** Strip height. Default 10. */
  height?: number
  /** Tap handler — receives the tapped cell index (enables scrubbing). */
  onSelectCell?: (index: number) => void
  /** Index of the currently-selected cell to mark. */
  selectedIndex?: number | null
}

export const StressColorStrip: FC<Props> = ({
  cells,
  nowPercent = null,
  axisLabels,
  height = 10,
  onSelectCell,
  selectedIndex = null,
}) => {
  const { colors } = LOCAL_THEME

  return (
    <View>
      <View style={[styles.strip, { height, backgroundColor: colors.surfaceElevated }]}>
        {cells.map((score, i) =>
          onSelectCell ? (
            <Pressable
              key={i}
              style={[styles.cell, { backgroundColor: cellColor(score) }]}
              onPress={() => onSelectCell(i)}
            />
          ) : (
            <View key={i} style={[styles.cell, { backgroundColor: cellColor(score) }]} />
          ),
        )}
        {nowPercent != null ? (
          <View
            style={[
              styles.tick,
              { left: `${Math.max(0, Math.min(100, nowPercent))}%` },
            ]}
          />
        ) : null}
        {selectedIndex != null && selectedIndex >= 0 && selectedIndex < cells.length ? (
          <View
            style={[styles.selTick, { left: `${((selectedIndex + 0.5) / cells.length) * 100}%` }]}
          />
        ) : null}
      </View>
      {axisLabels ? (
        <View style={styles.axis}>
          {axisLabels.map((label, i) => (
            <Text
              key={i}
              text={label}
              style={{ color: colors.textMuted, fontSize: 10 }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function cellColor(score: number | null): string {
  if (score == null) return "transparent"
  const zone = scoreToZone(score)
  if (zone === "Calm") return "rgba(83,157,245,0.6)"
  if (zone === "Moderate") return "rgba(255,164,43,0.7)"
  if (zone === "High") return "rgba(243,114,127,0.75)"
  return "transparent"
}

const styles = StyleSheet.create({
  strip: {
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
    position: "relative",
  } as ViewStyle,
  cell: { flex: 1 } as ViewStyle,
  tick: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  } as ViewStyle,
  selTick: {
    position: "absolute",
    top: -3,
    bottom: -3,
    width: 3,
    marginLeft: -1.5,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.45)",
  } as ViewStyle,
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  } as ViewStyle,
})
