import { FC, useEffect, useRef } from "react"
import { TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"

import { GlassCard } from "@/components/GlassCard"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AnimatedProgressBar } from "@/components/reactx/progress"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const DeviceScreen: FC = () => {
  const { themed, theme: { colors } } = useAppTheme()
  const {
    liveDeviceState,
    scannedDevices,
    isSyncing,
    syncStage,
    syncProgress,
    syncSummary,
    error,
    scan,
    connect,
    disconnect,
    syncNow,
    clearError,
  } = useDashboard()

  const lastShownError = useRef<string | null>(null)

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Text text="Device" preset="heading" style={themed($title)} />

      <GlassCard style={themed($card)}>
        <MetricRow label="Connection" value={liveDeviceState.connectionState} />
        <MetricRow label="Device" value={liveDeviceState.deviceName ?? "WHOOP not connected"} />
        <MetricRow
          label="Battery"
          value={
            liveDeviceState.batteryLevel == null ? "--" : `${Math.round(liveDeviceState.batteryLevel)}%`
          }
        />
        <MetricRow label="Charging" value={liveDeviceState.isCharging ? "Yes" : "No"} />
        <MetricRow
          label="Realtime HR"
          value={liveDeviceState.realtimeHeartRate ? `${liveDeviceState.realtimeHeartRate}` : "--"}
        />
      </GlassCard>

      <GlassCard style={themed($card)}>
        <ActionButton label="Scan for Devices" onPress={scan} primary />
        {scannedDevices.map((device) => (
          <TouchableOpacity key={device.id} style={themed($deviceRow)} onPress={() => connect(device.id)}>
            <View style={themed($deviceCopy)}>
              <Text text={device.name} size="xs" weight="semiBold" style={themed($rowValue)} />
              <Text text={`Signal ${device.rssi} dBm`} size="xxs" style={themed($rowLabel)} />
            </View>
            <Text text="Connect" size="xs" weight="semiBold" style={themed($link)} />
          </TouchableOpacity>
        ))}
      </GlassCard>

      <GlassCard style={themed($card)}>
        <ActionButton label={isSyncing ? syncStage || "Syncing…" : "Sync Data"} onPress={syncNow} primary />
        {isSyncing ? (
          <AnimatedProgressBar
            progress={syncProgress ? Math.min(syncProgress.chunksReceived / Math.max(syncProgress.chunksReceived + 3, 10), 0.95) : 0}
            indeterminate={!syncProgress}
            height={4}
            borderRadius={2}
            progressColor={colors.tint}
            trackColor={colors.divider}
          />
        ) : null}
        <ActionButton label="Disconnect" onPress={disconnect} />

        {syncProgress ? (
          <View style={themed($statsGrid)}>
            <StatsCell label="Chunks" value={String(syncProgress.chunksReceived)} />
            <StatsCell label="Records" value={String(syncProgress.recordsParsed)} />
            <StatsCell label="KB" value={`${(syncProgress.totalBytes / 1024).toFixed(0)}`} />
          </View>
        ) : null}

        {syncSummary ? (
          <View style={themed($statsGrid)}>
            <StatsCell label="Nights" value={String(syncSummary.nights)} />
            <StatsCell label="Stages" value={String(syncSummary.stages)} />
            <StatsCell label="Scores" value={String(syncSummary.scores)} />
          </View>
        ) : null}
      </GlassCard>
    </Screen>
  )
}

function ActionButton({
  label,
  onPress,
  primary = false,
}: {
  label: string
  onPress: () => void
  primary?: boolean
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      style={[themed($button), primary ? themed($buttonPrimary) : null]}
      onPress={onPress}
    >
      <Text
        text={label}
        size="xs"
        weight="semiBold"
        style={primary ? themed($buttonPrimaryText) : themed($buttonText)}
      />
    </TouchableOpacity>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($rowBetween)}>
      <Text text={label} size="xs" style={themed($rowLabel)} />
      <Text text={value} size="xs" weight="semiBold" style={themed($rowValue)} />
    </View>
  )
}

function StatsCell({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($statsCell)}>
      <Text text={value} size="md" weight="bold" style={themed($rowValue)} />
      <Text text={label} size="xxs" style={themed($rowLabel)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})


const $rowBetween: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 12,
})

const $rowLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $rowValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  flexShrink: 1,
  textAlign: "right",
})

const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $button: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 16,
  justifyContent: "center",
  minHeight: 44,
})

const $buttonPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $buttonPrimaryText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onPrimary,
})

const $deviceRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 12,
})

const $deviceCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
})

const $statsGrid: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 10,
})

const $statsCell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceCard,
  borderRadius: 14,
  flex: 1,
  gap: 2,
  paddingVertical: 10,
})
