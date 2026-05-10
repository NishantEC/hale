import { FC, useEffect } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import { Easing, useSharedValue, withTiming } from "react-native-reanimated"

import { CircularProgress } from "@/components/reactx/circular-progress"
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

  return (
    <View style={$wrap}>
      <Pressable onPress={onPress} style={$ringPress} disabled={!onPress}>
        <CircularProgress
          progress={progress}
          size={160}
          strokeWidth={8}
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
                  fontSize: 44,
                  fontWeight: "900",
                  letterSpacing: -1.5,
                  lineHeight: 48,
                  fontVariant: ["tabular-nums"],
                }}
              />
              <Text
                text="RECOVERY"
                style={{
                  color: colors.textDim,
                  fontSize: 8,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  marginTop: 2,
                }}
              />
            </View>
          )}
        />
      </Pressable>

      <Text
        text={verdict}
        style={{
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: -0.2,
          marginTop: 12,
          textAlign: "center",
        }}
      />
      <Text
        text={verdictDetail}
        style={{
          color: colors.textDim,
          fontSize: 10,
          marginTop: 2,
          textAlign: "center",
        }}
      />
    </View>
  )
}

const $wrap: ViewStyle = {
  alignItems: "center",
  marginTop: 16,
  marginBottom: 24,
}

const $ringPress: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}

const $ringInner: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
}
