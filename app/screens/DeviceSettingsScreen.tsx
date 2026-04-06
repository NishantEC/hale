import { FC, useMemo, useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { useNavigation } from "@react-navigation/native"
import {
  Switch,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import SegmentedControl from "@/components/reactx/segmented-control"
import { Dialog } from "@/components/reactx/dialog"
import { Toast } from "@/components/reactx/toast"
import { useDashboard } from "@/context/DashboardContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const ACCENT = "#ABCCFF"

type DeviceSettingsTab = "status" | "advanced"

export const DeviceSettingsScreen: FC = () => {
  const navigation = useNavigation<any>()
  const { themed } = useAppTheme()
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const selectedTab: DeviceSettingsTab = selectedTabIndex === 0 ? "status" : "advanced"
  const {
    liveDeviceState,
    scannedDevices,
    isSyncing,
    syncStage,
    syncProgress,
    syncSummary,
    scan,
    connect,
    disconnect,
    syncNow,
    refreshStrapMetadata,
    toggleRealtimeHeartRate,
    toggleBroadcastHeartRate,
    toggleRawDataStreaming,
    armAlarm,
    disarmAlarm,
    testAlarm,
  } = useDashboard()

  const isConnected = liveDeviceState.connectionState === "ready"
  const statusLabel = isConnected ? "CONNECTED" : liveDeviceState.connectionState.toUpperCase()
  const batteryLabel =
    liveDeviceState.batteryLevel == null ? "--" : `${Math.round(liveDeviceState.batteryLevel)}%`
  const deviceNameLabel = (liveDeviceState.deviceName ?? "WHOOP").replace(/\s+/g, " ").trim()
  const lastSyncText = liveDeviceState.lastSyncAt
    ? new Date(liveDeviceState.lastSyncAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "No sync yet"

  const primaryAction = useMemo(() => {
    if (isConnected) {
      return {
        title: "UNPAIR DEVICE",
        description: "Disconnect the current strap Bluetooth connection.",
        icon: "watch-outline" as const,
        onPress: disconnect,
      }
    }

    return {
      title: scannedDevices.length > 0 ? "PAIR A DEVICE" : "SCAN FOR DEVICE",
      description:
        scannedDevices.length > 0
          ? "Choose a nearby WHOOP strap from the list below."
          : "Scan and reconnect a strap to continue syncing.",
      icon: "bluetooth-outline" as const,
      onPress: scan,
    }
  }, [disconnect, isConnected, scan, scannedDevices.length])

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($container)}
      ScrollViewProps={{
        stickyHeaderIndices: [0],
      }}
    >
      <View style={themed($stickyChrome)}>
        <View style={themed($headerRow)}>
          <TouchableOpacity
            accessibilityLabel="Close device settings"
            onPress={() => navigation.goBack()}
            style={themed($closeButton)}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.92)" />
          </TouchableOpacity>

          <Text text="Device Settings" size="md" weight="semiBold" style={themed($headerTitle)} />

          <View style={themed($headerSpacer)} />
        </View>

        <View style={themed($summaryBlock)}>
          <View style={themed($summaryColumn)}>
            <Text text="Connected to" size="xxs" weight="bold" style={themed($eyebrow)} />
            <Text
              text={deviceNameLabel.toUpperCase()}
              size="sm"
              weight="bold"
              style={themed($summaryValue)}
            />
          </View>

          <View style={themed($summaryColumnRight)}>
            <Text text="Last sync" size="xxs" weight="bold" style={themed($summaryLabel)} />
            <Text
              text={lastSyncText}
              size="xxs"
              weight="semiBold"
              style={themed($summaryValueSecondary)}
            />
          </View>
        </View>

        <SegmentedControl
          currentIndex={selectedTabIndex}
          onChange={setSelectedTabIndex}
          segmentedControlBackgroundColor="rgba(255,255,255,0.06)"
          activeSegmentBackgroundColor="rgba(255,255,255,0.14)"
          dividerColor="rgba(255,255,255,0.08)"
          borderRadius={12}
          paddingVertical={8}
        >
          <Text text="Status" size="xs" weight="semiBold" style={{ color: selectedTab === "status" ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.45)", textAlign: "center" }} />
          <Text text="Advanced" size="xs" weight="semiBold" style={{ color: selectedTab === "advanced" ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.45)", textAlign: "center" }} />
        </SegmentedControl>
      </View>

      <View>
        {selectedTab === "status" ? (
          <View style={themed($sectionStack)}>
            <View style={themed($deviceStatusCard)}>
              <View style={themed($rowBetween)}>
                <Ionicons name="watch-outline" size={34} color="rgba(255,255,255,0.92)" />

                <View style={themed($statusValueWrap)}>
                  <Text text={batteryLabel} size="xl" weight="bold" style={themed($batteryValue)} />
                  <Text text={statusLabel} size="xxs" weight="bold" style={themed($statusCaption)} />
                </View>
              </View>

              <Text
                text={liveDeviceState.isCharging ? "Charging on wrist" : "Ready for sync"}
                size="xxs"
                weight="semiBold"
                style={themed($statusSubtext)}
              />
            </View>

            <SettingToggleRow
              label="Broadcast Heart Rate"
              description="Expose the strap as a generic heart-rate accessory."
              value={liveDeviceState.isBroadcastHeartRateEnabled}
              onValueChange={toggleBroadcastHeartRate}
              disabled={!isConnected}
            />

            {isConnected ? (
              <Dialog>
                <Dialog.Trigger asChild>
                  <ActionCard
                    title={primaryAction.title}
                    description={primaryAction.description}
                    icon={primaryAction.icon}
                    onPress={() => {}}
                  />
                </Dialog.Trigger>
                <Dialog.Content onClose={() => {}}>
                  <Dialog.Backdrop backgroundColor="rgba(0,0,0,0.6)">
                    <View style={themed($dialogContent)}>
                      <Text text="Unpair Device" size="lg" weight="bold" style={themed($dialogTitle)} />
                      <Text text="Are you sure you want to disconnect the strap? You'll need to re-pair it to sync again." size="xs" style={themed($dialogBody)} />
                      <View style={themed($dialogButtonRow)}>
                        <Dialog.Close asChild>
                          <TouchableOpacity style={themed($dialogButtonCancel)}>
                            <Text text="Cancel" size="xs" weight="semiBold" style={{ color: "rgba(255,255,255,0.9)" }} />
                          </TouchableOpacity>
                        </Dialog.Close>
                        <Dialog.Close asChild>
                          <TouchableOpacity style={themed($dialogButtonDestructive)} onPress={() => { disconnect(); Toast.show("Device disconnected", { type: "info", position: "top" }) }}>
                            <Text text="Unpair" size="xs" weight="semiBold" style={{ color: "#fff" }} />
                          </TouchableOpacity>
                        </Dialog.Close>
                      </View>
                    </View>
                  </Dialog.Backdrop>
                </Dialog.Content>
              </Dialog>
            ) : (
              <ActionCard
                title={primaryAction.title}
                description={primaryAction.description}
                icon={primaryAction.icon}
                onPress={primaryAction.onPress}
              />
            )}

            <ActionCard
              title="FIRMWARE CHECK"
              description="Refresh alarm, battery, and device metadata from the strap."
              icon="refresh-outline"
              onPress={refreshStrapMetadata}
            />

            {!isConnected && scannedDevices.length > 0 ? (
              <View style={themed($listCard)}>
                <Text text="Nearby Straps" size="xxs" weight="bold" style={themed($summaryLabel)} />
                {scannedDevices.map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    onPress={() => connect(device.id)}
                    style={themed($deviceRow)}
                  >
                    <View style={themed($deviceMeta)}>
                      <Text text={device.name} size="xs" weight="semiBold" style={themed($rowValue)} />
                      <Text
                        text={`Signal ${device.rssi} dBm`}
                        size="xxs"
                        style={themed($rowLabel)}
                      />
                    </View>
                    <Text text="Connect" size="xs" weight="semiBold" style={themed($linkText)} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={themed($sectionStack)}>
            <SettingToggleRow
              label="Realtime Heart Rate"
              description="Keep the live heart-rate stream active while connected."
              value={liveDeviceState.isRealtimeHeartRateEnabled}
              onValueChange={toggleRealtimeHeartRate}
              disabled={!isConnected}
            />

            <SettingToggleRow
              label="Raw Data Stream"
              description="Enable advanced packet streaming for diagnostics and export."
              value={liveDeviceState.isRawDataStreamingEnabled}
              onValueChange={toggleRawDataStreaming}
              disabled={!isConnected}
            />

            <ActionCard
              title={isSyncing ? syncStage || "SYNCING DATA" : "SYNC DATA"}
              description="Download history from the strap, ingest it, and refresh the dashboard."
              icon="cloud-upload-outline"
              onPress={syncNow}
            />

            <ActionCard
              title="SYNC INSPECTOR"
              description="Inspect raw rows, selected nights, and rerun the backend pipeline."
              icon="analytics-outline"
              onPress={() => router.push("/debug-inspector")}
            />

            <View style={themed($inlineButtonRow)}>
              <InlineButton
                label={liveDeviceState.strapAlarmArmed ? "Disarm Alarm" : "Arm Alarm"}
                onPress={liveDeviceState.strapAlarmArmed ? disarmAlarm : armAlarm}
                disabled={!isConnected}
              />
              <InlineButton label="Test Now" onPress={testAlarm} disabled={!isConnected} />
            </View>

            {syncProgress ? (
              <View style={themed($metricsCard)}>
                <MetricCell label="Chunks" value={String(syncProgress.chunksReceived)} />
                <MetricCell label="Records" value={String(syncProgress.recordsParsed)} />
                <MetricCell label="KB" value={`${(syncProgress.totalBytes / 1024).toFixed(0)}`} />
              </View>
            ) : null}

            {syncSummary ? (
              <View style={themed($metricsCard)}>
                <MetricCell label="Nights" value={String(syncSummary.nights)} />
                <MetricCell label="Stages" value={String(syncSummary.stages)} />
                <MetricCell label="Scores" value={String(syncSummary.scores)} />
              </View>
            ) : null}

            {!isConnected && scannedDevices.length > 0 ? (
              <View style={themed($listCard)}>
                <Text text="Nearby Straps" size="xxs" weight="bold" style={themed($summaryLabel)} />
                {scannedDevices.map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    onPress={() => connect(device.id)}
                    style={themed($deviceRow)}
                  >
                    <View style={themed($deviceMeta)}>
                      <Text text={device.name} size="xs" weight="semiBold" style={themed($rowValue)} />
                      <Text
                        text={`Signal ${device.rssi} dBm`}
                        size="xxs"
                        style={themed($rowLabel)}
                      />
                    </View>
                    <Text text="Connect" size="xs" weight="semiBold" style={themed($linkText)} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  )
}

function SettingToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string
  description: string
  value: boolean
  onValueChange: (value: boolean) => Promise<void>
  disabled?: boolean
}) {
  const { themed } = useAppTheme()

  return (
    <View style={themed($toggleCard)}>
      <View style={themed($toggleCopy)}>
        <Text text={label} size="xs" weight="semiBold" style={themed($rowValue)} />
        <Text text={description} size="xxs" style={themed($toggleDescription)} />
      </View>
      <View style={themed($switchWrap)}>
        <Switch
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: "rgba(255,255,255,0.14)", true: "rgba(171,204,255,0.52)" }}
          thumbColor={value ? ACCENT : "#F5F5F5"}
          value={value}
        />
      </View>
    </View>
  )
}

function ActionCard({
  title,
  description,
  icon,
  onPress,
}: {
  title: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void | Promise<void>
}) {
  const { themed } = useAppTheme()

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={themed($actionCard)}>
      <View style={themed($actionIcon)}>
        <Ionicons name={icon} size={18} color="rgba(255,255,255,0.82)" />
      </View>
      <View style={themed($actionCopy)}>
        <Text text={title} size="xs" weight="bold" style={themed($rowValue)} />
        <Text text={description} size="xxs" style={themed($rowLabel)} />
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.62)" />
    </TouchableOpacity>
  )
}

function InlineButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void | Promise<void>
  disabled?: boolean
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[themed($inlineButton), disabled ? themed($inlineButtonDisabled) : null]}
    >
      <Text text={label} size="xs" weight="semiBold" style={themed($inlineButtonText)} />
    </TouchableOpacity>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($metricCell)}>
      <Text text={value} size="lg" weight="bold" style={themed($metricValue)} />
      <Text text={label} size="xxs" style={themed($metricLabel)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingHorizontal: spacing.md,
  paddingTop: 0,
  paddingBottom: spacing.xl,
})

const $stickyChrome: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  backgroundColor: colors.background,
  gap: spacing.xxs,
  marginHorizontal: -spacing.md,
  paddingHorizontal: spacing.md,
  paddingTop: 0,
  paddingBottom: spacing.xxs,
  zIndex: 2,
})

