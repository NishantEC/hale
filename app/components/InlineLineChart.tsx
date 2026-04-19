import { useMemo } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"
import { CartesianChart, Line, Scatter } from "victory-native"

import { Text } from "@/components/Text"

type Point = {
  timestamp: string
  value: number
}

type InlineLineChartProps = {
  points: Point[]
  width: number
  height?: number
  stroke?: string
  referenceValue?: number
  emptyLabel?: string
}

const CHART_PADDING = { left: 12, right: 12, top: 12, bottom: 12 }

export function InlineLineChart({
  points,
  width,
  height = 120,
  stroke,
  referenceValue,
  emptyLabel = "No chart data",
}: InlineLineChartProps) {
  const colors = { tint: "#C76542", textMuted: "rgba(255,255,255,0.6)" }
  const resolvedStroke = stroke ?? colors.tint

  const chartData = useMemo(
    () => points.map((point, index) => ({ x: index, value: point.value, timestamp: point.timestamp })),
    [points],
  )

  const referenceLineTop = useMemo(() => {
    if (referenceValue == null || chartData.length === 0) return null
    const values = chartData.map((point) => point.value)
    const min = Math.min(...values, referenceValue)
    const max = Math.max(...values, referenceValue)
    const range = Math.max(1, max - min)
    const innerHeight = Math.max(1, height - CHART_PADDING.top - CHART_PADDING.bottom)
    return (
      CHART_PADDING.top +
      innerHeight -
      ((referenceValue - min) / range) * innerHeight
    )
  }, [chartData, height, referenceValue])

  if (chartData.length < 2) {
    return (
      <View style={[$emptyWrap, { width }]}>
        <Text text={emptyLabel} size="xs" style={{ color: colors.textMuted }} />
      </View>
    )
  }

  return (
    <View style={{ width, height }}>
      {referenceLineTop != null ? (
        <View
          pointerEvents="none"
          style={[
            styles.referenceLine,
            {
              top: referenceLineTop,
              width: width - CHART_PADDING.left - CHART_PADDING.right,
              left: CHART_PADDING.left,
              borderTopColor: colors.textMuted,
            },
          ]}
        />
      ) : null}

      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={["value"]}
        padding={CHART_PADDING}
        axisOptions={{
          lineColor: "transparent",
          labelColor: "transparent",
          tickCount: 0,
        }}
      >
        {({ points }) => (
          <>
            <Line
              points={points.value}
              color={resolvedStroke}
              strokeWidth={2.5}
              curveType="natural"
            />
            <Scatter points={points.value} color={resolvedStroke} radius={2.5} />
          </>
        )}
      </CartesianChart>
    </View>
  )
}

const $emptyWrap: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 32,
}

const styles = StyleSheet.create({
  referenceLine: {
    borderTopWidth: 1,
    position: "absolute",
    zIndex: 1,
  },
})
