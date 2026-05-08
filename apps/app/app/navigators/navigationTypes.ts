import { ComponentProps } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { NativeStackScreenProps } from "@react-navigation/native-stack"

// App Stack Navigator types
export type AppStackParamList = {
  Main: undefined
  Login: undefined
  HomeMetric: {
    metric:
      | "sleep"
      | "recovery"
      | "readiness"
      | "strain"
      | "stress"
      | "loadPressure"
      | "liveHeartRate"
      | "activities"
  }
  HomeDetails: undefined
  StrainActivity: undefined
  DeviceSettings: undefined
  DebugInspector: undefined
  JournalEntry: undefined
  JournalHistory: undefined
  SleepDetail: { date: string }
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
}

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}
