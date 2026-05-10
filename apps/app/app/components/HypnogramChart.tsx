import React, { useCallback, useMemo, useState } from "react"
import { View, StyleSheet, Text as RNText, type LayoutChangeEvent } from "react-native"
import Svg, { Path, Defs, LinearGradient, Stop, Rect as SvgRect } from "react-native-svg"
import MaskedView from "@react-native-masked-view/masked-view"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate as reanimatedInterpolate,
  Extrapolation,
} from "react-native-reanimated"
import { Gesture, GestureDetector } from "react-native-gesture-handler"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

// ── Types ───────────────────────────────────────────────────

type Epoch = { timestamp: string; stage: string }

type HypnogramChartProps = {
  epochs: Epoch[]
  width: number
  bedtimeLabel?: string
  wakeTimeLabel?: string
}

// ── Stage config (same colours as reference repo) ───────────

const SleepStage: Record<string, { position: number; label: string; color: string }> = {
  awake: { position: 0, label: "Awake", color: "#FE8A73" },
  rem:   { position: 1, label: "REM",   color: "#3FB1E7" },
  core:  { position: 2, label: "Core",  color: "#1B81FE" },
  light: { position: 2, label: "Core",  color: "#1B81FE" },
  deep:  { position: 3, label: "Deep",  color: "#403EA7" },
}

const STAGE_KEYS = ["awake", "rem", "core", "deep"] as const
const LANE_COUNT = STAGE_KEYS.length

// ── Layout constants (mirroring reference theme.ts) ─────────

const CHART_HEIGHT = 200
const BORDER_WIDTH = 2
const ROW_HEIGHT = (CHART_HEIGHT - 16) / LANE_COUNT
const BAR_HEIGHT = ROW_HEIGHT * 0.45
const BAR_TOP_OFFSET = BAR_HEIGHT * 0.8
const LABEL_COLUMN_WIDTH = 0

// ── Helpers ─────────────────────────────────────────────────

type Segment = {
  id: number
  type: string
  fromMin: number
  toMin: number
}

function epochsToSegments(epochs: Epoch[]): Segment[] {
  if (!epochs.length) return []
  const segments: Segment[] = []
  let cur = normaliseStage(epochs[0].stage)
  let start = 0
  for (let i = 1; i < epochs.length; i++) {
    const s = normaliseStage(epochs[i].stage)
    if (s !== cur) {
      segments.push({ id: segments.length, type: cur, fromMin: start, toMin: i })
      cur = s
      start = i
    }
  }
  segments.push({ id: segments.length, type: cur, fromMin: start, toMin: epochs.length })
  return segments
}

function normaliseStage(raw: string): string {
  const k = raw.toLowerCase()
  if (k === "light") return "core"
  if (k in SleepStage) return k
  return "core"
}

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = d.getHours()
  const mm = d.getMinutes()
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = hh % 12 || 12
  return `${h12}:${mm.toString().padStart(2, "0")}${ampm}`
}

// ── Corner SVG paths (same as reference) ────────────────────

const RoundCornerSVGPathTp = "M6 7V15H5C5 15 5.30874 11.8133 4.02284 10.107C2.73695 8.40073 0 8 0 8V7H6Z"
const RoundCornerSVGPathBt = "M6 8V0H5C5 0 5.28401 3.15824 4 5C2.71599 6.84176 0 7 0 7V8H6Z"

const CornerSVG = () => (
  <Svg width={6} height={15}>
    <Path d={RoundCornerSVGPathTp} fill="black" />
    <Path d={RoundCornerSVGPathBt} fill="black" />
  </Svg>
)

// ── Gradient (same as reference) ────────────────────────────

const GradientFill = React.memo(({ chartWidth }: { chartWidth: number }) => (
  <Svg width={chartWidth} height={CHART_HEIGHT}>
    <Defs>
      <LinearGradient x1={0} y1={0.2} x2={0} y2={0.95} id="grad">
        {STAGE_KEYS.map((key) => (
          <Stop
            key={key}
            offset={SleepStage[key].position / LANE_COUNT}
            stopColor={SleepStage[key].color}
            stopOpacity={0.3}
          />
        ))}
      </LinearGradient>
    </Defs>
    <SvgRect x={0} y={0} fill="url(#grad)" width={chartWidth} height={CHART_HEIGHT} />
  </Svg>
))

