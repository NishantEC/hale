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

  return (
    <View style={{ alignItems: "center", paddingVertical: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text text={`${h}h`} style={{ fontSize: 56, fontWeight: "300", color: colors.text }} />
        <Text text={` ${m}m`} style={{ fontSize: 28, fontWeight: "300", color: colors.text, opacity: 0.85 }} />
      </View>
      {range ? <Text text={range} size="xs" style={{ color: colors.textDim, marginTop: 6 }} /> : null}

      {showScore ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: "rgba(255,164,43,0.12)",
          }}
        >
          <Text text={String(props.score)} style={{ color: "#ffa42b", fontWeight: "600", fontSize: 18 }} />
          <Text text={props.scoreLabel} size="xs" style={{ color: "#ffa42b", opacity: 0.85 }} />
          {showDelta ? (
            <Text
              text={`${sign}${props.scoreDelta} vs week`}
              size="xxs"
              style={{
                color: colors.textDim,
                paddingLeft: 6,
                marginLeft: 4,
                borderLeftWidth: 1,
                borderLeftColor: colors.surfaceCardBorder,
              }}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={{
            marginTop: 14,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: colors.surfaceSubtle,
          }}
        >
          <Text text="Building baseline" size="xs" style={{ color: colors.textDim }} />
        </View>
      )}

      {props.detail ? (
        <Text
          text={props.detail}
          size="xs"
          style={{ color: colors.textDim, marginTop: 14, paddingHorizontal: 12, textAlign: "center", lineHeight: 18 }}
        />
      ) : null}
    </View>
  )
}
