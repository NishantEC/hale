import { FC, useEffect, useMemo, useState } from "react"
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import DateTimePicker from "@react-native-community/datetimepicker"

import { LOCAL_THEME } from "@/utils/localTheme"

function parseIsoDate(iso: string | null): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}T00:00:00.000Z`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const fallback = new Date()
  fallback.setUTCFullYear(fallback.getUTCFullYear() - 30, 0, 1)
  fallback.setUTCHours(0, 0, 0, 0)
  return fallback
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Props = {
  visible: boolean
  initialIso: string | null
  onCancel: () => void
  onSubmit: (iso: string) => void
  saving?: boolean
}

const MIN_DATE = (() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 100)
  return d
})()
const MAX_DATE = new Date()

export const DateOfBirthSheet: FC<Props> = ({ visible, initialIso, onCancel, onSubmit, saving = false }) => {
  const colors = LOCAL_THEME.colors

  const initial = useMemo(() => parseIsoDate(initialIso), [initialIso])
  const [selected, setSelected] = useState<Date>(initial)

  useEffect(() => {
    if (visible) setSelected(initial)
  }, [visible, initial])

  // Slide-up animation
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

  const handleDone = () => onSubmit(isoFromDate(selected))

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
              paddingBottom: 28,
            },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.textMuted }]} />
          </View>

          <View style={styles.headerRow}>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.textDim }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Date of Birth</Text>
            <Pressable onPress={handleDone} hitSlop={10} disabled={saving} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.tint, opacity: saving ? 0.6 : 1 }]}>
                {saving ? "Saving…" : "Done"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={selected}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={MIN_DATE}
              maximumDate={MAX_DATE}
              themeVariant={LOCAL_THEME.isDark ? "dark" : "light"}
              onChange={(_, d) => {
                if (d) setSelected(d)
              }}
              style={styles.picker}
            />
          </View>
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
  pickerWrap: {
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
  },
  picker: { width: "100%" },
})