const $headerRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: 0,
  minHeight: 34,
})

const $closeButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $headerTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.94)",
  lineHeight: 34,
})

const $headerSpacer: ThemedStyle<ViewStyle> = () => ({
  width: 32,
})

const $summaryBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.04)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs - 2,
  minHeight: 74,
})

const $summaryColumn: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
  justifyContent: "center",
})

const $summaryColumnRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  flex: 1,
  gap: 2,
  justifyContent: "center",
})

const $eyebrow: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
  textTransform: "uppercase",
})

const $summaryLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
})

const $summaryValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.94)",
  lineHeight: 26,
})

const $summaryValueSecondary: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.84)",
  lineHeight: 18,
  textAlign: "right",
})

const $dialogContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(22,22,26,0.96)",
  borderColor: "rgba(255,255,255,0.1)",
  borderRadius: 20,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $dialogTitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
})

const $dialogBody: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.65)",
  lineHeight: 20,
})

const $dialogButtonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.xs,
})

const $dialogButtonCancel: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  flex: 1,
  justifyContent: "center",
  minHeight: 44,
})

const $dialogButtonDestructive: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "#EF4444",
  borderRadius: 14,
  flex: 1,
  justifyContent: "center",
  minHeight: 44,
})

const $sectionStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: 10,
})

