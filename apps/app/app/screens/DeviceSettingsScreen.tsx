import { FC, useEffect, useMemo, useRef } from "react"
import { BatteryPanel } from "@/components/BatteryPanel"
import {
  ArrowsClockwise,
  CaretRight,
  CloudArrowDown,
  Lightning,
  Watch,
} from "phosphor-react-native"
import {
  Animated,
  Easing,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { DetailScreenHeader } from "@/components/DetailScreenHeader"
import { Text } from "@/components/Text"
import { AnimatedProgressBar } from "@/components/reactx/progress"
import { Dialog } from "@/components/reactx/dialog"
import { Toast } from "@/components/reactx/toast"
import { useAuth } from "@/context/AuthContext"
import { useBle } from "@/context/BleContext"
import {
  useScannedDevices,
  useSyncIsRunning,
  useSyncProgress,
  useSyncStage,
} from "@/stores/syncStore"
import { forceLogout } from "@/services/api/viewModels"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

export const DeviceSettingsScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const { logout } = useAuth()
  const {
    connectionState,
    batteryLevel,
    batteryVoltageMv,
    batteryTemperatureC,
    batteryIconLevel,
    isCharging,
    deviceName,
    lastSyncAt,
    firmwareVersion,
    deviceClock,
    isWorn,
    scan,
    connect,
    disconnect,
    syncNow,
  } = useBle()
  const scannedDevices = useScannedDevices()
  const isSyncing = useSyncIsRunning()
  const syncStage = useSyncStage()
  const syncProgress = useSyncProgress()

  const isConnected = connectionState === "ready"
  const isBusy = connectionState === "connecting" || connectionState === "discovering"
  const batteryLabel =
    batteryLevel == null ? "--" : batteryLevel.toFixed(1)
  const batteryColor =
    batteryLevel == null
      ? colors.text
      : isCharging
        ? colors.tint
        : batteryLevel >= 50
          ? colors.statusGreen
          : batteryLevel >= 20
            ? colors.statusAmber
            : colors.statusRed
  const deviceNameLabel = (deviceName ?? "WHOOP").replace(/\s+/g, " ").trim()
  const lastSyncText = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Never"

  // Charging pulse animation
  const chargingAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (isCharging) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(chargingAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(chargingAnim, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      )
      loop.start()
      return () => loop.stop()
    } else {
      chargingAnim.setValue(0)
      return undefined
    }
  }, [isCharging, chargingAnim])

  const chargingGlowOpacity = chargingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  })
  const chargingBadgeScale = chargingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  })

  const connectionAction = useMemo(() => {
    if (isConnected) {
      return { title: "Unpair Device", onPress: disconnect }
    }
    return {
      title: scannedDevices.length > 0 ? "Pair a Device" : "Scan for Device",
      onPress: scan,
    }
  }, [disconnect, isConnected, scan, scannedDevices.length])

  return (
    <SafeAreaView style={themed($container)} edges={["top", "bottom"]}>
      <DetailScreenHeader title="Device Settings" />

      {/* ─── Hero: big watch + battery ─── */}
      <View style={themed($hero)}>
        <View style={themed($watchCircleOuter)}>
          {isCharging ? (
            <Animated.View
              style={[themed($chargingGlow), { opacity: chargingGlowOpacity }]}
            />
          ) : null}
          <View style={themed($watchCircle)}>
            <Watch
              size={48}
              color={isConnected ? colors.tint : colors.iconDim}
            />
            {isCharging ? (
              <Animated.View
                style={[themed($chargingBadge), { transform: [{ scale: chargingBadgeScale }] }]}
              >
                <Lightning size={12} color={colors.onPrimary} />
              </Animated.View>
            ) : null}
          </View>
        </View>

        <Text text={deviceNameLabel} size="md" weight="bold" style={themed($deviceName)} />

        <View style={themed($statusPills)}>
          <View style={[themed($pill), isConnected ? themed($pillGreen) : isBusy ? themed($pillAmber) : themed($pillDim)]}>
            <Text
              text={isConnected ? "Connected" : isBusy ? "Connecting" : "Disconnected"}
              size="xxs"
              weight="semiBold"
              style={themed(isConnected ? $pillTextDark : isBusy ? $pillTextDark : $pillTextLight)}
            />
          </View>
          {isConnected && isWorn ? (
            <View style={themed($pill)}>
              <Text text="On wrist" size="xxs" weight="semiBold" style={themed($pillTextLight)} />
            </View>
          ) : null}
        </View>

        {/* Battery big number */}
        <View style={themed($batterySection)}>
          <Text text={batteryLabel} style={[themed($batteryNumber), { color: batteryColor }]} />
          <Text text="%" size="lg" weight="bold" style={[themed($batteryPercent), { color: batteryColor }]} />
        </View>
        <Text
          text={isCharging ? "Charging" : isConnected ? "Battery" : "Last known battery"}
          size="xxs"
          style={[themed($batteryCaption), { color: batteryColor, opacity: 0.6 }]}
        />

        {isConnected ? (
          <BatteryPanel
            voltageMv={batteryVoltageMv}
            temperatureC={batteryTemperatureC}
            iconLevel={batteryIconLevel}
          />
        ) : null}
      </View>

      {/* ─── Info rows ─── */}
      <View style={themed($infoSection)}>
        {firmwareVersion ? (
          <>
            <View style={themed($infoRow)}>
              <Text text="Firmware" size="xs" style={themed($infoLabel)} />
              <Text text={firmwareVersion} size="xs" weight="semiBold" style={themed($infoValue)} />
            </View>
            <View style={themed($divider)} />
          </>
        ) : null}

        {deviceClock ? (
          <>
            <View style={themed($infoRow)}>
              <Text text="Device clock" size="xs" style={themed($infoLabel)} />
              <Text
                text={deviceClock.toLocaleString([], {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
                size="xs"
                weight="semiBold"
                style={themed($infoValue)}
              />
            </View>
            <View style={themed($divider)} />
          </>
        ) : null}

        <View style={themed($infoRow)}>
          <Text text="Last sync" size="xs" style={themed($infoLabel)} />
          <Text text={lastSyncText} size="xs" weight="semiBold" style={themed($infoValue)} />
        </View>

        <View style={themed($divider)} />

        {/* Sync action */}
        <TouchableOpacity
          style={themed($infoRow)}
          onPress={syncNow}
          disabled={!isConnected || isSyncing}
          activeOpacity={0.6}
        >
          <View style={themed($syncLabel)}>
            {isSyncing ? (
              <ArrowsClockwise size={16} color={colors.tint} />
            ) : (
              <CloudArrowDown size={16} color={colors.iconDim} />
            )}
            <Text
              text={isSyncing ? (syncStage || "Syncing...") : "Sync now"}
              size="xs"
              style={themed(isSyncing ? $infoValueAccent : $infoLabel)}
            />
          </View>
          {!isSyncing ? (
            <CaretRight size={16} color={colors.iconDim} />
          ) : null}
        </TouchableOpacity>

        {isSyncing ? (
          <AnimatedProgressBar
            progress={syncProgress ? Math.min(syncProgress.chunksReceived / Math.max(syncProgress.chunksReceived + 3, 10), 0.95) : 0}
            indeterminate={!syncProgress}
            height={3}
            borderRadius={2}
            progressColor={colors.tint}
            trackColor={colors.divider}
          />
        ) : null}
      </View>

      {/* ─── Bottom actions ─── */}
      <View style={themed($bottomActions)}>
        {/* Nearby straps */}
        {!isConnected && scannedDevices.length > 0 ? (
          <View style={themed($nearbySection)}>
            {scannedDevices.map((device) => (
              <TouchableOpacity
                key={device.id}
                onPress={() => connect(device.id)}
                style={themed($nearbyRow)}
                activeOpacity={0.6}
              >
                <View style={themed($nearbyMeta)}>
                  <Text text={device.name} size="xs" weight="semiBold" style={themed($infoValue)} />
                  <Text text={`${device.rssi} dBm`} size="xxs" style={themed($infoLabel)} />
                </View>
                <Text text="Connect" size="xs" weight="semiBold" style={themed($linkText)} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Connection action */}
        {isConnected ? (
          <Dialog>
            <Dialog.Trigger asChild>
              <TouchableOpacity style={themed($destructiveButton)} activeOpacity={0.8}>
                <Text text={connectionAction.title} size="xs" weight="semiBold" style={themed($destructiveText)} />
              </TouchableOpacity>
            </Dialog.Trigger>
            <Dialog.Content onClose={() => {}}>
              <Dialog.Backdrop backgroundColor={colors.overlay50}>
                <View style={themed($dialogContent)}>
                  <Text text="Unpair Device" size="lg" weight="bold" style={themed($infoValue)} />
                  <Text text="Are you sure? You'll need to re-pair the strap to sync again." size="xs" style={themed($dialogBody)} />
                  <View style={themed($dialogRow)}>
                    <Dialog.Close asChild>
                      <TouchableOpacity style={themed($dialogCancel)}>
                        <Text text="Cancel" size="xs" weight="semiBold" style={{ color: colors.text }} />
                      </TouchableOpacity>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <TouchableOpacity style={themed($dialogDestructive)} onPress={() => { disconnect(); Toast.show("Device disconnected", { type: "info", position: "top" }) }}>
                        <Text text="Unpair" size="xs" weight="semiBold" style={{ color: colors.onSurface }} />
                      </TouchableOpacity>
                    </Dialog.Close>
                  </View>
                </View>
              </Dialog.Backdrop>
            </Dialog.Content>
          </Dialog>
        ) : (
          <TouchableOpacity style={themed($primaryButton)} onPress={connectionAction.onPress} activeOpacity={0.8}>
            <Text text={connectionAction.title} size="xs" weight="semiBold" style={themed($primaryButtonText)} />
          </TouchableOpacity>
        )}

        {/* Log out */}
        <TouchableOpacity
          style={themed($destructiveButton)}
          activeOpacity={0.8}
          onPress={() => { forceLogout(); void logout() }}
        >
          <Text text="Log Out" size="xs" weight="semiBold" style={themed($destructiveText)} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

// ═══════════════════════ Styles ═══════════════════════

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.md,
})

// Hero
const $hero: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  justifyContent: "center",
  gap: 8,
})

const $watchCircleOuter: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 8,
})

const $chargingGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderRadius: 56,
  height: 112,
  position: "absolute",
  width: 112,
})

