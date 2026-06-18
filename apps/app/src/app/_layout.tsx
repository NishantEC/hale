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
import { openDatabase, runMigrations, wipeDatabase } from "@/services/db"
import { peekActiveUserId, setActiveUserId } from "@/services/db/session"
import { resolveLocalUserId } from "@/services/identity/localIdentity"
import { runRecentDays } from "@/services/compute/runDeviceCompute"
import { initBleStoreBridge } from "@/stores/bleStoreBridge"
import { initSyncStoreBridge } from "@/stores/syncStoreBridge"
import { delay } from "@/utils/delay"

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
    // Hold the bridge teardowns so Fast Refresh / unmount of the root
    // doesn't leak BLE / packet listeners (each remount otherwise piles a
    // fresh subscription on top of the previous one).
    let bleBridgeTeardown: (() => void) | null = null
    let syncBridgeTeardown: (() => void) | null = null
    const attempt = () => {
      runMigrations()
        .then(async () => {
          if (cancelled) return
          // Resolve + set the device-local identity BEFORE wiring write paths
          // (BLE ingest, telemetry) or rendering, so boot-time writes don't hit
          // "No active user". The common path (reusing the stored email) is
          // effectively synchronous; AuthProvider idempotently re-sets it too.
          try {
            setActiveUserId(await resolveLocalUserId())
          } catch (err) {
            console.warn("[identity] boot resolve failed", err)
          }
          if (cancelled) return
          bleBridgeTeardown = initBleStoreBridge()
          syncBridgeTeardown = initSyncStoreBridge()
          setIsDbReady(true)
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
      bleBridgeTeardown?.()
      syncBridgeTeardown?.()
    }
  }, [])

  // Local source of truth: persist the on-device pipeline's recent output so
  // the dashboard shows local data. Recent-first + bounded so today computes
  // within seconds; the synced night_features already cover baseline priors,
  // so a heavy 60-day boot backfill isn't needed (full local-history fill is a
  // separate pre-teardown step). Waits for the DB + device-local identity;
  // never crashes startup.
  useEffect(() => {
    if (!isDbReady) return
    let cancelled = false
    void (async () => {
      try {
        let userId = peekActiveUserId()
        for (let i = 0; !userId && i < 20; i++) {
          await delay(250)
          userId = peekActiveUserId()
        }
        const db = openDatabase()
        if (cancelled || !userId) return
        let timeZone = "UTC"
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        } catch {
          // Hermes Intl gap — fall back to UTC.
        }
        await runRecentDays(db, userId, timeZone, 3)
      } catch (err) {
        console.warn("[compute] device history bootstrap failed", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isDbReady])

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
