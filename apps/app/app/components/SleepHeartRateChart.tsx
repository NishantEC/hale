import { useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Rect } from "react-native-svg"

import { InlineLineChart } from "@/components/InlineLineChart"

type Sample = {
  timestamp: string
  value: number
}

type Epoch = {
  timestamp: string
  stage: string
}

type SleepHeartRateChartProps = {
  samples: Sample[]
  epochs: Epoch[]
  width: number
  height?: number
}

const STAGE_COLORS: Record<string, string> = {
  awake: "rgba(142,142,147,0.16)",
  light: "rgba(128,102,230,0.14)",
  core: "rgba(128,102,230,0.14)",
  deep: "rgba(217,77,128,0.14)",
  rem: "rgba(179,51,204,0.14)",
}

export function SleepHeartRateChart({
  samples,
  epochs,
  width,
  height = 168,
}: SleepHeartRateChartProps) {
  const colors = { tint: "#C76542" }

  const overlays = useMemo(() => {
    if (epochs.length === 0) return []
    const segmentWidth = width / epochs.length
    return epochs.map((epoch, index) => ({
      x: index * segmentWidth,
      width: Math.max(1, segmentWidth),
      color: STAGE_COLORS[epoch.stage.toLowerCase()] ?? "rgba(255,255,255,0.05)",
    }))
  }, [epochs, width])

  return (
    <View style={[styles.wrap, { width, height }]}>
      {overlays.length > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
          {overlays.map((overlay, index) => (
            <Rect
              key={`${overlay.x}-${index}`}
              x={overlay.x}
              y={0}
              width={overlay.width}
              height={height}
              fill={overlay.color}
            />
          ))}
        </Svg>
      ) : null}

      <InlineLineChart
        points={samples}
        width={width}
        height={height}
        stroke={colors.tint}
        emptyLabel="No heart rate data"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: "hidden",
  },
})
