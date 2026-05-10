import { useMemo } from "react"
import { Platform, Pressable, StyleSheet, View, ViewStyle } from "react-native"
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { BlurView } from "expo-blur"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type TabKey = "index" | "health" | "settings"

type RouteSpec = {
  key: TabKey
  label: string
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
}

const ROUTES: RouteSpec[] = [
  { key: "index", label: "Home", icon: "home-outline", activeIcon: "home" },
  { key: "health", label: "Health", icon: "pulse-outline", activeIcon: "pulse" },
  { key: "settings", label: "Settings", icon: "settings-outline", activeIcon: "settings" },
]

const BAR_HEIGHT = 56

export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark
  const bottomInset = Math.max(insets.bottom, 8)

  const focusedKey = state.routes[state.index]?.name as TabKey | undefined

  const cells = useMemo(() => {
    return { home: ROUTES[0], health: ROUTES[1], settings: ROUTES[2] }
  }, [])

  const navigateTo = (name: TabKey) => {
    const target = state.routes.find((r) => r.name === name)
    if (!target) return
    const event = navigation.emit({
      type: "tabPress",
      target: target.key,
      canPreventDefault: true,
    })
    if (!event.defaultPrevented) {
      navigation.navigate(target.name, target.params)
    }
  }

  const openJournal = () => {
    router.push("/journal-entry" as never)
  }

  return (
    <View style={{ paddingBottom: bottomInset }}>
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 0}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.tabBarBlur,
            borderTopColor: colors.divider,
            borderTopWidth: StyleSheet.hairlineWidth,
          },
        ]}
      />

      <View style={[styles.row, { height: BAR_HEIGHT }]}>
        <TabCell
          label={cells.home.label}
          icon={cells.home.icon}
          activeIcon={cells.home.activeIcon}
          focused={focusedKey === "index"}
          onPress={() => navigateTo("index")}
        />
        <TabCell
          label={cells.health.label}
          icon={cells.health.icon}
          activeIcon={cells.health.activeIcon}
          focused={focusedKey === "health"}
          onPress={() => navigateTo("health")}
        />
        <PlusCell onPress={openJournal} />
        <TabCell
          label={cells.settings.label}
          icon={cells.settings.icon}
          activeIcon={cells.settings.activeIcon}
          focused={focusedKey === "settings"}
          onPress={() => navigateTo("settings")}
        />
      </View>
    </View>
  )
}

function TabCell({
  label,
  icon,
  activeIcon,
  focused,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
  focused: boolean
  onPress: () => void
}) {
  const colors = LOCAL_THEME.colors
  const tint = focused ? colors.text : colors.textDim

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : undefined}
      style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={focused ? activeIcon : icon} size={24} color={tint} />
      <Text
        text={label}
        style={{ color: tint, fontSize: 10.5, fontWeight: "600", marginTop: 2 }}
      />
    </Pressable>
  )
}

function PlusCell({ onPress }: { onPress: () => void }) {
  const colors = LOCAL_THEME.colors

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Log a journal entry"
      style={({ pressed }) => [
        styles.cell,
        pressed && { opacity: 0.85, transform: [{ scale: 0.94 }] },
      ]}
    >
      <View style={[styles.plusBadge, { backgroundColor: colors.tint }]}>
        <Ionicons name="add" size={22} color={colors.onPrimary} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
  cell: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 6,
  } as ViewStyle,
  plusBadge: {
    alignItems: "center",
    borderRadius: 16,
    height: 34,
    justifyContent: "center",
    width: 44,
  },
})
