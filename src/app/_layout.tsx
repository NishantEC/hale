/* eslint-disable import/first */
if (__DEV__) {
  require("../../app/devtools/ReactotronConfig.ts")
}
import "@/utils/gestureHandler"

import { useEffect, useState } from "react"
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native"
import { Stack } from "expo-router"
import { useFonts } from "expo-font"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { AuthProvider } from "@/context/AuthContext"
import { ToastProviderWithViewport } from "@/components/reactx/toast"
import { DashboardProvider } from "@/context/DashboardContext"
import { initI18n } from "@/i18n"
import { ThemeProvider, useAppTheme } from "@/theme/context"
import { customFontsToLoad } from "@/theme/typography"
import { loadDateFnsLocale } from "@/utils/formatDate"

function RootStackLayout() {
  const {
    navigationTheme,
    theme: { colors },
  } = useAppTheme()

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      />
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  const [areFontsLoaded, fontLoadError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  if (!isI18nInitialized || (!areFontsLoaded && !fontLoadError)) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
          <AuthProvider>
            <DashboardProvider>
              <ThemeProvider>
                <ToastProviderWithViewport>
                  <RootStackLayout />
                </ToastProviderWithViewport>
              </ThemeProvider>
            </DashboardProvider>
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
