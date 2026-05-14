import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { PhosphorIcon } from "@/components/PhosphorIcon"
import { BlurView } from "expo-blur"
import { Platform, View } from "react-native"

import { DebugInspectorScreen } from "@/screens/DebugInspectorScreen"
import { DeviceScreen } from "@/screens/DeviceScreen"
import { HomeScreen } from "@/screens/HomeScreen"
import { TrendsScreen } from "@/screens/TrendsScreen"

const Tab = createBottomTabNavigator()

const TAB_CONFIG = {
  Home: { icon: "home-outline", activeIcon: "home", label: "Home" },
  Trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
  Device: { icon: "radio-outline", activeIcon: "radio", label: "Device" },
  Inspector: { icon: "pulse-outline", activeIcon: "pulse", label: "Inspector" },
} as const

export function MainNavigator() {
  const colors = {
    tint: "#C76542",
    textDim: "#564E4A",
    border: "#B6ACA6",
    background: "#F0EDE8",
    screenBackground: "#F0EDE8",
    tabBarBlur: "rgba(247, 247, 249, 0.72)",
  }
  const isDark = false

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        return {
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textDim,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: "transparent",
            borderTopColor: colors.border,
            borderTopWidth: Platform.OS === "ios" ? 0.6 : 1,
            elevation: 0,
            position: "absolute",
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterial"}
                intensity={80}
                style={{ flex: 1, backgroundColor: colors.tabBarBlur }}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.background }} />
            ),
          tabBarIcon: ({ color, focused }) => (
            <PhosphorIcon
              name={focused ? config.activeIcon : config.icon}
              size={22}
              color={color}
            />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: colors.screenBackground },
          tabBarLabel: config.label,
        }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Trends" component={TrendsScreen} />
      <Tab.Screen name="Device" component={DeviceScreen} />
      <Tab.Screen name="Inspector" component={DebugInspectorScreen} />
    </Tab.Navigator>
  )
}
