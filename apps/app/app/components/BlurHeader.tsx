import { FC, ReactNode } from "react"
// eslint-disable-next-line no-restricted-imports
import { Platform, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native"
import { BlurView } from "expo-blur"
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  /** Inline-title text to mirror in the floating bar */
  title: string
  /** Reanimated shared value driven by the screen's scroll position */
  scrollY: SharedValue<number>
  /**
   * Scroll distance over which the bar fades from invisible → fully blurred.
   * Should match the offset from the top of the scrollable content to the
   * bottom of the inline H1 (so the bar appears as the title scrolls offscreen).
   */
  fadeOver?: number
  /** Optional right-aligned slot (status pills, action buttons, etc.) */
  rightAccessory?: ReactNode
}

/**
 * Modern iOS-style scroll-edge header: invisible at the top, fades to a blurred
 * surface with a centered title once the user scrolls past the inline heading.
 * Mirrors UINavigationBar.scrollEdgeAppearance behavior on tabs that don't sit
 * inside a native Stack.
 */
export const BlurHeader: FC<Props> = ({ title, scrollY, fadeOver = 56, rightAccessory }) => {
  const insets = useSafeAreaInsets()
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, fadeOver * 0.4, fadeOver],
      [0, 0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  // Hairline divider sharpens once the bar is fully visible.
  const dividerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [fadeOver * 0.6, fadeOver],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        $wrap,
        { paddingTop: insets.top },
        containerStyle,
      ]}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={60}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? "rgba(10,10,12,0.86)" : "rgba(240,237,232,0.86)" },
          ]}
        />
      )}

      <View style={$row}>
        <Text style={[$title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {rightAccessory ? <View style={$right}>{rightAccessory}</View> : null}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[$divider, { backgroundColor: colors.divider }, dividerStyle]}
      />
    </Animated.View>
  )
}

const $wrap: ViewStyle = {
  left: 0,
  position: "absolute",
  right: 0,
  top: 0,
  zIndex: 10,
}

const $row: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  height: 44,
  justifyContent: "center",
  paddingHorizontal: 20,
}

const $title: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
  letterSpacing: -0.2,
}

const $right: ViewStyle = {
  position: "absolute",
  right: 12,
  top: 0,
  bottom: 0,
  justifyContent: "center",
}

const $divider: ViewStyle = {
  height: StyleSheet.hairlineWidth,
}