// ── Cursor card ─────────────────────────────────────────────

type CursorData = {
  segment: Segment
  durationMin: number
  fromTime: string
  toTime: string
}

type CursorOverlayProps = {
  panX: { value: number }
  opacity: { value: number }
  minPanX: number
  maxPanX: number
  chartWidth: number
}

const CursorOverlay = React.forwardRef<
  { setData: (d: CursorData) => void },
  CursorOverlayProps
>(({ panX, opacity, minPanX, maxPanX, chartWidth }, ref) => {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const [data, setData] = useState<CursorData | null>(null)
  const cardLayout = useSharedValue({ width: 0, height: 0 })

  const onCardLayout = (event: LayoutChangeEvent) => {
    cardLayout.value = event.nativeEvent.layout
  }

  React.useImperativeHandle(ref, () => ({
    setData: (newData: CursorData) => {
      if (newData.segment.id !== data?.segment.id) {
        setData(newData)
      }
    },
  }), [data])

  const barAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: reanimatedInterpolate(panX.value, [minPanX, maxPanX], [minPanX, maxPanX], Extrapolation.CLAMP) }],
    opacity: opacity.value,
  }), [minPanX, maxPanX])

  const cardAnimation = useAnimatedStyle(() => ({
    transform: [{
      translateX: reanimatedInterpolate(
        panX.value - (cardLayout.value.width / 2),
        [0, chartWidth - cardLayout.value.width],
        [0, chartWidth - cardLayout.value.width],
        Extrapolation.CLAMP,
      ),
    }],
    opacity: opacity.value,
    top: -cardLayout.value.height - 4,
  }), [chartWidth])

  if (!data) return null

  const label = data.segment.type === "awake"
    ? "AWAKE"
    : `${SleepStage[data.segment.type]?.label ?? "Sleep"} sleep`.toUpperCase()

  return (
    <>
      <Animated.View
        pointerEvents="none"
        onLayout={onCardLayout}
        style={[styles.cursorCard, { backgroundColor: colors.cardBase, borderColor: colors.surfaceCardBorder }, cardAnimation]}
      >
        <RNText style={[styles.cursorLabel, { color: colors.textDim }]}>{label}</RNText>
        <RNText style={[styles.cursorLabel, { color: colors.textDim }]}>
          <RNText style={[styles.cursorDuration, { color: colors.text }]}>{data.durationMin}</RNText>
          {" min"}
        </RNText>
        <RNText style={[styles.cursorLabel, { color: colors.textDim }]}>
          {data.fromTime} – {data.toTime}
        </RNText>
      </Animated.View>

      <Animated.View style={[styles.cursorBar, { backgroundColor: colors.textMuted }, barAnimation]} />
    </>
  )
})

// ── Main component ──────────────────────────────────────────

