/**
 * The app navigator (formerly "AppNavigator" and "MainNavigator") is used for the primary
 * navigation flows of your app.
 * Generally speaking, it will contain an auth flow (registration, login, forgot password)
 * and a "main" flow which the user will use once logged in.
 */
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"

import Config from "@/config"
import { useAuth } from "@/context/AuthContext"
import { DeviceSettingsScreen } from "@/screens/DeviceSettingsScreen"
import { DebugInspectorScreen } from "@/screens/DebugInspectorScreen"
import { HomeDetailsScreen } from "@/screens/HomeDetailsScreen"
import { HomeMetricScreen } from "@/screens/HomeMetricScreen"
import { LoginScreen } from "@/screens/LoginScreen"
import { JournalEntryScreen } from "@/screens/JournalEntryScreen"
import { JournalHistoryScreen } from "@/screens/JournalHistoryScreen"
import { SleepDetailScreen } from "@/screens/SleepDetailScreen"
import { StrainActivityScreen } from "@/screens/StrainActivityScreen"
import { HealthMonitorScreen } from "@/screens/HealthMonitorScreen"
import { StressMonitorScreen } from "@/screens/StressMonitorScreen"
import { useNavigationTheme } from "./useNavigationTheme"

import { MainNavigator } from "./MainNavigator"
import type { AppStackParamList, NavigationProps } from "./navigationTypes"
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"

/**
 * This is a list of all the route names that will exit the app if the back button
 * is pressed while in that screen. Only affects Android.
 */
const exitRoutes = Config.exitRoutes

// Documentation: https://reactnavigation.org/docs/stack-navigator/
const Stack = createNativeStackNavigator<AppStackParamList>()

const AppStack = () => {
  const { isAuthenticated } = useAuth()

  const colors = { background: "#F0EDE8" }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        navigationBarColor: colors.background,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
      initialRouteName={isAuthenticated ? "Main" : "Login"}
    >
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}

      {/** 🔥 Your screens go here */}
      <Stack.Screen name="HomeMetric" component={HomeMetricScreen} />
      <Stack.Screen name="HomeDetails" component={HomeDetailsScreen} />
      <Stack.Screen name="StrainActivity" component={StrainActivityScreen} />
      <Stack.Screen
        name="DeviceSettings"
        component={DeviceSettingsScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="DebugInspector"
        component={DebugInspectorScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="JournalEntry"
        component={JournalEntryScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="JournalHistory" component={JournalHistoryScreen} />
      <Stack.Screen name="SleepDetail" component={SleepDetailScreen} />
      <Stack.Screen name="HealthMonitor" component={HealthMonitorScreen} />
      <Stack.Screen name="StressMonitor" component={StressMonitorScreen} />
      {/* IGNITE_GENERATOR_ANCHOR_APP_STACK_SCREENS */}
    </Stack.Navigator>
  )
}

export const AppNavigator = (props: NavigationProps) => {
  const navigationTheme = useNavigationTheme()

  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} {...props}>
      <AppStack />
    </NavigationContainer>
  )
}
