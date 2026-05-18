import { Platform } from "react-native"
import { NativeTabs } from "expo-router/unstable-native-tabs"

import { ActivityStrip } from "@/components/ActivityStrip"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

function supportsBottomAccessory(): boolean {
  if (Platform.OS !== "ios") return false
  const major = parseInt(String(Platform.Version).split(".")[0], 10)
  return Number.isFinite(major) && major >= 26
}

export default function TabsLayout() {
  useColorMode()
  const { colors } = LOCAL_THEME

  return (
    <NativeTabs tintColor={colors.tint} minimizeBehavior="automatic" blurEffect="systemChromeMaterial">
      {supportsBottomAccessory() && (
        <NativeTabs.BottomAccessory>
          <ActivityStrip />
        </NativeTabs.BottomAccessory>
      )}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        <NativeTabs.Trigger.Label hidden>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <NativeTabs.Trigger.Icon sf="waveform.path.ecg" md="monitor_heart" />
        <NativeTabs.Trigger.Label hidden>Health</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inspector">
        <NativeTabs.Trigger.Icon sf={{ default: "gauge.medium", selected: "gauge.high" }} md="speed" />
        <NativeTabs.Trigger.Label hidden>Inspector</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        <NativeTabs.Trigger.Label hidden>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
