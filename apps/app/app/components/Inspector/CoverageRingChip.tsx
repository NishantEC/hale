import { FC } from "react"
import { View, ViewStyle } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { coverageChipState } from "./selectors"

type Props = { percent: number }

const RADIUS = 17
const STROKE = 4
const CIRC = 2 * Math.PI * RADIUS

export const CoverageRingChip: FC<Props> = ({ percent }) => {
  const { colors } = LOCAL_THEME
  const state = coverageChipState({ percent })
  const strokeColor =
    state.color === "green" ? "#86efac" : state.color === "amber" ? "#fcd34d" : "#fca5a5"
  const dashOffset = CIRC - (CIRC * Math.min(100, Math.max(0, percent))) / 100

  return (
    <View
      style={[
        $wrap,
        { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
      ]}
    >
      <View style={$ringWrap}>
        <Svg width={42} height={42}>
          <Circle cx={21} cy={21} r={RADIUS} stroke="#1f1f1f" strokeWidth={STROKE} fill="none" />
          <Circle
            cx={21}
            cy={21}
            r={RADIUS}
            stroke={strokeColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={dashOffset}
            fill="none"
            transform="rotate(-90 21 21)"
          />
        </Svg>
        <Text
          text={`${Math.round(percent)}%`}
          size="xxs"
          weight="semiBold"
          style={[$pct, { color: colors.text }]}
        />
      </View>
      <Text text="Coverage" size="xxs" style={[$name, { color: colors.textDim }]} />
    </View>
  )
}

const $wrap: ViewStyle = {
  flex: 1,
  borderRadius: 14,
  borderWidth: 1,
  paddingVertical: 10,
  paddingHorizontal: 4,
  alignItems: "center",
  gap: 3,
  minHeight: 92,
}

const $ringWrap: ViewStyle = { position: "relative", width: 42, height: 42 }

const $pct = {
  position: "absolute" as const,
  top: 13,
  left: 0,
  right: 0,
  textAlign: "center" as const,
}

const $name = { textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 }
