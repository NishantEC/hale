import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import Svg, { Polyline } from "react-native-svg"
import { CaretRight } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  title: string
  value: string
  caption: string
  points: number[]
  tint: string
  onPress?: () => void
}

export const TrendCard: FC<Props> = ({ title, value, caption, points, tint, onPress }) => {
  const { colors } = LOCAL_THEME
  const sparkPoints = sparklinePolyline(points)

  const content = (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <View style={$head}>
        <Text
          text={title.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            flex: 1,
          }}
        />
        {onPress ? <CaretRight size={13} color={colors.textMuted} /> : null}
      </View>
      <View style={$body}>
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 28,
            fontWeight: "800",
            letterSpacing: -0.6,
            fontVariant: ["tabular-nums"],
          }}
        />
        {sparkPoints ? (
          <Svg viewBox="0 0 100 40" width={100} height={36} preserveAspectRatio="none">
            <Polyline
              points={sparkPoints}
              fill="none"
              stroke={tint}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text
        text={caption}
        style={{
          color: colors.textMuted,
          fontSize: 12,
          marginTop: 6,
        }}
      />
    </View>
  )
  if (!onPress) return content
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
  )
}

function sparklinePolyline(points: number[]): string | null {
  const valid = points.filter((p) => Number.isFinite(p))
  if (valid.length < 2) return null
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const span = max - min || 1
  const step = 100 / Math.max(1, valid.length - 1)
  return valid
    .map((p, i) => {
      const x = i * step
      const y = 40 - ((p - min) / span) * 36 - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

const $card: ViewStyle = {
  borderRadius: 14,
  padding: 14,
}

const $head: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
}

const $body: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
}
