import { NativeTabs } from "expo-router/unstable-native-tabs"

import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export default function TabsLayout() {
  useColorMode()
  const { colors } = LOCAL_THEME

  return (
    <NativeTabs tintColor={colors.tint} minimizeBehavior="automatic" blurEffect="systemChromeMaterial">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <NativeTabs.Trigger.Icon sf="waveform.path.ecg" md="monitor_heart" />
        <NativeTabs.Trigger.Label>Health</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
