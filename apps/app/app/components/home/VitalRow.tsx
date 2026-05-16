import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"
import Svg, { Polyline } from "react-native-svg"

import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { hexWithAlpha } from "@/utils/hexWithAlpha"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  iconName: PhosphorIconName
  iconColor: string
  label: string
  name: string
  value: string
  unit: string
  /** Optional sparkline points normalized to a 100×40 viewBox. */
  spark?: Array<{ x: number; y: number }>
  onPress?: () => void
}

export const VitalRow: FC<Props> = ({
  iconName,
  iconColor,
  label,
  name,
  value,
  unit,
  spark,
  onPress,
}) => {
  const { colors } = LOCAL_THEME

  const content = (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: hexWithAlpha(iconColor, 0.15) }]}>
        <PhosphorIcon name={iconName} size={16} color={iconColor} />
      </View>
      <View style={styles.body}>
        <Text
          text={label.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
          }}
        />
        <Text
          text={name}
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: "700",
            marginTop: 1,
          }}
        />
      </View>
      {spark && spark.length > 1 ? (
        <Svg viewBox="0 0 100 40" width={60} height={22} preserveAspectRatio="none">
          <Polyline
            points={spark.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={iconColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
      <View style={styles.num}>
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "800",
            letterSpacing: -0.3,
            lineHeight: 22,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          text={unit}
          style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}
        />
      </View>
      <PhosphorIcon name="chevron-forward" size={14} color={colors.textMuted} />
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  } as ViewStyle,
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  body: { flex: 1, minWidth: 0 } as ViewStyle,
  num: { alignItems: "flex-end", marginRight: 4 } as ViewStyle,
})
