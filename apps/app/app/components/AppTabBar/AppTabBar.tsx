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

const ROUTE_META: Record<string, Omit<PillRoute, "key">> = {
  index: { label: "Home", iconOutline: "home-outline", iconFilled: "home" },
  health: { label: "Health", iconOutline: "pulse-outline", iconFilled: "pulse" },
  settings: { label: "Settings", iconOutline: "settings-outline", iconFilled: "settings" },
}

export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const reduced = useReducedMotion()
  const bottomInset = Math.max(insets.bottom, 8)

  const focusedRouteName = state.routes[state.index]?.name
  const pillRoutes = useMemo<PillRoute[]>(
    () =>
      state.routes
        .filter((r) => ROUTE_META[r.name])
        .map((r) => ({ key: r.name, ...ROUTE_META[r.name] })),
    [state.routes],
  )
  const focusedIndex = Math.max(
    0,
    pillRoutes.findIndex((r) => r.key === focusedRouteName),
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
    const pillRoute = pillRoutes[index]
    if (!pillRoute) return
    const route = state.routes.find((r) => r.name === pillRoute.key)
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
        <TabPill routes={pillRoutes} focusedIndex={focusedIndex} onSelect={onSelect} />
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
