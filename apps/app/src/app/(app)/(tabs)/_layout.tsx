import { Tabs } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"

import { useColorMode } from "@/context/ThemeContext"
import { LOCAL_THEME } from "@/utils/localTheme"

const TAB_CONFIG = {
  index: { icon: "home-outline", activeIcon: "home", label: "Home" },
  health: { icon: "pulse-outline", activeIcon: "pulse", label: "Health" },
  journal: { icon: "add-circle-outline", activeIcon: "add-circle", label: "Log" },
  sleep: { icon: "moon-outline", activeIcon: "moon", label: "Sleep" },
  settings: { icon: "settings-outline", activeIcon: "settings", label: "Settings" },
} as const

export default function WebTabsLayout() {
  useColorMode()
  const colors = LOCAL_THEME.colors

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        if (!config) {
          return { href: null, headerShown: false }
        }

        return {
          headerShown: false,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textDim,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.divider,
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={(focused ? config.activeIcon : config.icon) as any}
              size={22}
              color={color}
            />
          ),
          tabBarLabel: config.label,
        }
      }}
    />
  )
}