const $watchCircle: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceCard,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 48,
  borderWidth: 1,
  height: 96,
  justifyContent: "center",
  width: 96,
})

const $chargingBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 10,
  bottom: -2,
  height: 20,
  justifyContent: "center",
  position: "absolute",
  right: -2,
  width: 20,
})

const $deviceName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $statusPills: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 8,
})

const $pill: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
  borderRadius: 10,
  paddingHorizontal: 10,
  paddingVertical: 4,
})

const $pillGreen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.statusGreen,
})

const $pillAmber: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.statusAmber,
})

const $pillDim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
})

const $pillTextDark: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onPrimary,
})

const $pillTextLight: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $batterySection: ThemedStyle<ViewStyle> = () => ({
  alignItems: "baseline",
  flexDirection: "row",
  marginTop: 4,
})

const $batteryNumber: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 64,
  fontWeight: "bold",
  lineHeight: 72,
})

const $batteryPercent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $batteryCaption: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})


// Info rows
const $infoSection: ThemedStyle<ViewStyle> = () => ({
  gap: 0,
})

const $infoRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 44,
})

const $divider: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.divider,
  height: 1,
})

const $syncLabel: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  gap: 8,
})

const $infoLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $infoValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $infoValueAccent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

// Bottom
const $bottomActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: 12,
  paddingBottom: spacing.sm,
  paddingTop: spacing.xs,
})

const $nearbySection: ThemedStyle<ViewStyle> = () => ({
  gap: 4,
})

const $nearbyRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "space-between",
  minHeight: 44,
})

const $nearbyMeta: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.tint,
  borderRadius: 14,
  justifyContent: "center",
  minHeight: 48,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onPrimary,
})

const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: `${colors.error}1F`,
  borderRadius: 14,
  justifyContent: "center",
  minHeight: 48,
})

const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})

// Dialog
const $dialogContent: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  backgroundColor: colors.background,
  borderColor: colors.surfaceCardBorder,
  borderRadius: 20,
  borderWidth: 1,
  gap: spacing.sm,
  padding: spacing.lg,
})

const $dialogBody: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 20,
})

const $dialogRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.xs,
})

const $dialogCancel: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.surfaceElevated,
  borderRadius: 14,
  flex: 1,
  justifyContent: "center",
  minHeight: 44,
})

const $dialogDestructive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignItems: "center",
  backgroundColor: colors.error,
  borderRadius: 14,
  flex: 1,
  justifyContent: "center",
  minHeight: 44,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})
