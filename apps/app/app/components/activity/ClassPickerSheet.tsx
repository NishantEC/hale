import { FC, useEffect, useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { ACTIVITY_VISUALS, type ActivityVisualKey } from "./bout-icons"

const RICH_10_ORDER: ActivityVisualKey[] = [
  "Stair Climb",
  "Running",
  "HIIT",
  "Cycling",
  "Strength",
  "Hiking",
  "Walking",
  "Cardio",
  "Mixed",
  "Light Activity",
]

type Props = {
  visible: boolean
  currentType: string | null
  onCancel: () => void
  onPick: (type: string) => void
}

export const ClassPickerSheet: FC<Props> = ({ visible, currentType, onCancel, onPick }) => {
  const colors = LOCAL_THEME.colors

  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = withTiming(0, { duration: 220 })
      backdropOpacity.value = withTiming(0.55, { duration: 220 })
    } else if (mounted) {
      translateY.value = withTiming(600, { duration: 180 })
      backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible, mounted, translateY, backdropOpacity])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }))

  if (!visible && !mounted) return null

  const sortedOrder: ActivityVisualKey[] =
    currentType && RICH_10_ORDER.includes(currentType as ActivityVisualKey)
      ? [
          currentType as ActivityVisualKey,
          ...RICH_10_ORDER.filter((c) => c !== (currentType as ActivityVisualKey)),
        ]
      : RICH_10_ORDER

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.surfaceCardBorder,
            },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.textMuted }]} />
          </View>

          <View style={styles.headerRow}>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.headerBtn}>
              <Text text="Cancel" style={[styles.headerBtnText, { color: colors.textDim }]} />
            </Pressable>
            <Text text="Pick a class" style={[styles.headerTitle, { color: colors.text }]} />
            <View style={styles.headerBtn} />
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: 12 }}>
            {sortedOrder.map((cls) => {
              const v = ACTIVITY_VISUALS[cls]
              const isCurrent = cls === currentType
              return (
                <Pressable
                  key={cls}
                  onPress={() => onPick(cls)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: v.backgroundHex }]}>
                    <SymbolView name={v.sfSymbol as never} size={15} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
                  </View>
                  <Text text={cls} style={[styles.rowName, { color: colors.text }]} />
                  {isCurrent ? (
                    <SymbolView name="checkmark" size={14} tintColor={v.tintHex} resizeMode="scaleAspectFit" />
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: { alignItems: "center", paddingVertical: 8 },
  grabberBar: { width: 40, height: 4, borderRadius: 2, opacity: 0.6 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerBtn: { paddingVertical: 4, minWidth: 60 },
  headerBtnText: { fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 15, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { flex: 1, fontSize: 15, fontWeight: "600" },
})
