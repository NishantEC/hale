import { useEffect } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Ionicons from "@expo/vector-icons/Ionicons"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

import { ICON_SIZE, LABEL_SIZE, SPRING_DEFAULT, SPRING_PUNCHY } from "./tokens"

export type TabCellProps = {
  label: string
  iconOutline: keyof typeof Ionicons.glyphMap
  iconFilled: keyof typeof Ionicons.glyphMap
  focused: boolean
  onPress: () => void
}

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons)

export function TabCell({ label, iconOutline, iconFilled, focused, onPress }: TabCellProps) {
  const colors = LOCAL_THEME.colors
  const reduced = useReducedMotion()

  const focus = useDerivedValue(() => {
    return reduced ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, SPRING_DEFAULT)
  }, [focused, reduced])

  const press = useSharedValue(1)
  const onPressIn = () => {
    press.value = reduced ? 0.92 : withSpring(0.92, SPRING_PUNCHY)
  }
  const onPressOut = () => {
    press.value = reduced ? 1 : withSpring(1, SPRING_PUNCHY)
  }

  const iconStackStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(focus.value, [0, 1], [1, 1.06]) * press.value },
    ],
  }))
  const fillStyle = useAnimatedStyle(() => ({ opacity: focus.value }))
  const lineStyle = useAnimatedStyle(() => ({ opacity: 1 - focus.value }))

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : undefined}
      style={styles.cell}
    >
      <Animated.View style={[styles.iconStack, iconStackStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconWrap, lineStyle]}>
          <Ionicons name={iconOutline} size={ICON_SIZE} color={focused ? colors.text : colors.textDim} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconWrap, fillStyle]}>
          <Ionicons name={iconFilled} size={ICON_SIZE} color={colors.text} />
        </Animated.View>
      </Animated.View>
      <Text
        text={label}
        style={[
          styles.label,
          { fontSize: LABEL_SIZE, color: focused ? colors.text : colors.textDim },
        ]}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  cell: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingVertical: 6,
  },
  iconStack: {
    height: ICON_SIZE,
    width: ICON_SIZE,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "600",
    marginTop: 4,
  },
})
