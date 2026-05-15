import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { PhosphorIcon, type PhosphorIconName } from "@/components/PhosphorIcon"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type StatChipData = {
  key: string
  label: string
  value: string
  unit?: string
  iconName?: PhosphorIconName
  iconColor?: string
  dotColor?: string
  onPress?: () => void
}

type Props = {
  chips: StatChipData[]
  footer?: string
}

export const StatCard: FC<Props> = ({ chips, footer }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
      <View style={styles.grid}>
        {chips.map((c) => (
          <StatChip key={c.key} chip={c} />
        ))}
      </View>
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.divider }]}>
          <Text
            text={footer}
            style={{ color: colors.textMuted, fontSize: 11 }}
            numberOfLines={1}
          />
        </View>
      ) : null}
    </View>
  )
}

const StatChip: FC<{ chip: StatChipData }> = ({ chip }) => {
  const { colors } = LOCAL_THEME
  const content = (
    <>
      {chip.iconName ? (
        <PhosphorIcon name={chip.iconName} size={16} color={chip.iconColor ?? colors.text} />
      ) : chip.dotColor ? (
        <View style={[styles.dot, { backgroundColor: chip.dotColor }]} />
      ) : null}
      <View style={styles.chipText}>
        <Text
          text={chip.label.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 1.2,
          }}
        />
        <View style={styles.valueRow}>
          <Text
            text={chip.value}
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "800",
              fontVariant: ["tabular-nums"],
            }}
          />
          {chip.unit ? (
            <Text
              text={chip.unit}
              style={{ color: colors.textDim, fontSize: 10, marginLeft: 2, marginBottom: 1 }}
            />
          ) : null}
        </View>
      </View>
    </>
  )

  if (chip.onPress) {
    return (
      <Pressable
        onPress={chip.onPress}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    )
  }
  return <View style={styles.chip}>{content}</View>
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    gap: 8,
    padding: 14,
  } as ViewStyle,
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    rowGap: 10,
  } as ViewStyle,
  chip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    width: "50%",
  } as ViewStyle,
  chipText: {
    flexShrink: 1,
  } as ViewStyle,
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  } as ViewStyle,
  valueRow: {
    alignItems: "flex-end",
    flexDirection: "row",
  } as ViewStyle,
  footer: {
    borderTopWidth: 0.5,
    marginTop: 4,
    paddingTop: 8,
  } as ViewStyle,
})
