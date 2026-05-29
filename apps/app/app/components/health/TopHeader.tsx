import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { router } from "expo-router"

import { DateSwitcher } from "@/components/DateSwitcher"
import { ComposeButton, type QuickLogAction } from "@/components/home/ComposeButton"
import { DevicePill } from "@/components/home/DevicePill"
import { useDashboard } from "@/context/DashboardContext"
import {
  useBleBatteryLevel,
  useBleConnectionState,
  useBleIsCharging,
} from "@/stores/bleStore"

type Props = {
  onQuickLog?: (action: QuickLogAction) => void
}

export const TopHeader: FC<Props> = ({ onQuickLog }) => {
  const { selectedDate, goToPreviousDay, goToNextDay } = useDashboard()
  const batteryLevel = useBleBatteryLevel()
  const isCharging = useBleIsCharging()
  const connectionState = useBleConnectionState()

  const batteryLabel = batteryLevel == null ? "—" : `${batteryLevel}%`

  const handleQuickLog = (action: QuickLogAction) => {
    if (onQuickLog) {
      onQuickLog(action)
      return
    }
    switch (action) {
      case "activity":
        router.push("/strain-activity")
        break
      case "journal":
        router.push({ pathname: "/journal-entry", params: { date: selectedDate } })
        break
      case "bedtime":
        router.push("/sleep-planner")
        break
      case "session":
        router.push("/strain-activity")
        break
    }
  }

  return (
    <View style={$topbar}>
      <DateSwitcher
        title={formatTitleFor(selectedDate)}
        onPrevious={goToPreviousDay}
        onNext={goToNextDay}
      />
      <View style={$topRight}>
        <ComposeButton onSelect={handleQuickLog} />
        <DevicePill
          batteryLabel={batteryLabel}
          isCharging={isCharging}
          isConnected={connectionState === "ready"}
          onPress={() => router.push("/device-settings")}
        />
      </View>
    </View>
  )
}

function formatTitleFor(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!y || !m || !d) return dateKey
  const date = new Date(y, m - 1, d, 12)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (date.getTime() === today.getTime()) return "Today"
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000)
  if (date.getTime() === yesterday.getTime()) return "Yesterday"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}

const $topbar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 16,
  paddingVertical: 8,
  gap: 10,
}

const $topRight: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
}
