import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type MonitorCardState = "ok" | "warn" | "alert" | "stale"

type Props = {
  icon: PhosphorIconName
  title: string
  state: MonitorCardState
  /** Either tileIcon or tileText is rendered inside the tile. */
  tileIcon?: PhosphorIconName
  tileText?: string
  verdict: string
  subline: string
  onPress: () => void
}

export const MonitorCard: FC<Props> = ({
  icon,
  title,
  state,
  tileIcon,
  tileText,
  verdict,
  subline,
  onPress,
}) => {
  const { colors } = LOCAL_THEME
  const tone = toneFor(state, colors)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} monitor, ${verdict}, ${subline}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceCard },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <PhosphorIcon name={icon} size={14} color={colors.textDim} />
          <Text
            text={title.toUpperCase()}
            style={{
              color: colors.text,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.4,
            }}
          />
        </View>
        <PhosphorIcon name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
      <View style={styles.body}>
        <View style={[styles.tile, { backgroundColor: tone.tileBg }]}>
          {tileIcon ? (
            <PhosphorIcon name={tileIcon} size={16} color={tone.fg} weight="fill" />
          ) : tileText ? (
            <Text
              text={tileText}
              style={{
                color: tone.fg,
                fontSize: 13,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : null}
        </View>
        <View style={styles.text}>
          <Text
            text={verdict}
            style={{ color: tone.fg, fontSize: 13, fontWeight: "700" }}
          />
          <Text
            text={subline}
            style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}
          />
        </View>
      </View>
    </Pressable>
  )
}

function toneFor(
  state: MonitorCardState,
  colors: typeof LOCAL_THEME.colors,
): { fg: string; tileBg: string } {
  if (state === "ok") return { fg: colors.statusGreen, tileBg: hexToRGBA(colors.statusGreen, 0.18) }
  if (state === "warn") return { fg: colors.statusAmber, tileBg: hexToRGBA(colors.statusAmber, 0.18) }
  if (state === "alert") return { fg: colors.statusRed, tileBg: hexToRGBA(colors.statusRed, 0.18) }
  return { fg: colors.statusStale, tileBg: hexToRGBA(colors.statusStale, 0.18) }
}

function hexToRGBA(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    flex: 1,
  } as ViewStyle,
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } as ViewStyle,
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  } as ViewStyle,
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  } as ViewStyle,
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as ViewStyle,
  text: { flex: 1, minWidth: 0 } as ViewStyle,
})
