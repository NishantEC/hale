import { FC, useMemo } from "react"
import { StyleSheet, View } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

export type DayTimelineBout = {
  startTime: Date
  endTime: Date
  /** Rich-10 class, "Candidate", "Off-Wrist", or "No Data". */
  activityType: string
}

type Props = {
  bouts: DayTimelineBout[]
  /** Local-time day boundaries (start = 00:00, end = 23:59:59.999). */
  dayStart: Date
  dayEnd: Date
}

export const DayTimeline: FC<Props> = ({ bouts, dayStart, dayEnd }) => {
  const colors = LOCAL_THEME.colors
  const spanMs = dayEnd.getTime() - dayStart.getTime()

  const blocks = useMemo(() => {
    if (spanMs <= 0) return []
    return bouts
      .map((b) => {
        const start = Math.max(b.startTime.getTime(), dayStart.getTime())
        const end = Math.min(b.endTime.getTime(), dayEnd.getTime())
        if (end <= start) return null
        return {
          left: ((start - dayStart.getTime()) / spanMs) * 100,
          width: ((end - start) / spanMs) * 100,
          type: b.activityType,
        }
      })
      .filter((x): x is { left: number; width: number; type: string } => x != null)
  }, [bouts, dayStart, dayEnd, spanMs])

  const labels = ["4a", "8a", "12p", "4p", "8p"]

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceCard }]}>
      <Text
        text="DAY TIMELINE"
        style={{
          color: colors.textDim,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          marginBottom: 8,
        }}
      />
      <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}>
        {blocks.map((b, i) => {
          const v = visualForType(b.type)
          const isCandidate = b.type === "Candidate"
          const isGap = b.type === "Off-Wrist" || b.type === "No Data"
          return (
            <View
              key={i}
              style={[
                styles.block,
                {
                  left: `${b.left}%`,
                  width: `${Math.max(0.5, b.width)}%`,
                  backgroundColor: isGap ? "transparent" : v.tintHex,
                  borderWidth: isCandidate ? 1 : 0,
                  borderColor: isCandidate ? v.tintHex : "transparent",
                  borderStyle: isCandidate ? "dashed" : "solid",
                  opacity: isGap ? 0.45 : 1,
                },
                isGap && {
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  borderStyle: "dashed",
                },
              ]}
            />
          )
        })}
      </View>
      <View style={styles.axis}>
        {labels.map((l) => (
          <Text
            key={l}
            text={l}
            style={{
              color: colors.textMuted,
              fontSize: 9,
              fontVariant: ["tabular-nums"],
            }}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { padding: 12, borderRadius: 12 },
  track: { position: "relative", height: 18, borderRadius: 5, overflow: "hidden" },
  block: { position: "absolute", top: 0, bottom: 0, borderRadius: 3 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
})
