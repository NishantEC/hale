/* eslint-disable import/first */
/**
 * Welcome to the main entry point of the app. In this file, we'll
 * be kicking off our app.
 *
 * Most of this file is boilerplate and you shouldn't need to modify
 * it very often. But take some time to look through and understand
 * what is going on here.
 *
 * The app navigation resides in ./app/navigators, so head over there
 * if you're interested in adding screens and navigators.
 */
if (__DEV__) {
  // Load Reactotron in development only.
  // Note that you must be using metro's `inlineRequires` for this to work.
  // If you turn it off in metro.config.js, you'll have to manually import it.
  require("./devtools/ReactotronConfig.ts")
}
import "./utils/gestureHandler"

import { useEffect, useState } from "react"
import { AppState } from "react-native"
import * as Linking from "expo-linking"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import { TamaguiProvider } from "tamagui"

import tamaguiConfig from "../tamagui.config"

import { AuthProvider } from "./context/AuthContext"
import { DashboardProvider } from "./context/DashboardContext"
import { initI18n } from "./i18n"
import { AppNavigator } from "./navigators/AppNavigator"
import { useNavigationPersistence } from "./navigators/navigationUtilities"
import { apiGet, apiPost } from "./services/api/noopClient"
import { openDatabase, runMigrations } from "./services/db"
import { setViewCache } from "./services/db/repositories/viewCache"
import { SyncService } from "./services/sync/SyncService"
import { drainOnce } from "./services/sync/uplinkDrainer"
import { pullDownlink } from "./services/sync/downlinkPuller"
import { sweepRetention } from "./services/sync/retentionSweeper"
import {
  DEFAULT_RAW_RETENTION_DAYS,
  SETTING_RAW_RETENTION_DAYS,
  getSetting,
} from "./services/db/repositories/settings"
import { loadDateFnsLocale } from "./utils/formatDate"
import * as storage from "./utils/storage"

export const NAVIGATION_PERSISTENCE_KEY = "NAVIGATION_STATE"

// Web linking configuration
const prefix = Linking.createURL("/")
const config = {
  screens: {
    Login: {
      path: "",
    },
    Welcome: "welcome",
  },
}

/**
 * This is the root component of our app.
 * @param {AppProps} props - The props for the `App` component.
 * @returns {JSX.Element} The rendered `App` component.
 */
export function App() {
  const {
    initialNavigationState,
    onNavigationStateChange,
    isRestored: isNavigationStateRestored,
  } = useNavigationPersistence(storage, NAVIGATION_PERSISTENCE_KEY)

  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const [isDbReady, setIsDbReady] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  useEffect(() => {
    runMigrations()
      .then(() => setIsDbReady(true))
      .catch((err) => {
        console.error("[db] migration failed", err)
        setIsDbReady(true)
      })
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
        const raw = Number(await getSetting(db, SETTING_RAW_RETENTION_DAYS)) || DEFAULT_RAW_RETENTION_DAYS
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

  // Before we show the app, we have to wait for our state to be ready.
  // In the meantime, don't render anything. This will be the background
  // color set in native by rootView's background color.
  // In iOS: application:didFinishLaunchingWithOptions:
  // In Android: https://stackoverflow.com/a/45838109/204044
  // You can replace with your own loading component if you wish.
  if (!isNavigationStateRestored || !isI18nInitialized || !isDbReady) {
    return null
  }

  const linking = {
    prefixes: [prefix],
    config,
  }

  // otherwise, we're ready to render the app
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
          <KeyboardProvider>
            <AuthProvider>
              <DashboardProvider>
                <AppNavigator
                  linking={linking}
                  initialState={initialNavigationState}
                  onStateChange={onNavigationStateChange}
                />
              </DashboardProvider>
            </AuthProvider>
          </KeyboardProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
