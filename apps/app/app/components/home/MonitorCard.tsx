import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import {
  CaretRight,
  Icon as PhosphorIcon,
} from "phosphor-react-native"

import { Text } from "@/components/Text"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
import { LOCAL_THEME } from "@/utils/localTheme"

export type MonitorCardState = "ok" | "warn" | "alert" | "stale"

type Props = {
  icon: PhosphorIcon
  title: string
  state: MonitorCardState
  score: string
  scoreSubscript?: string
  verdict: string
  freshness?: string | null
  tint?: string
  onPress: () => void
}

export const MonitorCard: FC<Props> = ({
  icon: Icon,
  title,
  state,
  score,
  scoreSubscript,
  verdict,
  freshness,
  tint,
  onPress,
}) => {
  const { colors } = LOCAL_THEME
  const glowColor = tint ?? toneFor(state, colors)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${verdict}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceCard },
        pressed && { opacity: 0.85 },
      ]}
    >
      <LinearGradient
        colors={[hexWithAlpha(glowColor, 0.28), "transparent"]}
        locations={[0, 0.7]}
        style={styles.glow}
        pointerEvents="none"
      />
      <View style={styles.content}>
        <View style={styles.head}>
          <Icon size={13} color={colors.textMuted} />
          <Text
            text={title.toUpperCase()}
            style={{
              color: colors.textDim,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.3,
            }}
          />
          <View style={{ flex: 1 }} />
          <CaretRight size={13} color={colors.textMuted} />
        </View>
        <View style={styles.scoreRow}>
          <Text
            text={score}
            style={{
              color: glowColor,
              fontSize: 30,
              fontWeight: "300",
              letterSpacing: -1.5,
              fontVariant: ["tabular-nums"],
              lineHeight: 32,
            }}
          />
          {scoreSubscript ? (
            <Text
              text={scoreSubscript}
              style={{
                color: glowColor,
                fontSize: 12,
                fontWeight: "500",
                opacity: 0.6,
                marginLeft: 1,
                marginTop: 14,
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : null}
        </View>
        <Text
          text={verdict}
          style={{
            color: colors.text,
            fontSize: 12,
            fontWeight: "700",
            marginTop: 2,
          }}
        />
        {freshness ? (
          <Text
            text={freshness}
            style={{
              color: colors.textMuted,
              fontSize: 10,
              fontWeight: "500",
              marginTop: 4,
              letterSpacing: 0.2,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

function toneFor(
  state: MonitorCardState,
  colors: typeof LOCAL_THEME.colors,
): string {
  if (state === "ok") return colors.statusGreen
  if (state === "warn") return colors.statusAmber
  if (state === "alert") return colors.statusRed
  return colors.statusStale
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 12,
    flex: 1,
    minHeight: 100,
    overflow: "hidden",
    position: "relative",
  } as ViewStyle,
  glow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "75%",
  } as ViewStyle,
  content: {
    position: "relative",
    zIndex: 1,
    flex: 1,
  } as ViewStyle,
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  } as ViewStyle,
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
  } as ViewStyle,
})
