import { FC, useEffect, useMemo, useRef, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { Picker } from "@/components/reacticx/picker"
import { LOCAL_THEME } from "@/utils/localTheme"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const CURRENT_YEAR = new Date().getFullYear()
const MIN_YEAR = CURRENT_YEAR - 100
const MAX_YEAR = CURRENT_YEAR
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i))
const YEARS_ASC = [...YEARS].reverse() // oldest at top, newest at bottom — feels right for DOB

const ITEM_HEIGHT = 44
const VISIBLE_ITEMS = 7
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS

function daysInMonth(year: number, month: number /* 1-12 */): number {
  return new Date(year, month, 0).getDate()
}

function parseIsoDate(iso: string | null): { year: number; month: number; day: number } {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number)
    if (y >= MIN_YEAR && y <= MAX_YEAR) return { year: y, month: m, day: d }
  }
  // Default to 30 years ago, Jan 1 — reasonable starting point for an adult
  return { year: CURRENT_YEAR - 30, month: 1, day: 1 }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

type Props = {
  visible: boolean
  initialIso: string | null
  onCancel: () => void
  onSubmit: (iso: string) => void
  saving?: boolean
}

export const DateOfBirthSheet: FC<Props> = ({ visible, initialIso, onCancel, onSubmit, saving = false }) => {
  const colors = LOCAL_THEME.colors

  const initial = useMemo(() => parseIsoDate(initialIso), [initialIso])
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [day, setDay] = useState(initial.day)

  useEffect(() => {
    if (visible) {
      setYear(initial.year)
      setMonth(initial.month)
      setDay(initial.day)
    }
  }, [visible, initial])

  // Clamp day when month/year shorten the available days.
  useEffect(() => {
    const max = daysInMonth(year, month)
    if (day > max) setDay(max)
  }, [year, month, day])

  const daysArr = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => String(i + 1)),
    [year, month],
  )

  const yearInitialIndex = YEARS_ASC.indexOf(String(year))
  const monthInitialIndex = month - 1
  const dayInitialIndex = day - 1

  // Slide-up animation
  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = withTiming(0, { duration: 250 })
      backdropOpacity.value = withTiming(0.55, { duration: 250 })
    } else if (mounted) {
      translateY.value = withTiming(600, { duration: 200 })
      backdropOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible, mounted, translateY, backdropOpacity])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }))

  if (!visible && !mounted) return null

  const handleDone = () => {
    onSubmit(`${year}-${pad(month)}-${pad(day)}`)
  }

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
            <Pressable
              onPress={handleDone}
              hitSlop={10}
              disabled={saving}
              style={styles.headerBtn}
            >
              <Text style={[styles.headerBtnText, { color: colors.tint, opacity: saving ? 0.6 : 1 }]}>
                {saving ? "Saving…" : "Done"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.pickerRow}>
            <View style={styles.pickerCol}>
              <Picker
                key={`m-${month}`}
                items={MONTHS}
                initialIndex={monthInitialIndex}
                onIndexChange={(idx) => setMonth(idx + 1)}
                itemHeight={ITEM_HEIGHT}
                width="100%"
                textColor={colors.textDim as string}
                selectedTextColor={colors.text as string}
                backgroundColor="transparent"
                selectionAreaBackgroundColor="rgba(255,255,255,0.05)"
              />
            </View>
            <View style={[styles.pickerCol, { flex: 0.7 }]}>
              <Picker
                key={`d-${daysArr.length}`}
                items={daysArr}
                initialIndex={Math.min(dayInitialIndex, daysArr.length - 1)}
                onIndexChange={(idx) => setDay(idx + 1)}
                itemHeight={ITEM_HEIGHT}
                width="100%"
                textColor={colors.textDim as string}
                selectedTextColor={colors.text as string}
                backgroundColor="transparent"
                selectionAreaBackgroundColor="rgba(255,255,255,0.05)"
              />
            </View>
            <View style={[styles.pickerCol, { flex: 0.9 }]}>
              <Picker
                key={`y-${year}`}
                items={YEARS_ASC}
                initialIndex={yearInitialIndex >= 0 ? yearInitialIndex : YEARS_ASC.length - 30}
                onIndexChange={(idx) => setYear(Number(YEARS_ASC[idx]))}
                itemHeight={ITEM_HEIGHT}
                width="100%"
                textColor={colors.textDim as string}
                selectedTextColor={colors.text as string}
                backgroundColor="transparent"
                selectionAreaBackgroundColor="rgba(255,255,255,0.05)"
              />
            </View>
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
  pickerRow: {
    flexDirection: "row",
    height: PICKER_HEIGHT,
    paddingHorizontal: 8,
    gap: 4,
  },
  pickerCol: { flex: 1 },
})
