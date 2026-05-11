import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import Ionicons from "@expo/vector-icons/Ionicons"

import { LOCAL_THEME } from "@/utils/localTheme"

import { FAB_ICON_SIZE, FAB_SIZE, SPRING_DEFAULT, SPRING_PUNCHY } from "./tokens"

export type PlusFabProps = {
  isOpen: boolean
  onPress: () => void
}

export function PlusFab({ isOpen, onPress }: PlusFabProps) {
  const colors = LOCAL_THEME.colors
  const reduced = useReducedMotion()

  const scale = useSharedValue(1)

  const openness = useDerivedValue(() => {
    return reduced ? (isOpen ? 1 : 0) : withSpring(isOpen ? 1 : 0, SPRING_DEFAULT)
  }, [isOpen, reduced])

  const onPressIn = () => {
    scale.value = reduced ? 0.92 : withSpring(0.92, SPRING_PUNCHY)
  }
  const onPressOut = () => {
    scale.value = reduced ? 1 : withSpring(1, SPRING_PUNCHY)
  }

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(openness.value, [0, 1], [0, 45])}deg` }],
  }))

  return (
    <Animated.View style={[styles.wrap, fabStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Log a journal entry"
        style={styles.button}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.fabBackground, { backgroundColor: colors.tint }]}
        />
        <Animated.View style={iconStyle}>
          <Ionicons name="add" size={FAB_ICON_SIZE} color={colors.onPrimary} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    height: FAB_SIZE,
    width: FAB_SIZE,
  },
  button: {
    alignItems: "center",
    borderRadius: FAB_SIZE / 2,
    height: FAB_SIZE,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#C76542",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    width: FAB_SIZE,
  },
  fabBackground: {
    borderRadius: FAB_SIZE / 2,
  },
})
