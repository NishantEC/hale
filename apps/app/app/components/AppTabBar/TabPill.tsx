import { useEffect, useState } from "react"
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import { BlurView } from "expo-blur"
import Ionicons from "@expo/vector-icons/Ionicons"

import { LOCAL_THEME } from "@/utils/localTheme"

import { TabCell } from "./TabCell"
import {
  CHIP_RADIUS,
  PILL_HEIGHT,
  PILL_PADDING,
  PILL_RADIUS,
  SPRING_DEFAULT,
} from "./tokens"

export type PillRoute = {
  key: string
  label: string
  iconOutline: keyof typeof Ionicons.glyphMap
  iconFilled: keyof typeof Ionicons.glyphMap
}

export type TabPillProps = {
  routes: PillRoute[]
  focusedIndex: number
  onSelect: (index: number) => void
}

export function TabPill({ routes, focusedIndex, onSelect }: TabPillProps) {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark
  const reduced = useReducedMotion()

  const [pillWidth, setPillWidth] = useState(0)
  const cellWidth = pillWidth > 0 ? (pillWidth - 2 * PILL_PADDING) / routes.length : 0

  const chipX = useSharedValue(0)

  useEffect(() => {
    const target = focusedIndex * cellWidth
    chipX.value = reduced ? target : withSpring(target, SPRING_DEFAULT)
  }, [focusedIndex, cellWidth, reduced])

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chipX.value }],
    width: cellWidth,
  }))

  const onLayout = (e: LayoutChangeEvent) => {
    setPillWidth(e.nativeEvent.layout.width)
  }

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.tabPillBg,
          borderColor: colors.tabPillBorder,
        },
      ]}
      onLayout={onLayout}
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 0}
        tint={isDark ? "dark" : "light"}
        style={[StyleSheet.absoluteFill, { borderRadius: PILL_RADIUS }]}
      />
      {cellWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chip,
            { backgroundColor: colors.tabChipBg },
            chipStyle,
          ]}
        />
      )}
      <View style={styles.row}>
        {routes.map((r, i) => (
          <TabCell
            key={r.key}
            label={r.label}
            iconOutline={r.iconOutline}
            iconFilled={r.iconFilled}
            focused={i === focusedIndex}
            onPress={() => onSelect(i)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    flex: 1,
    height: PILL_HEIGHT,
    overflow: "hidden",
    padding: PILL_PADDING,
    position: "relative",
  },
  chip: {
    borderRadius: CHIP_RADIUS,
    bottom: PILL_PADDING,
    left: PILL_PADDING,
    position: "absolute",
    top: PILL_PADDING,
  },
  row: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
})
