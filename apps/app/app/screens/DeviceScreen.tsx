import { FC, useEffect, useRef } from "react"
import { ScrollView, TouchableOpacity } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { BatteryPanel } from "@/components/BatteryPanel"
import { GlassCard } from "@/components/GlassCard"
import { Text } from "@/components/Text"
import { XStack, YStack } from "@/components/tamagui-primitives"
import { AnimatedProgressBar } from "@/components/reactx/progress"
import { Toast } from "@/components/reactx/toast"
import { useBle } from "@/context/BleContext"

export const DeviceScreen: FC = () => {
  const {
    connectionState,
    deviceName,
    batteryLevel,
    batteryVoltageMv,
    batteryTemperatureC,
    batteryIconLevel,
    isCharging,
    realtimeHeartRate,
    liveStressLevel,
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
  } = useBle()

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
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingVertical: 24 }}>
        <Text text="Device" preset="heading" />

        <GlassCard style={{ gap: 12 }}>
          <MetricRow label="Connection" value={connectionState} />
          <MetricRow label="Device" value={deviceName ?? "WHOOP not connected"} />
          <MetricRow
            label="Battery"
            value={batteryLevel == null ? "--" : `${batteryLevel.toFixed(1)}%`}
          />
          <BatteryPanel
            voltageMv={batteryVoltageMv}
            temperatureC={batteryTemperatureC}
            iconLevel={batteryIconLevel}
          />
          <MetricRow label="Charging" value={isCharging ? "Yes" : "No"} />
          <MetricRow
            label="Realtime HR"
            value={realtimeHeartRate ? `${realtimeHeartRate}` : "--"}
          />
          <MetricRow
            label="Live stress"
            value={
              liveStressLevel == null
                ? "--"
                : `${liveStressLevel} / 3 · ${
                    liveStressLevel === 0
                      ? "Calm"
                      : liveStressLevel === 1
                        ? "Low"
                        : liveStressLevel === 2
                          ? "Medium"
                          : "High"
                  }`
            }
          />
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <ActionButton label="Scan for Devices" onPress={scan} primary />
          {scannedDevices.map((device) => (
            <TouchableOpacity
              key={device.id}
              onPress={() => connect(device.id)}
            >
              <XStack alignItems="center" justifyContent="space-between" gap={12}>
                <YStack flex={1} gap={2}>
                  <Text text={device.name} size="xs" weight="semiBold" />
                  <Text text={`Signal ${device.rssi} dBm`} size="xxs" style={{ opacity: 0.7 }} />
                </YStack>
                <Text text="Connect" size="xs" weight="semiBold" style={{ color: "#C76542" }} />
              </XStack>
            </TouchableOpacity>
          ))}
        </GlassCard>

        <GlassCard style={{ gap: 12 }}>
          <ActionButton label={isSyncing ? syncStage || "Syncing…" : "Sync Data"} onPress={syncNow} primary />
          {isSyncing ? (
            <AnimatedProgressBar
              progress={syncProgress ? Math.min(syncProgress.chunksReceived / Math.max(syncProgress.chunksReceived + 3, 10), 0.95) : 0}
              indeterminate={!syncProgress}
              height={4}
              borderRadius={2}
              progressColor="#C76542"
              trackColor="rgba(255,255,255,0.08)"
            />
          ) : null}
          <ActionButton label="Disconnect" onPress={disconnect} />

          {syncProgress ? (
            <XStack gap={10}>
              <StatsCell label="Chunks" value={String(syncProgress.chunksReceived)} />
              <StatsCell label="Records" value={String(syncProgress.recordsParsed)} />
              <StatsCell label="KB" value={`${(syncProgress.totalBytes / 1024).toFixed(0)}`} />
            </XStack>
          ) : null}

          {syncSummary ? (
            <XStack gap={10}>
              <StatsCell label="Nights" value={String(syncSummary.nights)} />
              <StatsCell label="Stages" value={String(syncSummary.stages)} />
              <StatsCell label="Scores" value={String(syncSummary.scores)} />
            </XStack>
          ) : null}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  )
}

function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? "#C76542" : "rgba(255,255,255,0.06)",
        borderRadius: 16,
        justifyContent: "center",
        minHeight: 44,
      }}
    >
      <Text text={label} size="xs" weight="semiBold" style={{ color: primary ? "#FFFFFF" : undefined }} />
    </TouchableOpacity>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap={12}>
      <Text text={label} size="xs" style={{ opacity: 0.7 }} />
      <Text text={value} size="xs" weight="semiBold" style={{ flexShrink: 1, textAlign: "right" }} />
    </XStack>
  )
}

function StatsCell({ label, value }: { label: string; value: string }) {
  return (
    <YStack
      flex={1}
      alignItems="center"
      gap={2}
      paddingVertical={10}
      backgroundColor="rgba(255,255,255,0.04)"
      borderRadius={14}
    >
      <Text text={value} size="md" weight="bold" />
      <Text text={label} size="xxs" style={{ opacity: 0.7 }} />
    </YStack>
  )
}