export function HypnogramChart({ epochs, width, bedtimeLabel, wakeTimeLabel }: HypnogramChartProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const chartWidth = width
  const drawWidth = Math.max(0, chartWidth - LABEL_COLUMN_WIDTH)

  const segments = useMemo(() => epochsToSegments(epochs), [epochs])
  const totalMinutes = epochs.length

  const stageDurations = useMemo(() => {
    const c: Record<string, number> = { awake: 0, rem: 0, core: 0, deep: 0 }
    for (const seg of segments) {
      c[seg.type] = (c[seg.type] ?? 0) + (seg.toMin - seg.fromMin)
    }
    return c
  }, [segments])

  // ── Cursor state ────────────────────────────────────────────
  const cursorRef = React.useRef<{ setData: (d: CursorData) => void }>(null)
  const panX = useSharedValue(0)
  const cursorOpacity = useSharedValue(0)

  // Min/max pan positions (leftmost / rightmost segment edges)
  const minPanX = segments.length > 0
    ? lerp(segments[0].fromMin, 0, totalMinutes, 0, drawWidth)
    : 0
  const maxPanX = segments.length > 0
    ? lerp(segments[segments.length - 1].toMin, 0, totalMinutes, 0, drawWidth)
    : drawWidth

  const seekSegment = useCallback((x: number) => {
    // Map x position back to minutes
    const minute = lerp(x, 0, drawWidth, 0, totalMinutes)

    // Find segment containing this minute
    const segment = segments.find(s => minute >= s.fromMin && minute < s.toMin)
      ?? (minute <= segments[0]?.fromMin ? segments[0] : segments[segments.length - 1])

    if (!segment) return

    const durationMin = segment.toMin - segment.fromMin
    const fromTime = epochs[segment.fromMin] ? formatTime(epochs[segment.fromMin].timestamp) : ""
    const toTime = epochs[Math.min(segment.toMin, epochs.length - 1)]
      ? formatTime(epochs[Math.min(segment.toMin, epochs.length - 1)].timestamp)
      : ""

    cursorRef.current?.setData({ segment, durationMin, fromTime, toTime })
  }, [segments, totalMinutes, drawWidth, epochs])

  const gesture = Gesture.Pan()
    .onBegin((event) => {
      "worklet"
      panX.value = event.x
      cursorOpacity.value = withTiming(1)
      runOnJS(seekSegment)(event.x)
    })
    .onChange((event) => {
      "worklet"
      runOnJS(seekSegment)(event.x)
      panX.value = withSpring(event.x, { mass: 0.5, damping: 18, stiffness: 300 })
    })
    .onTouchesUp(() => {
      "worklet"
      cursorOpacity.value = withTiming(0)
    })
    .onEnd(() => {
      "worklet"
      cursorOpacity.value = withTiming(0)
    })

  if (!segments.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text text="No sleep stage timeline" size="xs" style={{ color: colors.textMuted }} />
      </View>
    )
  }

  // ── Underlay mask elements (bubbles + connectors) ─────────
  const underlayElements = segments.map((item, index) => {
    const topOffset = SleepStage[item.type].position * ROW_HEIGHT + BAR_TOP_OFFSET
    const leftOffset = lerp(item.fromMin, 0, totalMinutes, 0, drawWidth) - BORDER_WIDTH
    const barWidth = lerp(item.toMin - item.fromMin, 0, totalMinutes, 0, drawWidth) + BORDER_WIDTH

    const prev = index > 0 ? segments[index - 1] : null
    const next = index < segments.length - 1 ? segments[index + 1] : null

    const leftLinkHeight = prev
      ? (ROW_HEIGHT - BAR_HEIGHT) * Math.abs(SleepStage[item.type].position - SleepStage[prev.type].position)
      : 0

    const rightLinkHeight = next
      ? (ROW_HEIGHT - BAR_HEIGHT) * Math.abs(SleepStage[item.type].position - SleepStage[next.type].position)
      : 0

    return (
      <React.Fragment key={item.id}>
        <View style={{ top: topOffset, left: leftOffset, width: barWidth, position: "absolute" }}>
          <View style={styles.bubble} />
        </View>

        {prev && prev.type !== item.type && (
          <>
            <View
              style={[styles.connectorLine, {
                left: leftOffset,
                height: leftLinkHeight,
                top: SleepStage[prev.type].position > SleepStage[item.type].position
                  ? topOffset + BAR_HEIGHT / 2
                  : topOffset - leftLinkHeight + BAR_HEIGHT / 2,
              }]}
            />
            <View
              style={{
                position: "absolute",
                transform: [{ rotate: "180deg" }],
                left: leftOffset + 1.3,
                opacity: barWidth > 8 ? 1 : 0,
                top: topOffset - 7.2 + (SleepStage[prev.type].position > SleepStage[item.type].position ? BAR_HEIGHT - 1 : 1),
              }}
            >
              <CornerSVG />
            </View>
          </>
        )}

        {next && next.type !== item.type && (
          <>
            <View
              style={[styles.connectorLine, {
                left: leftOffset + barWidth - BORDER_WIDTH,
                height: rightLinkHeight,
                top: SleepStage[next.type].position > SleepStage[item.type].position
                  ? topOffset + BAR_HEIGHT / 2
                  : topOffset - rightLinkHeight + BAR_HEIGHT / 2,
              }]}
            />
            <View
              style={{
                position: "absolute",
                left: leftOffset + barWidth - 7.3,
                opacity: barWidth > 8 ? 1 : 0,
                top: topOffset - 7.2 + (SleepStage[next.type].position > SleepStage[item.type].position ? BAR_HEIGHT - 1 : 1),
              }}
            >
              <CornerSVG />
            </View>
          </>
        )}
      </React.Fragment>
    )
  })

  // ── Foreground bars ───────────────────────────────────────
  const barElements = segments.map((segment, index) => {
    const top = SleepStage[segment.type].position * ROW_HEIGHT + BAR_TOP_OFFSET + BORDER_WIDTH
    const left = lerp(segment.fromMin, 0, totalMinutes, 0, drawWidth)
    const w = lerp(segment.toMin - segment.fromMin, 0, totalMinutes, 0, drawWidth) - BORDER_WIDTH

    return (
      <View
        key={`bar-${index}`}
        style={{ position: "absolute", top, left, width: w }}
      >
        <View style={[styles.bar, { backgroundColor: SleepStage[segment.type].color }]} />
      </View>
    )
  })

  // ── Axis rows ─────────────────────────────────────────────
  const axisRows = STAGE_KEYS.map((key, index) => (
    <View key={key} style={{ height: ROW_HEIGHT }}>
      {index > 0 && <View style={[styles.horizontal, { backgroundColor: colors.surfaceCardBorder }]} />}
    </View>
  ))

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.chartContainer, { width: chartWidth, height: CHART_HEIGHT, borderColor: colors.surfaceCardBorder }]}>
        {axisRows}

        <GestureDetector gesture={gesture}>
          <View
            style={{
              position: "absolute",
              left: LABEL_COLUMN_WIDTH,
              top: 0,
              width: drawWidth,
              height: CHART_HEIGHT,
            }}
          >
            <MaskedView
              style={styles.maskedView}
              maskElement={<>{underlayElements}</>}
            >
              <GradientFill chartWidth={drawWidth} />
            </MaskedView>

            {barElements}

            <CursorOverlay
              ref={cursorRef}
              panX={panX}
              opacity={cursorOpacity}
              minPanX={minPanX}
              maxPanX={maxPanX}
              chartWidth={drawWidth}
            />
          </View>
        </GestureDetector>
      </View>

      {(bedtimeLabel || wakeTimeLabel) && (
        <View style={[styles.timeAxis, { paddingLeft: LABEL_COLUMN_WIDTH + 4 }]}>
          <Text text={bedtimeLabel ?? "--"} size="xxs" style={[styles.axisText, { color: colors.textMuted }]} />
          <Text text={wakeTimeLabel ?? "--"} size="xxs" style={[styles.axisText, { color: colors.textMuted }]} />
        </View>
      )}
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  chartContainer: {
    overflow: "visible",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  maskedView: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  connectorLine: {
    width: BORDER_WIDTH,
    position: "absolute",
    backgroundColor: "black",
  },
  bubble: {
    minWidth: 4,
    height: BAR_HEIGHT,
    backgroundColor: "black",
    borderRadius: 8,
  },
  bar: {
    minWidth: 1,
    height: BAR_HEIGHT - BORDER_WIDTH * 2,
    borderRadius: 6,
  },
  horizontal: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  timeAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  axisText: {
    color: "rgba(255,255,255,0.46)",
  },
  // Cursor styles
  cursorBar: {
    width: 2.5,
    height: CHART_HEIGHT,
    position: "absolute",
    top: 0,
    backgroundColor: "rgba(255,255,255,0.30)",
    borderRadius: 1,
  },
  cursorCard: {
    position: "absolute",
    padding: 10,
    alignSelf: "baseline",
    backgroundColor: "rgba(40,40,40,0.95)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },
  cursorLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.60)",
  },
  cursorDuration: {
    fontSize: 24,
    fontWeight: "500",
    color: "rgba(255,255,255,0.95)",
  },
})
