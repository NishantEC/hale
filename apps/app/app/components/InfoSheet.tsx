import { FC, useEffect, useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  visible: boolean
  title: string
  paragraphs: string[]
  onClose: () => void
}

/**
 * Bottom-sheet explainer. Mirrors the ClassPickerSheet / DateOfBirthSheet
 * animation idiom (Modal + animated backdrop + slide-up card) so info-ⓘ
 * affordances across detail screens read consistently.
 */
export const InfoSheet: FC<Props> = ({ visible, title, paragraphs, onClose }) => {
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

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.textMuted }]} />
          </View>

          <View style={styles.headerRow}>
            <Text text={title} style={[styles.headerTitle, { color: colors.text }]} />
            <Pressable onPress={onClose} hitSlop={10} style={styles.headerBtn}>
              <Text text="Done" style={[styles.headerBtnText, { color: colors.tint }]} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {paragraphs.map((p, i) => (
              <Text key={i} text={p} style={[styles.body, { color: colors.textDim }]} />
            ))}
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
    paddingHorizontal: 20,
  },
  grabber: { alignItems: "center", paddingVertical: 8 },
  grabberBar: { width: 40, height: 4, borderRadius: 2, opacity: 0.6 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", flex: 1 },
  headerBtn: { paddingVertical: 4, paddingLeft: 12 },
  headerBtnText: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
})
