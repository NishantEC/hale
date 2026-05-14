import { FC, ReactNode } from "react"
import { Platform, StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native"
import { BlurView } from "expo-blur"
import { PhosphorIcon } from "@/components/PhosphorIcon"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export const SCREEN_HEADER_HEIGHT = 52

export type ScreenHeaderProps = {
  title: string
  subtitle?: string
  leftAction?: ReactNode
  rightAction?: ReactNode
  scrollY?: SharedValue<number>
  showBackButton?: boolean
  onBackPress?: () => void
}

export const ScreenHeader: FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  leftAction,
  rightAction,
  scrollY,
  showBackButton = true,
  onBackPress,
}) => {
  useColorMode()
  const insets = useSafeAreaInsets()
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark

  const dividerStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 }
    const opacity = interpolate(scrollY.value, [0, 16], [0, 1], Extrapolation.CLAMP)
    return { opacity }
  })

  const blurStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 }
    const opacity = interpolate(scrollY.value, [0, 24], [0, 1], Extrapolation.CLAMP)
    return { opacity }
  })

  const handleBack = () => {
    if (onBackPress) return onBackPress()
    if (router.canGoBack()) router.back()
  }

  const left = leftAction ?? (showBackButton ? (
    <TouchableOpacity onPress={handleBack} hitSlop={12}>
      <PhosphorIcon name="chevron-back" size={24} color={colors.text} />
    </TouchableOpacity>
  ) : null)

  return (
    <View
      pointerEvents="box-none"
      style={[$wrap, { paddingTop: insets.top, height: insets.top + SCREEN_HEADER_HEIGHT }]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
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
              { backgroundColor: isDark ? "rgba(10,10,12,0.86)" : "rgba(245,242,238,0.92)" },
            ]}
          />
        )}
      </Animated.View>

      <View style={[$row, { height: SCREEN_HEADER_HEIGHT }]}>
        <View style={$side}>{left}</View>
        <View style={$center}>
          <Text text={title} weight="semiBold" style={{ color: colors.text }} />
          {subtitle ? (
            <Text text={subtitle} size="xxs" style={{ color: colors.textDim, marginTop: 2 }} />
          ) : null}
        </View>
        <View style={[$side, { alignItems: "flex-end" }]}>{rightAction}</View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[$divider, { backgroundColor: colors.surfaceCardBorder }, dividerStyle]}
      />
    </View>
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
  paddingHorizontal: 16,
}

const $side: ViewStyle = {
  width: 88,
  flexDirection: "row",
  alignItems: "center",
}

const $center: ViewStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
}

const $divider: ViewStyle = {
  height: StyleSheet.hairlineWidth,
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
}
