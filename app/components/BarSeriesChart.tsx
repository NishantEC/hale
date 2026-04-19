import { useMemo } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"
import { Bar, CartesianChart } from "victory-native"

import { Text } from "@/components/Text"

type Point = {
  timestamp: string
  value: number
}

type BarSeriesChartProps = {
  points: Point[]
  width: number
  height?: number
  fill?: string
  referenceValue?: number
  emptyLabel?: string
}

const CHART_PADDING = { left: 12, right: 12, top: 12, bottom: 12 }

export function BarSeriesChart({
  points,
  width,
  height = 120,
  fill,
  referenceValue,
  emptyLabel = "No chart data",
}: BarSeriesChartProps) {
  const colors = { tint: "#C76542", textMuted: "rgba(255,255,255,0.6)" }
  const resolvedFill = fill ?? colors.tint

  const chartData = useMemo(
    () => points.map((point, index) => ({ x: index, value: point.value, timestamp: point.timestamp })),
    [points],
  )

  const referenceLineTop = useMemo(() => {
    if (referenceValue == null || chartData.length === 0) return null
    const max = Math.max(...chartData.map((point) => point.value), referenceValue, 1)
    const innerHeight = Math.max(1, height - CHART_PADDING.top - CHART_PADDING.bottom)
    return CHART_PADDING.top + innerHeight - (referenceValue / max) * innerHeight
  }, [chartData, height, referenceValue])

  if (chartData.length === 0) {
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
        domain={{ y: [0] }}
        axisOptions={{
          lineColor: "transparent",
          labelColor: "transparent",
          tickCount: 0,
        }}
      >
        {({ points, chartBounds }) => (
          <Bar
            points={points.value}
            chartBounds={chartBounds}
            color={resolvedFill}
            roundedCorners={{ topLeft: 4, topRight: 4 }}
            innerPadding={0.35}
          />
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