const $deviceStatusCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  gap: 6,
  minHeight: 104,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
})

const $rowBetween: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
})

const $statusValueWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 2,
})

const $batteryValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
  lineHeight: 38,
})

const $statusCaption: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
  textTransform: "uppercase",
})

const $statusSubtext: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.66)",
  lineHeight: 18,
})

const $toggleCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-start",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs - 1,
})

const $toggleCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 3,
  paddingTop: 1,
})

const $toggleDescription: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.56)",
  lineHeight: 18,
})

const $switchWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
})

const $actionCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
})

const $actionIcon: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderRadius: 16,
  height: 32,
  justifyContent: "center",
  width: 32,
})

const $actionCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 3,
})

const $inlineButtonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $inlineButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  flex: 1,
  justifyContent: "center",
  minHeight: 44,
  paddingHorizontal: spacing.xs,
})

const $inlineButtonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.4,
})

const $inlineButtonText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.92)",
})

const $metricsCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  flexDirection: "row",
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
})

const $metricCell: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  gap: 4,
})

const $metricValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.96)",
})

const $metricLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
})

const $listCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  borderWidth: 1,
  gap: spacing.xs,
  padding: spacing.sm,
})

const $deviceRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  flexDirection: "row",
  gap: spacing.sm,
  justifyContent: "space-between",
})

const $deviceMeta: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
})

const $rowLabel: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.56)",
})

const $rowValue: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,255,255,0.94)",
})

const $linkText: ThemedStyle<TextStyle> = () => ({
  color: ACCENT,
})
