import { useEffect, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { router, usePathname } from "expo-router"

import { isJournalEntryPath } from "./pathUtils"
import { PlusFab } from "./PlusFab"
import { TabPill, type PillRoute } from "./TabPill"
import {
  BAR_BOTTOM_GAP,
  BAR_MARGIN_X,
  MOUNT_DELAY_MS,
  PILL_FAB_GAP,
  SPRING_DEFAULT,
} from "./tokens"

const ROUTES: PillRoute[] = [
  { key: "index", label: "Home", iconOutline: "home-outline", iconFilled: "home" },
  { key: "health", label: "Health", iconOutline: "pulse-outline", iconFilled: "pulse" },
  { key: "settings", label: "Settings", iconOutline: "settings-outline", iconFilled: "settings" },
]

export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const reduced = useReducedMotion()
  const bottomInset = Math.max(insets.bottom, 8)

  const focusedRouteName = state.routes[state.index]?.name
  const focusedIndex = useMemo(
    () => Math.max(0, ROUTES.findIndex((r) => r.key === focusedRouteName)),
    [focusedRouteName],
  )

  const pathname = usePathname()
  const isJournalOpen = isJournalEntryPath(pathname)

  const mounted = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      mounted.value = 1
      return
    }
    mounted.value = withDelay(MOUNT_DELAY_MS, withSpring(1, SPRING_DEFAULT))
  }, [reduced])

  const barStyle = useAnimatedStyle(() => ({
    opacity: mounted.value,
    transform: [{ translateY: interpolate(mounted.value, [0, 1], [40, 0]) }],
  }))

  const onSelect = (index: number) => {
    const route = state.routes.find((r) => r.name === ROUTES[index].key)
    if (!route) return
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    })
    if (!event.defaultPrevented) {
      ;(navigation.navigate as (...args: unknown[]) => void)(route.name, route.params)
    }
  }

  const onPressPlus = () => {
    router.push("/journal-entry" as never)
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          left: BAR_MARGIN_X,
          right: BAR_MARGIN_X,
          bottom: bottomInset + BAR_BOTTOM_GAP,
        },
        barStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.row, { gap: PILL_FAB_GAP }]}>
        <TabPill routes={ROUTES} focusedIndex={focusedIndex} onSelect={onSelect} />
        <PlusFab isOpen={isJournalOpen} onPress={onPressPlus} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
})
