import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { StatTile } from "@/components/home/StatTile"

export type VitalsGridItem = {
  key: string
  label: string
  value: string
  desc?: string
  tint: string
  onPress?: () => void
}

type Props = {
  items: VitalsGridItem[]
  columns?: number
}

export const VitalsGrid: FC<Props> = ({ items, columns = 3 }) => {
  const rows: VitalsGridItem[][] = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns))
  }
  return (
    <View style={$grid}>
      {rows.map((row, i) => (
        <View key={`vitals-row-${i}`} style={$row}>
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
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, j) => (
                <View key={`spacer-${i}-${j}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  )
}

const $grid: ViewStyle = { gap: 8 }
const $row: ViewStyle = { flexDirection: "row", gap: 8 }
