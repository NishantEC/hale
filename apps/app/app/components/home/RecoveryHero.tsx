import { FC, useEffect } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import { Easing, useSharedValue, withTiming } from "react-native-reanimated"

import { CircularProgress } from "@/components/reactx/circular-progress"
import { Glow } from "@/components/reacticx/glow"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  /** 0–1 progress for the ring stroke. */
  value: number
  /** Centered number text — usually `${percent}%`. */
  label: string
  /** Bold one-liner under the ring (e.g. "Push hard."). */
  verdict: string
  /** Dim sub-line under the verdict. */
  verdictDetail: string
  onPress?: () => void
}

export const RecoveryHero: FC<Props> = ({ value, label, verdict, verdictDetail, onPress }) => {
  const colors = LOCAL_THEME.colors
  const progress = useSharedValue(0)

  useEffect(() => {
    const target = Math.round(Math.max(0, Math.min(1, value)) * 100)
    progress.value = withTiming(target, { duration: 800, easing: Easing.out(Easing.ease) })
  }, [value, progress])

  // Tint the glow halo by recovery level. Above 67% green, 34-66 amber,
  // below 33 red — matches the verdict color scale.
  const glowColor =
    value >= 0.67 ? "#4ade80" : value >= 0.34 ? "#facc15" : "#fb7185"

  return (
    <View style={$wrap}>
      <Pressable onPress={onPress} style={$ringPress} disabled={!onPress}>
        <Glow color={glowColor} style="breathe" intensity={0.55} speed={1} radius={160} size={170}>
        <CircularProgress
          progress={progress}
          size={140}
          strokeWidth={7}
          progressCircleColor={colors.ringRecovery}
          outerCircleColor={colors.surfaceCard}
          backgroundColor="transparent"
          gap={0}
          renderIcon={() => (
            <View style={$ringInner}>
              <Text
                text={label}
                style={{
                  color: colors.text,
                  fontSize: 38,
                  fontWeight: "900",
                  letterSpacing: -1.2,
                  lineHeight: 42,
                  fontVariant: ["tabular-nums"],
                }}
              />
              <Text
                text="RECOVERY"
                style={{
                  color: colors.textDim,
                  fontSize: 9,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  marginTop: 2,
                }}
              />
            </View>
          )}
        />
        </Glow>
      </Pressable>

      {verdict ? (
        <Text
          text={verdict}
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.3,
            marginTop: 12,
            textAlign: "center",
          }}
        />
      ) : null}
      {verdictDetail ? (
        <Text
          text={verdictDetail}
          style={{
            color: colors.textDim,
            fontSize: 13,
            marginTop: 3,
            textAlign: "center",
          }}
        />
      ) : null}
    </View>
  )
}

const $wrap: ViewStyle = {
  alignItems: "center",
  marginTop: 12,
  marginBottom: 20,
}

const $ringPress: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}

const $ringInner: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}
