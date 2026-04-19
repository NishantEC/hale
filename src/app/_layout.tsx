/* eslint-disable import/first */
if (__DEV__) {
  require("../../app/devtools/ReactotronConfig.ts")
}
import "@/utils/gestureHandler"

import { useEffect, useState } from "react"
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native"
import { Stack } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import { TamaguiProvider } from "tamagui"

import tamaguiConfig from "../../tamagui.config"
import { AuthProvider } from "@/context/AuthContext"
import { ToastProviderWithViewport } from "@/components/reactx/toast"
import { DashboardProvider } from "@/context/DashboardContext"
import { initI18n } from "@/i18n"
import { useNavigationTheme } from "@/navigators/useNavigationTheme"
import { loadDateFnsLocale } from "@/utils/formatDate"

function RootStackLayout() {
  const navigationTheme = useNavigationTheme()

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#F0EDE8",
          },
        }}
      />
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  if (!isI18nInitialized) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
          <KeyboardProvider>
            <AuthProvider>
              <DashboardProvider>
                <ToastProviderWithViewport>
                  <RootStackLayout />
                </ToastProviderWithViewport>
              </DashboardProvider>
            </AuthProvider>
          </KeyboardProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
