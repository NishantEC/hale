/* eslint-disable import/first */
if (__DEV__) {
  require("../../app/devtools/ReactotronConfig.ts")
}
import "@/utils/gestureHandler"

import { useEffect, useState } from "react"
import { Alert } from "react-native"
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native"
import { Stack } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import { TamaguiProvider } from "tamagui"

import tamaguiConfig from "../../tamagui.config"
import { AuthProvider } from "@/context/AuthContext"
import { SyncProvider } from "@/context/SyncContext"
import { BleProvider } from "@/context/BleContext"
import { SyncLiveActivityBridge } from "@/services/sync/useSyncLiveActivity"
import { ToastProviderWithViewport } from "@/components/reactx/toast"
import { DashboardProvider } from "@/context/DashboardContext"
import { HealthKitProvider } from "@/context/HealthKitContext"
import { ThemeProvider, ThemedSubtree, useColorMode } from "@/context/ThemeContext"
import { initI18n } from "@/i18n"
import { useNavigationTheme } from "@/navigators/useNavigationTheme"
import { LOCAL_THEME } from "@/utils/localTheme"
import { loadDateFnsLocale } from "@/utils/formatDate"
import { runMigrations, wipeDatabase } from "@/services/db"
import { initBleStoreBridge } from "@/stores/bleStoreBridge"
import { initSyncStoreBridge } from "@/stores/syncStoreBridge"

function RootStackLayout() {
  const navigationTheme = useNavigationTheme()
  useColorMode()

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <ThemedSubtree>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: LOCAL_THEME.colors.screenBackground,
            },
          }}
        />
      </ThemedSubtree>
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const [isDbReady, setIsDbReady] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  useEffect(() => {
    let cancelled = false
    const attempt = () => {
      runMigrations()
        .then(() => {
          if (!cancelled) {
            initBleStoreBridge()
            initSyncStoreBridge()
            setIsDbReady(true)
          }
        })
        .catch((err) => {
          if (cancelled) return
          console.error("[db] migration failed", err)
          Alert.alert(
            "Local database error",
            `The on-device database failed to initialize.\n\n${String(err)}\n\nRetry, or reset local data to recover (pending un-synced data will be lost).`,
            [
              { text: "Retry", onPress: attempt },
              {
                text: "Reset local data",
                style: "destructive",
                onPress: async () => {
                  try {
                    await wipeDatabase()
                  } catch (wipeErr) {
                    console.error("[db] wipe failed", wipeErr)
                  }
                  attempt()
                },
              },
            ],
            { cancelable: false },
          )
        })
    }
    attempt()
    return () => {
      cancelled = true
    }
  }, [])

  if (!isI18nInitialized || !isDbReady) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
          <KeyboardProvider>
            <AuthProvider>
              <SyncProvider isDbReady={isDbReady}>
                <ThemeProvider>
                  <DashboardProvider>
                    <BleProvider>
                      <HealthKitProvider>
                        <ToastProviderWithViewport>
                          <SyncLiveActivityBridge />
                          <RootStackLayout />
                        </ToastProviderWithViewport>
                      </HealthKitProvider>
                    </BleProvider>
                  </DashboardProvider>
                </ThemeProvider>
              </SyncProvider>
            </AuthProvider>
          </KeyboardProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
