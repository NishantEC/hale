import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { CaretRight } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  title: string
  score: string
  scoreSubscript?: string
  verdict: string
  body: string
  tint: string
  onPress?: () => void
}

export const GlowScoreCard: FC<Props> = ({
  title,
  score,
  scoreSubscript,
  verdict,
  body,
  tint,
  onPress,
}) => {
  const { colors } = LOCAL_THEME
  const content = (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <LinearGradient
        colors={[hexWithAlpha(tint, 0.32), "transparent"]}
        locations={[0, 0.75]}
        style={$glow}
        pointerEvents="none"
      />
      <View style={$head}>
        <Text
          text={title.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            flex: 1,
          }}
        />
        {onPress ? <CaretRight size={14} color={colors.textMuted} /> : null}
      </View>
      <View style={$scoreRow}>
        <Text
          text={score}
          style={{
            color: tint,
            fontSize: 56,
            fontWeight: "200",
            letterSpacing: -2,
            lineHeight: 60,
            fontVariant: ["tabular-nums"],
          }}
        />
        {scoreSubscript ? (
          <Text
            text={scoreSubscript}
            style={{
              color: tint,
              fontSize: 16,
              fontWeight: "500",
              opacity: 0.7,
              marginLeft: 4,
              marginBottom: 14,
              fontVariant: ["tabular-nums"],
            }}
          />
        ) : null}
      </View>
      <Text
        text={verdict}
        style={{
          color: colors.text,
          fontSize: 16,
          fontWeight: "700",
          marginTop: 4,
        }}
      />
      <Text
        text={body}
        style={{
          color: colors.textDim,
          fontSize: 13,
          fontWeight: "400",
          lineHeight: 18,
          marginTop: 6,
        }}
      />
    </View>
  )
  if (!onPress) return content
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
  )
}

const $card: ViewStyle = {
  borderRadius: 18,
  padding: 18,
  overflow: "hidden",
  position: "relative",
}

const $glow: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  height: "100%",
}

const $head: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $scoreRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-end",
  marginTop: 8,
}
