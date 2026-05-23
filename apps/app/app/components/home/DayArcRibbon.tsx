import { FC, useMemo } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Line, Path, Rect } from "react-native-svg"

import { BoutCard, GapRule } from "@/components/activity"
import { Text } from "@/components/Text"
import type { DayRibbon } from "@/services/api/noopClient"
import type { TapeEvent } from "@/utils/buildTodayTape"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  events: TapeEvent[]
  dayRibbon?: DayRibbon | null
  selectedDate: string
  now: number
  onEventPress?: (event: TapeEvent) => void
}

const RIBBON_W = 1000
const RIBBON_H = 60
const DAY_MS = 24 * 60 * 60 * 1000

function dayBoundsLocal(dateKey: string): { start: number; end: number } {
  const [y, m, d] = dateKey.split("-").map(Number)
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime()
  return { start, end: start + DAY_MS }
}

function clampSegment(
  startMs: number,
  endMs: number,
  dayStart: number,
  dayEnd: number,
): { x: number; w: number } | null {
  const s = Math.max(startMs, dayStart)
  const e = Math.min(endMs, dayEnd)
  if (e <= s) return null
  const x = ((s - dayStart) / DAY_MS) * RIBBON_W
  const w = ((e - s) / DAY_MS) * RIBBON_W
  return { x, w: Math.max(2, w) }
}

