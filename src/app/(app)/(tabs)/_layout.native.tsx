import Ionicons from "@expo/vector-icons/Ionicons"
import { requireOptionalNativeModule } from "expo-modules-core"
import { Tabs } from "expo-router"
import { DynamicColorIOS, Platform } from "react-native"

const IOS_LABEL_COLOR =
  Platform.OS === "ios"
    ? DynamicColorIOS({
        dark: "rgba(255,255,255,0.76)",
        light: "rgba(0,0,0,0.72)",
      })
    : "rgba(255,255,255,0.72)"

const IOS_TINT_COLOR =
  Platform.OS === "ios"
    ? DynamicColorIOS({
        dark: "#FFFFFF",
        light: "#000000",
      })
    : "#C3E0FF"

const IOS_CONTENT_BACKGROUND = "#0A0A0C"
const FALLBACK_ACCENT = "#C3E0FF"
const FALLBACK_INACTIVE = "rgba(255,255,255,0.72)"

function canUseNativeTabs() {
  if (Platform.OS !== "ios") return true

  return !!requireOptionalNativeModule("ExpoGlassEffect")
}

function FallbackTabs() {
  const TAB_CONFIG = {
    index: { icon: "home-outline", activeIcon: "home", label: "Home" },
    trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
  } as const

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        // Hide routes that aren't in TAB_CONFIG (e.g. deprecated device tab)
        if (!config) {
          return { href: null, headerShown: false }
        }

        return {
          headerShown: false,
          tabBarActiveTintColor: FALLBACK_ACCENT,
          tabBarInactiveTintColor: FALLBACK_INACTIVE,
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

export default function NativeTabsLayout() {
  if (!canUseNativeTabs()) {
    return <FallbackTabs />
  }

  try {
    const { NativeTabs } = require("expo-router/unstable-native-tabs")

    return (
      <NativeTabs
        disableTransparentOnScrollEdge
        iconColor={{
          default: IOS_LABEL_COLOR,
          selected: IOS_TINT_COLOR,
        }}
        labelStyle={{
          fontSize: 11,
          fontWeight: "600",
          color: IOS_LABEL_COLOR,
        }}
        minimizeBehavior="onScrollDown"
        tintColor={IOS_TINT_COLOR}
      >
        <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: IOS_CONTENT_BACKGROUND }}>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
            md="home"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="trends" contentStyle={{ backgroundColor: IOS_CONTENT_BACKGROUND }}>
          <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.line.uptrend.xyaxis", selected: "chart.line.uptrend.xyaxis" }}
            md="monitoring"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    )
  } catch {
    return <FallbackTabs />
  }
}
