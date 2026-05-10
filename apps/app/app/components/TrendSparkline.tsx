import { View } from "react-native"
import Svg, { Polyline, Circle } from "react-native-svg"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type TrendPoint = { date: string; value: number | null }

export type TrendSparklineProps = {
  label: string
  averageLabel?: string
  points: TrendPoint[]
  currentDate: string
  color?: string
  onPressPoint?: (date: string) => void
}

const W = 200
const H = 28

export function TrendSparkline({ label, averageLabel, points, currentDate, color, onPressPoint }: TrendSparklineProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const stroke = color ?? "#3FB1E7"

  const finite = points.filter((p): p is { date: string; value: number } => p.value != null && Number.isFinite(p.value))
  if (finite.length < 3) {
    return (
      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text text={label} size="xs" style={{ color: colors.textDim }} />
          <Text text="Need 3+ nights" size="xxs" style={{ color: colors.textMuted }} />
        </View>
      </View>
    )
  }

  const min = Math.min(...finite.map((p) => p.value))
  const max = Math.max(...finite.map((p) => p.value))
  const range = max - min || 1
  const step = W / Math.max(finite.length - 1, 1)
  const coords = finite.map((p, i) => ({
    x: i * step,
    y: H - ((p.value - min) / range) * (H - 6) - 3,
    date: p.date,
  }))
  const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(" ")
  const current = coords.find((c) => c.date === currentDate) ?? coords[coords.length - 1]

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text text={label} size="xs" style={{ color: colors.textDim }} />
        {averageLabel ? <Text text={averageLabel} size="xs" style={{ color: colors.text }} /> : null}
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 4 }}>
        <Polyline points={polyPoints} fill="none" stroke={stroke} strokeWidth={1.5} />
        <Circle cx={current.x} cy={current.y} r={3} fill="#ffa42b" onPress={() => onPressPoint?.(current.date)} />
      </Svg>
    </View>
  )
}
