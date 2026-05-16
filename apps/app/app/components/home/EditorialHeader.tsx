import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { CaretLeft, CaretRight } from "phosphor-react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  dateLabel: string
  batteryLabel: string
  isCharging: boolean
  isConnected: boolean
  onPrevious: () => void
  onNext: () => void
  onDevicePress: () => void
}

export const EditorialHeader: FC<Props> = ({
  dateLabel,
  batteryLabel,
  isCharging,
  isConnected,
  onPrevious,
  onNext,
  onDevicePress,
}) => {
  const { colors } = LOCAL_THEME
  const dotColor = isCharging
    ? colors.statusGreen
    : isConnected
      ? colors.statusGreen
      : colors.textDim

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Pressable onPress={onPrevious} hitSlop={12} style={styles.chev}>
          <CaretLeft size={16} color={colors.textDim} />
        </Pressable>
        <Text
          text={dateLabel}
          style={{
            color: colors.text,
            fontFamily: "Georgia-Italic",
            fontSize: 22,
            letterSpacing: 0.2,
          }}
        />
        <Pressable onPress={onNext} hitSlop={12} style={styles.chev}>
          <CaretRight size={16} color={colors.textDim} />
        </Pressable>
      </View>

      <View style={styles.right}>
        <Pressable onPress={onDevicePress} hitSlop={10} style={styles.deviceRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text
            text={batteryLabel}
            size="xs"
            weight="semiBold"
            style={{ color: colors.text, fontVariant: ["tabular-nums"] }}
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 4,
  } as ViewStyle,
  left: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  } as ViewStyle,
  chev: {
    padding: 2,
  } as ViewStyle,
  right: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  } as ViewStyle,
  composeBtn: {
    padding: 2,
  } as ViewStyle,
  deviceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  } as ViewStyle,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  } as ViewStyle,
})