function buildHrPath(
  samples: Array<{ timestamp: string; value: number }>,
  dayStart: number,
): { path: string; min: number; max: number } {
  if (samples.length < 2) return { path: "", min: 0, max: 0 }
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v))
  if (values.length < 2) return { path: "", min: 0, max: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const pad = 4
  const usableH = RIBBON_H - pad * 2
  const parts: string[] = []
  for (let i = 0; i < samples.length; i++) {
    const t = new Date(samples[i].timestamp).getTime()
    if (!Number.isFinite(t)) continue
    const v = samples[i].value
    if (!Number.isFinite(v)) continue
    const x = ((t - dayStart) / DAY_MS) * RIBBON_W
    const y = RIBBON_H - pad - ((v - min) / range) * usableH
    parts.push(`${parts.length === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return { path: parts.join(" "), min, max }
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12a"
  if (hour === 12) return "12p"
  if (hour < 12) return `${hour}a`
  return `${hour - 12}p`
}

function formatNow(now: number): string {
  const d = new Date(now)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  h = ((h + 11) % 12) + 1
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`
}

export const DayArcRibbon: FC<Props> = ({
  events,
  dayRibbon,
  selectedDate,
  now,
  onEventPress,
}) => {
  const { colors } = LOCAL_THEME
  const { start: dayStart, end: dayEnd } = useMemo(
    () => dayBoundsLocal(selectedDate),
    [selectedDate],
  )

  const sleepSeg = useMemo(() => {
    const sw = dayRibbon?.sleepWindow
    if (!sw) return null
    const b = new Date(sw.bedtime).getTime()
    const w = new Date(sw.wakeTime).getTime()
    if (!Number.isFinite(b) || !Number.isFinite(w)) return null
    return clampSegment(b, w, dayStart, dayEnd)
  }, [dayRibbon?.sleepWindow, dayStart, dayEnd])

  const activitySegs = useMemo(() => {
    const list = dayRibbon?.activities ?? []
    return list
      .map((a) => {
        const s = new Date(a.startTime).getTime()
        const e = new Date(a.endTime).getTime()
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null
        return clampSegment(s, e, dayStart, dayEnd)
      })
      .filter((x): x is { x: number; w: number } => x !== null)
  }, [dayRibbon?.activities, dayStart, dayEnd])

  const hr = useMemo(
    () => buildHrPath(dayRibbon?.hrSeries ?? [], dayStart),
    [dayRibbon?.hrSeries, dayStart],
  )

  const showNow = now >= dayStart && now < dayEnd
  const nowX = showNow ? ((now - dayStart) / DAY_MS) * RIBBON_W : null

  const currentHr = useMemo(() => {
    const list = dayRibbon?.hrSeries ?? []
    if (list.length === 0) return null
    return list[list.length - 1].value
  }, [dayRibbon?.hrSeries])

  return (
    <View style={styles.wrap}>
      <Text
        text="TODAY"
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.8,
          marginBottom: 10,
        }}
      />

      <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text
              text="Day overview"
              style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
            />
            {currentHr != null ? (
              <Text
                text={`HR ${currentHr} bpm`}
                style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginTop: 1 }}
              />
            ) : null}
          </View>
          {showNow ? (
            <Text
              text={`● ${formatNow(now)}`}
              style={{ color: colors.text, fontSize: 10, fontWeight: "600", letterSpacing: 0.4 }}
            />
          ) : null}
        </View>

        <View style={styles.ribbonFrame}>
          <LinearGradient
            colors={[
              "#0A0B0E",
              "#0A0B0E",
              "#15171C",
              "#15171C",
              "#0A0B0E",
              "#0A0B0E",
            ]}
            locations={[0, 0.25, 0.3, 0.7, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Svg
            width="100%"
            height={RIBBON_H}
            viewBox={`0 0 ${RIBBON_W} ${RIBBON_H}`}
            preserveAspectRatio="none"
          >
            {[3, 6, 9, 12, 15, 18, 21].map((h) => (
              <Line
                key={h}
                x1={(h / 24) * RIBBON_W}
                x2={(h / 24) * RIBBON_W}
                y1={0}
                y2={RIBBON_H}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
            ))}
            {sleepSeg ? (
              <Rect
                x={sleepSeg.x}
                y={6}
                width={sleepSeg.w}
                height={RIBBON_H - 12}
                rx={3}
                fill={hexWithAlpha(colors.ringSleep, 0.65)}
              />
            ) : null}
            {activitySegs.map((s, i) => (
              <Rect
                key={`act-${i}`}
                x={s.x}
                y={6}
                width={s.w}
                height={RIBBON_H - 12}
                rx={3}
                fill={hexWithAlpha(colors.ringStrain, 0.7)}
              />
            ))}
            {hr.path ? (
              <Path
                d={hr.path}
                stroke="rgba(255,107,128,0.75)"
                strokeWidth={1.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {nowX != null ? (
              <>
                <Line
                  x1={nowX}
                  x2={nowX}
                  y1={-2}
                  y2={RIBBON_H + 2}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Svg>
        </View>

        <View style={styles.axisLabels}>
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <Text
              key={h}
              text={formatHour(h)}
              style={{
                color: colors.textMuted,
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 0.4,
              }}
            />
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        {events.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text
              text="No events yet."
              style={{ color: colors.textDim, fontSize: 13 }}
            />
            <Text
              text="Sleep, recovery and activity events will appear here as your day progresses."
              style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}
            />
          </View>
        ) : (
          events.map((event, i) => (
            <View key={event.id}>
              <EventRow event={event} onPress={onEventPress} />
              {i < events.length - 1 ? (
                <View style={[styles.rowDivider, { backgroundColor: colors.divider }]} />
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  )
}

const EventRow: FC<{
  event: TapeEvent
  onPress?: (event: TapeEvent) => void
}> = ({ event, onPress }) => {
  const { colors } = LOCAL_THEME

  if (event.type === "workout" && event.payload?.activityType) {
    const p = event.payload
    const activityType = p.activityType!
    if ((activityType === "Off-Wrist" || activityType === "No Data") && p.startIso) {
      const start = new Date(p.startIso)
      const end = p.endIso ? new Date(p.endIso) : new Date(start.getTime() + (p.durationMinutes ?? 0) * 60_000)
      return <GapRule kind={activityType} startTime={start} endTime={end} />
    }
    return (
      <View style={{ marginHorizontal: -12 }}>
        <BoutCard
          activityType={activityType}
          startTime={p.startIso ? new Date(p.startIso) : new Date(event.ts)}
          durationMinutes={p.durationMinutes ?? 0}
          heartRateAvg={p.heartRateAvg ?? 0}
          intensity={p.intensity ?? "light"}
          strainScore={p.strain ?? 0}
          onPress={onPress ? () => onPress(event) : undefined}
        />
      </View>
    )
  }

  const inner = (
    <View style={styles.row}>
      <Text
        text={event.time}
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "600",
          minWidth: 46,
          paddingTop: 3,
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={[styles.eventDot, { backgroundColor: event.dotColor }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          text={event.title}
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 }}
        />
        {event.desc ? (
          <Text
            text={event.desc}
            numberOfLines={2}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
        ) : null}
      </View>
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable onPress={() => onPress(event)} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {inner}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 } as ViewStyle,
  card: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  } as ViewStyle,
  headRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 10,
  } as ViewStyle,
  ribbonFrame: {
    height: RIBBON_H,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
  } as ViewStyle,
  axisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 2,
  } as ViewStyle,
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    marginBottom: 4,
  } as ViewStyle,
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  } as ViewStyle,
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 10,
  } as ViewStyle,
  eventDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 7,
    flexShrink: 0,
  } as ViewStyle,
})
