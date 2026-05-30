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
      <Stack.Screen name="recovery-detail" />
      <Stack.Screen name="healthspan" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="settings-notifications" />
      <Stack.Screen name="settings-goals" />
      <Stack.Screen name="settings-integrations" />
      <Stack.Screen name="settings-data-export" />
      <Stack.Screen
        name="journal-entry"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="dev-activity-strip"
        options={{ headerShown: true, title: "Activity Strip" }}
      />
      <Stack.Screen name="bout-detail" options={{ headerShown: false }} />
    </Stack>
  )
}
