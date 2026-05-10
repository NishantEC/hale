import { FC, useCallback, useEffect, useMemo, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import Constants from "expo-constants"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { BlurHeader } from "@/components/BlurHeader"
import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { useDashboard } from "@/context/DashboardContext"
import { ColorMode, useColorMode } from "@/context/ThemeContext"
import { LOCAL_THEME } from "@/utils/localTheme"

type IconName = keyof typeof Ionicons.glyphMap

export const SettingsScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark
  const { authEmail, logout } = useAuth()
  const { liveDeviceState } = useDashboard()
  const { mode: colorMode, setMode: setColorMode } = useColorMode()
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setNow(Date.now())
    setTimeout(() => setRefreshing(false), 400)
  }, [])

  const isConnected = liveDeviceState.connectionState === "ready"
  const isConnecting =
    liveDeviceState.connectionState === "connecting" ||
    liveDeviceState.connectionState === "discovering"
  const deviceStatusLabel = isConnected ? "Connected" : isConnecting ? "Pairing" : "Offline"
  const deviceStatusColor = isConnected
    ? colors.statusGreen
    : isConnecting
      ? colors.statusAmber
      : colors.textMuted
  const lastSyncLabel = formatLastSync(liveDeviceState.lastSyncAt, now)

  const appVersion = Constants.expoConfig?.version ?? "1.0.0"
  const buildNumber =
    (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig?.android?.versionCode)
      : undefined)
  const versionLabel = buildNumber ? `${appVersion} (${buildNumber})` : appVersion

  function confirmLogout() {
    Alert.alert(
      "Sign out?",
      "You'll need to sign back in to sync your data.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => logout() },
      ],
      { cancelable: true },
    )
  }

  const cardShadow = useMemo(
    () =>
      Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 8,
        },
        android: { elevation: 2 },
      }),
    [isDark],
  )

  function Card({
    children,
    style,
    onPress,
  }: {
    children: React.ReactNode
    style?: ViewStyle | ViewStyle[]
    onPress?: () => void
  }) {
    const baseStyle: ViewStyle = {
      backgroundColor: colors.surfaceCard,
      borderColor: colors.surfaceCardBorder,
      borderRadius: 8,
      borderWidth: colors.surfaceCardBorder === "transparent" ? 0 : 1,
      overflow: "hidden",
      ...(cardShadow as object),
    }
    if (!onPress) {
      return <View style={[baseStyle, style as ViewStyle]}>{children}</View>
    }
    return (
      <Pressable onPress={onPress} style={[baseStyle, style as ViewStyle]}>
        {children}
      </Pressable>
    )
  }

  function Row({
    icon,
    iconColor,
    label,
    value,
    valueColor,
    chevron,
    destructive,
    onPress,
  }: {
    icon?: IconName
    iconColor?: string
    label: string
    value?: string
    valueColor?: string
    chevron?: boolean
    destructive?: boolean
    onPress?: () => void
  }) {
    const labelColor = destructive ? colors.error : colors.text
    const resolvedIconColor = iconColor ?? (destructive ? colors.error : colors.iconDim)

    const content = (
      <View style={$row}>
        {icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={resolvedIconColor}
            style={{ marginRight: 14, width: 22 }}
          />
        ) : null}
        <Text
          text={label}
          style={{
            color: labelColor,
            fontSize: 16,
            fontWeight: "400",
            flexShrink: 1,
          }}
          numberOfLines={1}
        />
        <View style={{ flex: 1, minWidth: 8 }} />
        {value ? (
          <Text
            text={value}
            style={{
              color: valueColor ?? colors.textDim,
              fontSize: 14,
              fontVariant: ["tabular-nums"],
              maxWidth: 200,
            }}
            numberOfLines={1}
          />
        ) : null}
        {chevron ? (
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textMuted}
            style={{ marginLeft: 6 }}
          />
        ) : null}
      </View>
    )
    if (!onPress) return content
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.divider }}
        style={({ pressed }) => [pressed && { backgroundColor: colors.surfaceSubtle }]}
      >
        {content}
      </Pressable>
    )
  }

  function ThemePill({
    active,
    label,
    icon,
    onPress,
  }: {
    active: boolean
    label: string
    icon: IconName
    onPress: () => void
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          $themePill,
          {
            backgroundColor: active ? colors.tint : colors.surfaceElevated,
            borderColor: active ? colors.tint : colors.border,
          },
          pressed && !active && { opacity: 0.75 },
        ]}
      >
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.onPrimary : colors.textDim}
        />
        <Text
          text={label}
          style={{
            color: active ? colors.onPrimary : colors.textDim,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        />
      </Pressable>
    )
  }

  function SectionLabel({ children }: { children: string }) {
    return (
      <Text
        text={children}
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
          marginBottom: 10,
          marginLeft: 8,
          textTransform: "uppercase",
        }}
      />
    )
  }

  function Divider() {
    return (
      <View
        style={{
          backgroundColor: colors.divider,
          height: StyleSheet.hairlineWidth,
          marginLeft: 16 + 22 + 14,
        }}
      />
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <Animated.ScrollView
        contentContainerStyle={$scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
      >
        <Text
          text="Settings"
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "700",
            letterSpacing: -0.2,
            marginBottom: 4,
          }}
        />
        <Text
          text={authEmail ? `Signed in · ${authEmail}` : "Not signed in"}
          style={{ color: colors.textDim, fontSize: 14, marginBottom: 24 }}
          numberOfLines={1}
          ellipsizeMode="middle"
        />

        {/* Account */}
        <Card style={$accountCard}>
          <View style={$accountInner}>
            <View
              style={[
                $accountAvatar,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              <Text
                text={initialsOf(authEmail)}
                style={{
                  color: colors.tint,
                  fontSize: 22,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                }}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                text="ACCOUNT"
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                }}
              />
              <Text
                text={displayNameFromEmail(authEmail)}
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "700",
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              />
              <Text
                text={authEmail || "—"}
                style={{ color: colors.textDim, fontSize: 13 }}
                numberOfLines={1}
                ellipsizeMode="middle"
              />
            </View>
          </View>
        </Card>

        {/* Appearance */}
        <SectionLabel>Appearance</SectionLabel>
        <Card>
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ gap: 2 }}>
              <Text
                text="Theme"
                style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}
              />
              <Text
                text={appearanceCaption(colorMode, isDark)}
                style={{ color: colors.textDim, fontSize: 12 }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["system", "light", "dark"] as const).map((option) => (
                <ThemePill
                  key={option}
                  active={colorMode === option}
                  label={option === "system" ? "Auto" : option === "light" ? "Light" : "Dark"}
                  icon={
                    option === "system"
                      ? "phone-portrait-outline"
                      : option === "light"
                        ? "sunny-outline"
                        : "moon-outline"
                  }
                  onPress={() => setColorMode(option as ColorMode)}
                />
              ))}
            </View>
          </View>
        </Card>

        {/* Device */}
        <SectionLabel>Device</SectionLabel>
        <Card>
          <Row
            icon="watch-outline"
            iconColor={isConnected ? colors.statusGreen : colors.iconDim}
            label={liveDeviceState.deviceName || "WHOOP"}
            value={deviceStatusLabel}
            valueColor={deviceStatusColor}
            chevron
            onPress={() => router.push("/device-settings")}
          />
          <Divider />
          <Row icon="time-outline" label="Last sync" value={lastSyncLabel} />
          {liveDeviceState.firmwareVersion ? (
            <>
              <Divider />
              <Row
                icon="hardware-chip-outline"
                label="Firmware"
                value={liveDeviceState.firmwareVersion}
              />
            </>
          ) : null}
        </Card>

        {/* General */}
        <SectionLabel>General</SectionLabel>
        <Card>
          <Row
            icon="document-text-outline"
            label="Privacy policy"
            chevron
            onPress={() => Linking.openURL("https://noop.app/privacy").catch(() => {})}
          />
          <Divider />
          <Row
            icon="shield-checkmark-outline"
            label="Terms of service"
            chevron
            onPress={() => Linking.openURL("https://noop.app/terms").catch(() => {})}
          />
          <Divider />
          <Row
            icon="pulse-outline"
            label="Diagnostics"
            chevron
            onPress={() => router.push("/debug-inspector")}
          />
        </Card>

        {/* About */}
        <SectionLabel>About</SectionLabel>
        <Card>
          <Row icon="information-circle-outline" label="Version" value={versionLabel} />
          <Divider />
          <Row
            icon="phone-portrait-outline"
            label="Platform"
            value={`${Platform.OS} ${Platform.Version}`}
          />
        </Card>

        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [
            $signOut,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.error,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text
            text="Sign out"
            style={{
              color: colors.error,
              fontSize: 14,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          />
        </Pressable>

        <Text
          text={`NOOP · ${versionLabel}`}
          style={{
            color: colors.textMuted,
            fontSize: 11,
            letterSpacing: 1.4,
            marginTop: 8,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        />
      </Animated.ScrollView>

      <BlurHeader title="Settings" scrollY={scrollY} fadeOver={64} />
    </SafeAreaView>
  )
}

// ───────────────────────────── Helpers ─────────────────────────────

function initialsOf(email: string | undefined): string {
  if (!email) return "?"
  const local = email.split("@")[0] ?? ""
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, "")
  if (!cleaned) return email.charAt(0).toUpperCase() || "?"
  return cleaned.slice(0, 2).toUpperCase()
}

function displayNameFromEmail(email: string | undefined): string {
  if (!email) return "Guest"
  const local = email.split("@")[0] ?? ""
  if (!local) return email
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function appearanceCaption(mode: ColorMode, isDark: boolean): string {
  if (mode === "system") return `Following system · ${isDark ? "Dark" : "Light"}`
  return mode === "dark" ? "Dark" : "Light"
}

function formatLastSync(lastSyncAt: string | null | undefined, now: number): string {
  if (!lastSyncAt) return "Never"
  const ts = new Date(lastSyncAt).getTime()
  if (!Number.isFinite(ts)) return "Never"
  const diff = Math.max(0, now - ts)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ───────────────────────────── Styles ─────────────────────────────

const $scroll: ViewStyle = {
  paddingHorizontal: 24,
  paddingTop: 32,
  paddingBottom: 132,
  gap: 8,
}
const $accountCard: ViewStyle = { marginBottom: 24 }
const $accountInner: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  gap: 16,
  padding: 16,
}
const $accountAvatar: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  height: 64,
  justifyContent: "center",
  width: 64,
}
const $row: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  minHeight: 56,
  paddingHorizontal: 16,
  paddingVertical: 12,
}
const $themePill: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  borderWidth: 1,
  flex: 1,
  flexDirection: "row",
  gap: 6,
  justifyContent: "center",
  paddingHorizontal: 12,
  paddingVertical: 10,
}
const $signOut: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  borderWidth: 1,
  flexDirection: "row",
  gap: 8,
  justifyContent: "center",
  marginTop: 24,
  paddingVertical: 14,
}
