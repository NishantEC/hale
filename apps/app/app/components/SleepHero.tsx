import { View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type SleepHeroProps = {
  durationMinutes: number
  bedtimeLabel?: string
  wakeTimeLabel?: string
  score: number | null
  scoreLabel: string
  scoreConfidence: string
  scoreDelta: number | null
  detail: string
}

function fmtDuration(min: number): { h: number; m: number } {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return { h, m }
}

export function SleepHero(props: SleepHeroProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const { h, m } = fmtDuration(props.durationMinutes)
  const showScore = props.scoreConfidence !== "Low" && props.score != null
  const showDelta = props.scoreDelta != null && Number.isFinite(props.scoreDelta)
  const sign = showDelta && props.scoreDelta! > 0 ? "+" : ""
  const range = props.bedtimeLabel && props.wakeTimeLabel
    ? `${props.bedtimeLabel} – ${props.wakeTimeLabel}`
    : null

  const durationText = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`

  return (
    <View style={{ paddingVertical: 18, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text
            text={durationText}
            style={{ fontSize: 44, lineHeight: 52, fontWeight: "300", color: colors.text }}
          />
          {range ? (
            <Text text={range} size="xs" style={{ color: colors.textDim, marginTop: 4 }} />
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {showScore ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: "rgba(255,164,43,0.12)",
              }}
            >
              <Text text={String(props.score)} style={{ color: "#ffa42b", fontWeight: "600", fontSize: 18, lineHeight: 22 }} />
              <Text text={props.scoreLabel} size="xs" style={{ color: "#ffa42b", opacity: 0.85 }} />
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: colors.surfaceSubtle,
              }}
            >
              <Text text="Building baseline" size="xs" style={{ color: colors.textDim }} />
            </View>
          )}
          {showDelta ? (
            <Text
              text={`${sign}${props.scoreDelta} vs week`}
              size="xxs"
              style={{ color: colors.textDim, marginTop: 4 }}
            />
          ) : null}
        </View>
      </View>

      {props.detail ? (
        <Text
          text={props.detail}
          size="xs"
          style={{ color: colors.textDim, marginTop: 14, lineHeight: 18 }}
        />
      ) : null}
    </View>
  )
}
