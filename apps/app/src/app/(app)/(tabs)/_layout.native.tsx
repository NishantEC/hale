import { Platform } from "react-native"
import { requireOptionalNativeModule } from "expo-modules-core"
import { Tabs } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"

import { useColorMode } from "@/context/ThemeContext"
import { LOCAL_THEME } from "@/utils/localTheme"

function canUseNativeTabs() {
  if (Platform.OS !== "ios") return true

  return !!requireOptionalNativeModule("ExpoGlassEffect")
}

function FallbackTabs() {
  useColorMode()
  const colors = LOCAL_THEME.colors

  const TAB_CONFIG = {
    index: { icon: "home-outline", activeIcon: "home", label: "Home" },
    trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
    journal: { icon: "add-circle-outline", activeIcon: "add-circle", label: "Log" },
    settings: { icon: "settings-outline", activeIcon: "settings", label: "Settings" },
  } as const

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

export default function NativeTabsLayout() {
  useColorMode()
  const colors = LOCAL_THEME.colors

  if (!canUseNativeTabs()) {
    return <FallbackTabs />
  }

  try {
    const { NativeTabs } = require("expo-router/unstable-native-tabs")
    const contentBackground = colors.background

    return (
      <NativeTabs
        disableTransparentOnScrollEdge
        iconColor={{
          default: colors.textDim,
          selected: colors.text,
        }}
        labelStyle={{
          fontSize: 11,
          fontWeight: "600",
          color: colors.textDim,
        }}
        minimizeBehavior="onScrollDown"
        tintColor={colors.text}
      >
        <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: contentBackground }}>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="trends" contentStyle={{ backgroundColor: contentBackground }}>
          <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.line.uptrend.xyaxis", selected: "chart.line.uptrend.xyaxis" }}
            md="monitoring"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="journal" contentStyle={{ backgroundColor: contentBackground }}>
          <NativeTabs.Trigger.Label>Log</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "plus.circle", selected: "plus.circle.fill" }}
            md="add_circle"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: contentBackground }}>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "gearshape", selected: "gearshape.fill" }}
            md="settings"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    )
  } catch {
    return <FallbackTabs />
  }
}
