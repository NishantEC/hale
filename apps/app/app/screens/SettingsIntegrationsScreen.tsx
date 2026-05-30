import { FC } from "react"
import { Platform, Pressable, ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import { CaretRight, CheckCircle } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type IntegrationStatus = "connected" | "available" | "coming-soon" | "platform-unavailable"

type Integration = {
  key: string
  label: string
  description: string
  status: IntegrationStatus
  platform?: "ios" | "android" | "all"
}

const INTEGRATIONS: Integration[] = [
  {
    key: "apple-health",
    label: "Apple Health",
    description: "Read sleep, workouts, and heart-rate samples from HealthKit.",
    status: Platform.OS === "ios" ? "connected" : "platform-unavailable",
    platform: "ios",
  },
  {
    key: "health-connect",
    label: "Google Health Connect",
    description: "Android equivalent of HealthKit — read body signals from third-party apps.",
    status: Platform.OS === "android" ? "coming-soon" : "platform-unavailable",
    platform: "android",
  },
  {
    key: "spotify",
    label: "Spotify wind-down",
    description: "Queue a wind-down playlist near your planner bedtime.",
    status: "coming-soon",
  },
  {
    key: "calendar",
    label: "Calendar overlays",
    description: "Pull workouts, travel, and meetings onto the day tape for context.",
    status: "coming-soon",
  },
]

export const SettingsIntegrationsScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={$navBar}>
        <Text
          text="Integrations"
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.2,
          }}
          onPress={() => router.back()}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <Text
          text="External health + lifestyle sources noop can pull from or write to."
          style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}
        />

        {INTEGRATIONS.map((i) => (
          <IntegrationRow key={i.key} integration={i} />
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const IntegrationRow: FC<{ integration: Integration }> = ({ integration }) => {
  const { colors } = LOCAL_THEME
  const isConnected = integration.status === "connected"
  const isComingSoon = integration.status === "coming-soon"
  const isUnavailable = integration.status === "platform-unavailable"

  const statusColor = isConnected
    ? colors.statusGreen
    : isComingSoon
      ? colors.textMuted
      : colors.textDim

  const statusLabel = isConnected
    ? "Connected"
    : isComingSoon
      ? "Coming soon"
      : isUnavailable
        ? `${integration.platform === "ios" ? "iOS" : "Android"} only`
        : "Available"

  return (
    <Pressable
      disabled={!isConnected}
      style={({ pressed }) => [
        $card,
        { backgroundColor: colors.surfaceCard },
        pressed && isConnected ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={$row}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            text={integration.label}
            style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
          />
          <Text
            text={integration.description}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 }}
          />
        </View>
        {isConnected ? <CheckCircle size={18} color={statusColor} weight="fill" /> : null}
        {!isConnected ? (
          <Text
            text={statusLabel}
            style={{
              color: statusColor,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.2,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

const $navBar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 16,
  paddingVertical: 12,
}

const $card: ViewStyle = {
  borderRadius: 14,
  paddingHorizontal: 16,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 14,
}
