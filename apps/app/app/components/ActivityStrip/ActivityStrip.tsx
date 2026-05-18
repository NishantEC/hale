import { memo, useEffect, useRef } from "react"
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from "react-native"
import { SymbolView } from "expo-symbols"
import { NativeTabs } from "expo-router/unstable-native-tabs"

import { useActivityStripState } from "./useActivityStripState"
import type { AccessoryState, AccessoryTone } from "./states"

const TONE_COLOR: Record<AccessoryTone, string> = {
  red:    "#FF453A",
  amber:  "#FF9F0A",
  teal:   "#64D2FF",
  blue:   "#0A84FF",
  green:  "#30D158",
  indigo: "#5E5CE6",
  gray:   "#8E8E93",
}

const SPIN_STATES: ReadonlySet<AccessoryState> = new Set<AccessoryState>([
  "ble_syncing",
  "pipeline_running",
  "upload_draining",
  "ble_connecting",
])

export const ActivityStrip = memo(function ActivityStrip() {
  const { state, copy, icon, tone, onPress, announcement } = useActivityStripState()
  const placement = NativeTabs.BottomAccessory.usePlacement()
  const fade = useRef(new Animated.Value(0)).current
  const spin = useRef(new Animated.Value(0)).current
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotionRef.current = v
    })
  }, [])

  useEffect(() => {
    if (state === "idle") {
      fade.setValue(0)
      return
    }
    AccessibilityInfo.announceForAccessibility(announcement)
    Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotionRef.current ? 0 : 180,
      useNativeDriver: true,
    }).start()
  }, [state, announcement, fade])

  useEffect(() => {
    if (!SPIN_STATES.has(state) || reduceMotionRef.current) {
      spin.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [state, spin])

  if (state === "idle") return null

  const color = TONE_COLOR[tone]
  const isInline = placement === "inline"
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })

  return (
    <Animated.View style={[styles.wrap, isInline && styles.wrapInline, { opacity: fade }]}>
      <Pressable
        onPress={onPress ?? undefined}
        disabled={!onPress}
        accessibilityLabel={announcement}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        style={({ pressed }) => [
          styles.pill,
          isInline && styles.pillInline,
          pressed && styles.pillPressed,
        ]}
      >
        <Animated.View style={SPIN_STATES.has(state) ? { transform: [{ rotate }] } : undefined}>
          <SymbolView name={icon as never} size={18} tintColor={color} resizeMode="scaleAspectFit" />
        </Animated.View>
        {!isInline && (
          <Text numberOfLines={1} style={[styles.text, { color }]}>
            {copy}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  wrapInline: { paddingHorizontal: 0 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillInline: { paddingHorizontal: 4 },
  pillPressed: { opacity: 0.6 },
  text: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
})
