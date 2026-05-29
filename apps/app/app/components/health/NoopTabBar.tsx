import { FC, useEffect, useRef, useState } from "react"
import { LayoutChangeEvent, Pressable, View, ViewStyle } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { Gauge, GearSix, House, IconProps, Pulse } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type IconType = FC<IconProps>

const ICONS: Record<string, IconType> = {
  index: House,
  health: Pulse,
  inspector: Gauge,
  settings: GearSix,
}

const LABELS: Record<string, string> = {
  index: "Home",
  health: "Health",
  inspector: "Inspector",
  settings: "Settings",
}

const SPRING = { damping: 22, stiffness: 240, mass: 0.7 }

export const NoopTabBar: FC<BottomTabBarProps> = ({ state, navigation }) => {
  const { colors } = LOCAL_THEME
  // Static brand tint — matches the rest of the app's monochrome `colors.tint`
  // (white in dark theme, near-black in light). Decoupled from health state so
  // the tab bar reads as fixed chrome instead of a status indicator.
  const tint = brandTint(colors)

  const [layouts, setLayouts] = useState<Record<number, { x: number; width: number }>>({})
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts

  const pillX = useSharedValue(0)
  const pillW = useSharedValue(0)

  useEffect(() => {
    const layout = layoutsRef.current[state.index]
    if (!layout) return
    pillX.value = withSpring(layout.x, SPRING)
    pillW.value = withSpring(layout.width, SPRING)
  }, [state.index, pillX, pillW, layouts])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }))

  const handleLayout = (idx: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout
    setLayouts((prev) => {
      if (prev[idx]?.x === x && prev[idx]?.width === width) return prev
      const next = { ...prev, [idx]: { x, width } }
      if (idx === state.index) {
        pillX.value = x
        pillW.value = width
      }
      return next
    })
  }

  return (
    <View pointerEvents="box-none" style={$wrap}>
      <View
        style={[
          $bar,
          {
            backgroundColor: colors.surfaceCard,
            borderColor: colors.surfaceCardBorder,
            shadowColor: "#000",
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            $pill,
            pillStyle,
            {
              backgroundColor: tint.pillBackground,
              borderColor: tint.pillBorder,
              shadowColor: tint.glow,
            },
          ]}
        />
        {state.routes.map((route, idx) => {
          const Icon = ICONS[route.name] ?? House
          const focused = state.index === idx
          const label = LABELS[route.name] ?? route.name
          return (
            <Pressable
              key={route.key}
              onLayout={handleLayout(idx)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={focused ? { selected: true } : undefined}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              style={focused ? $tabActive : $tab}
              hitSlop={6}
            >
              <Icon
                size={20}
                color={focused ? tint.iconActive : colors.textMuted}
                weight={focused ? "fill" : "regular"}
              />
              {focused ? (
                <Text
                  text={label}
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "700",
                    letterSpacing: -0.1,
                    marginLeft: 8,
                  }}
                />
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function brandTint(colors: typeof LOCAL_THEME.colors): {
  iconActive: string
  pillBackground: string
  pillBorder: string
  glow: string
} {
  return {
    iconActive: colors.tint,
    pillBackground: hexAlpha(colors.tint, 0.14),
    pillBorder: hexAlpha(colors.tint, 0.32),
    glow: colors.tint,
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()
  return `${hex}${a}`
}

const $wrap: ViewStyle = {
  position: "absolute",
  bottom: 18,
  left: 0,
  right: 0,
  alignItems: "center",
}

const $bar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 6,
  paddingVertical: 6,
  gap: 4,
  borderRadius: 999,
  borderWidth: 1,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.45,
  shadowRadius: 24,
  elevation: 8,
}

const $tab: ViewStyle = {
  height: 42,
  minWidth: 42,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 10,
  borderRadius: 999,
}

const $tabActive: ViewStyle = {
  height: 42,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 14,
  borderRadius: 999,
}

const $pill: ViewStyle = {
  position: "absolute",
  top: 6,
  bottom: 6,
  left: 0,
  borderRadius: 999,
  borderWidth: 1,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 18,
}
