import Ionicons from "@expo/vector-icons/Ionicons"
import { Tabs } from "expo-router"

const ACCENT = "#C3E0FF"

const TAB_CONFIG = {
  index: { icon: "home-outline", activeIcon: "home", label: "Home" },
  sleep: { icon: "moon-outline", activeIcon: "moon", label: "Sleep" },
  trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
} as const

export default function WebTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        if (!config) {
          return { href: null, headerShown: false }
        }

        return {
          headerShown: false,
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: "#0A0A0C",
            borderTopColor: "rgba(255,255,255,0.08)",
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
