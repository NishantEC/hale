import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { visualForType } from "./bout-icons"

type Intensity = "light" | "moderate" | "hard"

type Props = {
  activityType: string
  startTime: Date
  durationMinutes: number
  heartRateAvg: number
  intensity: Intensity
  strainScore: number
  onPress?: () => void
}

function fmt(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export const BoutCard: FC<Props> = ({
  activityType,
  startTime,
  durationMinutes,
  heartRateAvg,
  intensity,
  strainScore,
  onPress,
}) => {
  const colors = LOCAL_THEME.colors
  const v = visualForType(activityType)
  const body = (
    <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
      <View style={[styles.iconWrap, { backgroundColor: v.backgroundHex }]}>
        <SymbolView name={v.sfSymbol as never} size={18} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.body}>
        <Text
          text={activityType}
          style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
          numberOfLines={1}
        />
        <Text
          text={`${fmt(startTime)} · ${Math.round(durationMinutes)} min · HR ${Math.round(heartRateAvg)} · ${intensity}`}
          style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}
          numberOfLines={1}
        />
      </View>
      <View style={styles.right}>
        <Text
          text={strainScore.toFixed(1)}
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "800",
            lineHeight: 17,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          text="STRAIN"
          style={{
            color: colors.textMuted,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 1,
            marginTop: 2,
          }}
        />
      </View>
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  } as ViewStyle,
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  body: { flex: 1 } as ViewStyle,
  right: { alignItems: "flex-end" } as ViewStyle,
  pressed: { opacity: 0.7 },
})
