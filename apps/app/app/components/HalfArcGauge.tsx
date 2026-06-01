import { FC } from "react"
import { View } from "react-native"
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg"

import { LOCAL_THEME } from "@/utils/localTheme"

export type GaugeBand = { from: number; to: number; color: string }

type Props = {
  /** 0–100, drives the needle position. null when there's no reading. */
  value: number | null
  bands: GaugeBand[]
  /** Needle + value-number colour. */
  tint: string
  /** Optional centre-number override (e.g. a 0–21 strain value). */
  display?: string
}

const W = 220
const H = 124
const CX = W / 2
const CY = 110
const R = 88
const STROKE = 16

// value 0 → left end (180°), value 100 → right end (0°), sweeping over the top.
function pointFor(value: number, radius: number) {
  const v = Math.max(0, Math.min(100, value))
  const angle = Math.PI * (1 - v / 100)
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) }
}

function arc(from: number, to: number, radius: number): string {
  const a = pointFor(from, radius)
  const b = pointFor(to, radius)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

export const HalfArcGauge: FC<Props> = ({ value, bands, tint, display }) => {
  const { colors } = LOCAL_THEME
  const clamped = value == null ? null : Math.max(0, Math.min(100, value))
  const needle = clamped == null ? null : pointFor(clamped, R - STROKE / 2 - 6)

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path
          d={arc(0, 100, R)}
          stroke={colors.surfaceElevated}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
        />
        {bands.map((band, i) => (
          <Path
            key={`${band.from}-${band.to}-${i}`}
            d={arc(band.from, band.to, R)}
            stroke={band.color}
            strokeWidth={STROKE}
            fill="none"
            opacity={clamped != null && clamped >= band.from && clamped <= band.to ? 1 : 0.3}
          />
        ))}
        {needle ? (
          <G>
            <Path
              d={`M ${CX} ${CY} L ${needle.x.toFixed(2)} ${needle.y.toFixed(2)}`}
              stroke={tint}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
            <Circle cx={CX} cy={CY} r={6} fill={tint} />
          </G>
        ) : null}
        <SvgText
          x={CX}
          y={CY - 16}
          fontSize={36}
          fontWeight="800"
          fill={tint}
          textAnchor="middle"
        >
          {display ?? (clamped == null ? "--" : `${Math.round(clamped)}`)}
        </SvgText>
      </Svg>
    </View>
  )
}
