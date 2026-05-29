import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type NumBlockDirection = "up" | "down" | "flat"

type Props = {
  label: string
  value: string
  unit?: string
  baseline: string
  deltaText: string | null
  direction: NumBlockDirection
}

export const NumBlock: FC<Props> = ({
  label,
  value,
  unit,
  baseline,
  deltaText,
  direction,
}) => {
  const { colors } = LOCAL_THEME
  const deltaColor =
    direction === "up"
      ? colors.statusGreen
      : direction === "down"
        ? colors.statusRed
        : colors.textMuted

  return (
    <View style={$row}>
      <Text
        text={label}
        style={{
          color: colors.textDim,
          fontSize: 13,
          fontWeight: "600",
          flex: 1,
        }}
      />
      <View style={$valueGroup}>
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "800",
            letterSpacing: -0.3,
            fontVariant: ["tabular-nums"],
          }}
        />
        {unit ? (
          <Text
            text={unit}
            style={{
              color: colors.textDim,
              fontSize: 11,
              marginLeft: 2,
              fontVariant: ["tabular-nums"],
            }}
          />
        ) : null}
      </View>
      <View style={$baselineGroup}>
        <Text
          text={baseline}
          style={{
            color: colors.textMuted,
            fontSize: 12,
            fontVariant: ["tabular-nums"],
          }}
        />
        {deltaText ? (
          <Text
            text={deltaText}
            style={{
              color: deltaColor,
              fontSize: 11,
              fontWeight: "600",
              marginTop: 1,
              fontVariant: ["tabular-nums"],
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 10,
}

const $valueGroup: ViewStyle = {
  flexDirection: "row",
  alignItems: "baseline",
  width: 72,
  justifyContent: "flex-end",
}

const $baselineGroup: ViewStyle = {
  width: 80,
  alignItems: "flex-end",
  marginLeft: 12,
}
