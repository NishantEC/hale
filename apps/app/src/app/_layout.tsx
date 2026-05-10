/* eslint-disable import/first */
if (__DEV__) {
  require("../../app/devtools/ReactotronConfig.ts")
}
import "@/utils/gestureHandler"

import { useEffect, useState } from "react"
import { Alert, AppState } from "react-native"
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
import { ThemeProvider, ThemedSubtree, useColorMode } from "@/context/ThemeContext"
import { initI18n } from "@/i18n"
import { useNavigationTheme } from "@/navigators/useNavigationTheme"
import { LOCAL_THEME } from "@/utils/localTheme"
import { loadDateFnsLocale } from "@/utils/formatDate"
import { apiGet, apiPost } from "@/services/api/noopClient"
import { openDatabase, runMigrations, wipeDatabase } from "@/services/db"
import {
  DEFAULT_RAW_RETENTION_DAYS,
  SETTING_RAW_RETENTION_DAYS,
  getSetting,
} from "@/services/db/repositories/settings"
import { setViewCache } from "@/services/db/repositories/viewCache"
import { SyncService } from "@/services/sync/SyncService"
import { drainOnce } from "@/services/sync/uplinkDrainer"
import { pullDownlink } from "@/services/sync/downlinkPuller"
import { sweepRetention } from "@/services/sync/retentionSweeper"

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
          if (!cancelled) setIsDbReady(true)
        })
        .catch((err) => {
          if (cancelled) return
          // Don't proceed with isDbReady=true on a broken DB. The app would
          // load and then explode on the first repository call. Surface the
          // failure and offer recovery.
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

  useEffect(() => {
    if (!isDbReady) return
    const db = openDatabase()
    const svc = new SyncService({
      drainFn: () =>
        drainOnce(db, {
          post: (tableName, payloads) =>
            apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }),
          batchSize: 200,
        }),
      pullFn: async () => {
        await pullDownlink(db, {
          apiGet: async (path) => apiGet(path),
          tables: [
            "daily_metrics",
            "daily_scores",
            "sleep_detections",
            "sleep_stages",
            "night_features",
            "signal_samples",
            "activity_detections",
            "baseline_profile",
            "sleep_plans",
          ],
        })
        const today = new Date().toISOString().slice(0, 10)
        try {
          const [home, sleep, trends] = await Promise.all([
            apiGet(`/views/home?date=${today}`),
            apiGet(`/views/sleep?date=${today}`),
            apiGet(`/views/trends?days=30`),
          ])
          await setViewCache(db, "home", today, home)
          await setViewCache(db, "sleep", today, sleep)
          await setViewCache(db, "trends", "30d", trends)
        } catch (err) {
          console.warn("[sync] view cache refresh failed", err)
        }
      },
      intervalMs: 15_000,
    })
    svc.start()
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return
      await svc.refresh()
      try {
        const raw =
          Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) ||
          DEFAULT_RAW_RETENTION_DAYS
        if (raw > 0) await sweepRetention(db, { rawDays: raw })
      } catch (err) {
        console.warn("[sync] retention sweep failed", err)
      }
    })
    return () => {
      svc.stop()
      sub.remove()
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
              <ThemeProvider>
                <DashboardProvider>
                  <ToastProviderWithViewport>
                    <RootStackLayout />
                  </ToastProviderWithViewport>
                </DashboardProvider>
              </ThemeProvider>
            </AuthProvider>
          </KeyboardProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
