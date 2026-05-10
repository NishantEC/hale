import { Tabs } from "expo-router"

import { AppTabBar } from "@/components/AppTabBar"
import { useColorMode } from "@/context/ThemeContext"

export default function TabsLayout() {
  useColorMode()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: "absolute" },
      }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="settings" />
    </Tabs>
  )
}
