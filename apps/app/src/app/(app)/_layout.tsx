import { Redirect, Stack } from "expo-router"

import { useAuth } from "@/context/AuthContext"

export default function AppLayout() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sleep-detail" />
      <Stack.Screen name="home-metric" />
      <Stack.Screen name="home-details" />
      <Stack.Screen name="strain-activity" />
      <Stack.Screen name="journal-history" />
      <Stack.Screen
        name="sleep-planner"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents" as any,
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
          headerShown: false,
        }}
      />
      <Stack.Screen name="device-settings" />
      <Stack.Screen name="health-monitor" />
      <Stack.Screen name="stress-monitor" />
      <Stack.Screen name="hrv-detail" />
      <Stack.Screen
        name="journal-entry"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="debug-inspector"
        options={{
          presentation: "modal",
          animation: "slide_from_right",
        }}
      />
    </Stack>
  )
}
