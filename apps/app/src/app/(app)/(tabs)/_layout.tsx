import { useMemo } from "react"
import { Platform, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { Tabs, usePathname } from "expo-router"

import { ActivityStrip, useActivityStripState } from "@/components/ActivityStrip"
import { AuroraBackdrop, type AuroraState } from "@/components/health/AuroraBackdrop"
import { NoopTabBar } from "@/components/health/NoopTabBar"
import { TopHeader } from "@/components/health/TopHeader"
import { useDashboard } from "@/context/DashboardContext"
import { useColorMode } from "@/context/ThemeContext"
import { LOCAL_THEME } from "@/utils/localTheme"

export default function TabsLayout() {
  useColorMode()
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const view = useActivityStripState()
  const { homeView } = useDashboard()

  const monitorState: AuroraState = homeView?.monitors?.health?.state ?? "stale"
  const pathname = usePathname()
  // Aurora + TopHeader are data-context chrome — only Home + Health should
  // wear them. Settings + Inspector are utility tabs where the red/amber
  // monitor tint reads as "something is wrong" and the date pill is
  // meaningless.
  const isHomeRoute = pathname === "/" || pathname.endsWith("/index")
  const isHealthRoute = pathname.endsWith("/health")
  const showAurora = isHomeRoute || isHealthRoute
  const showSharedHeader = isHealthRoute

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarStyle: { display: "none" as const },
      sceneStyle: { backgroundColor: "transparent" },
      animation: Platform.OS === "ios" ? ("shift" as const) : ("none" as const),
      // Keep each tab's screen state when switching. React Navigation does
      // this by default for bottom tabs — explicit for clarity.
      unmountOnBlur: false,
      lazy: true,
    }),
    [],
  )

  return (
    <View style={[$root, { backgroundColor: colors.background }]}>
      {showAurora ? (
        <AuroraBackdrop state={monitorState} background={colors.background} />
      ) : null}
      <SafeAreaView style={$flex} edges={["top"]}>
        {/* HomeScreen renders its own header because it owns the calendar
            picker + day-swipe gesture. Health uses the shared TopHeader.
            Settings + Inspector are utility tabs — no top chrome. */}
        {showSharedHeader ? <TopHeader /> : null}
        <Tabs screenOptions={screenOptions} tabBar={(props) => <NoopTabBar {...props} />}>
          <Tabs.Screen name="index" options={{ title: "Home" }} />
          <Tabs.Screen name="health" options={{ title: "Health" }} />
          <Tabs.Screen name="inspector" options={{ title: "Inspector" }} />
          <Tabs.Screen name="settings" options={{ title: "Settings" }} />
        </Tabs>
        {view.state !== "idle" ? (
          <View
            pointerEvents="box-none"
            style={[$activityWrap, { bottom: insets.bottom + 96 }]}
          >
            <ActivityStrip view={view} />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  )
}

const $root: ViewStyle = {
  flex: 1,
}

const $flex: ViewStyle = {
  flex: 1,
}

const $activityWrap: ViewStyle = {
  position: "absolute",
  left: 16,
  right: 16,
}
