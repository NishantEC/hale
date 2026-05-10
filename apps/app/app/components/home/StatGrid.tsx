import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { StatTile } from "./StatTile"

export type StatGridItem = {
  key: string
  label: string
  value: string
  desc?: string
  tint: string
  onPress?: () => void
}

type Props = {
  items: StatGridItem[]
}

/**
 * Renders a 2×2 grid. Expects exactly 4 items; fewer/more still render
 * but layout assumes 4.
 */
export const StatGrid: FC<Props> = ({ items }) => {
  const rows: StatGridItem[][] = [items.slice(0, 2), items.slice(2, 4)]
  return (
    <View style={$grid}>
      {rows.map((row, i) => (
        <View key={`row-${i}`} style={$row}>
          {row.map((item) => (
            <StatTile
              key={item.key}
              label={item.label}
              value={item.value}
              desc={item.desc}
              tint={item.tint}
              onPress={item.onPress}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

const $grid: ViewStyle = {
  gap: 8,
}

const $row: ViewStyle = {
  flexDirection: "row",
  gap: 8,
}
