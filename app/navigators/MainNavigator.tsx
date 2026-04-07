import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { Platform, View } from "react-native"

import { DeviceScreen } from "@/screens/DeviceScreen"
import { HomeScreen } from "@/screens/HomeScreen"
import { TrendsScreen } from "@/screens/TrendsScreen"
import { useAppTheme } from "@/theme/context"

const Tab = createBottomTabNavigator()
const ACCENT = "#C3E0FF"

const TAB_CONFIG = {
  Home: { icon: "home-outline", activeIcon: "home", label: "Home" },
  Trends: { icon: "stats-chart-outline", activeIcon: "stats-chart", label: "Trends" },
  Device: { icon: "radio-outline", activeIcon: "radio", label: "Device" },
} as const

export function MainNavigator() {
  const {
    theme: { colors },
  } = useAppTheme()

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG]

        return {
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: "transparent",
            borderTopColor: "rgba(255,255,255,0.08)",
            borderTopWidth: Platform.OS === "ios" ? 0.6 : 1,
            elevation: 0,
            position: "absolute",
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                tint="systemChromeMaterialDark"
                intensity={80}
                style={{ flex: 1, backgroundColor: "rgba(12,12,16,0.28)" }}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.background }} />
            ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? config.activeIcon : config.icon}
              size={22}
              color={color}
            />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: "#0A0A0C" },
          tabBarLabel: config.label,
        }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Trends" component={TrendsScreen} />
      <Tab.Screen name="Device" component={DeviceScreen} />
    </Tab.Navigator>
  )
}
