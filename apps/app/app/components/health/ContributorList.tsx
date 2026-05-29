import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import { NumBlock, NumBlockDirection } from "./NumBlock"

export type ContributorItem = {
  key: string
  label: string
  value: string
  unit?: string
  baseline: string
  deltaText: string | null
  direction: NumBlockDirection
}

type Props = {
  title: string
  items: ContributorItem[]
}

export const ContributorList: FC<Props> = ({ title, items }) => {
  const { colors } = LOCAL_THEME

  return (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text={title.toUpperCase()}
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
          marginBottom: 4,
        }}
      />
      {items.map((item, i) => (
        <View
          key={item.key}
          style={
            i > 0
              ? {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.surfaceElevated,
                }
              : null
          }
        >
          <NumBlock
            label={item.label}
            value={item.value}
            unit={item.unit}
            baseline={item.baseline}
            deltaText={item.deltaText}
            direction={item.direction}
          />
        </View>
      ))}
    </View>
  )
}

const $card: ViewStyle = {
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
}
