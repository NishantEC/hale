import { FC } from "react"
import { ScrollView, Switch, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import { CaretLeft } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useServerPreferences } from "@/utils/useServerPreferences"

export const SettingsNotificationsScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const { prefs, patch, loading } = useServerPreferences()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={$navBar}>
        <Text
          text="Notifications"
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
          text="Push notifications haven't been wired to a delivery service yet — preferences saved here will take effect once they ship."
          style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}
        />

        <SectionLabel>Health alerts</SectionLabel>
        <Card>
          <ToggleRow
            label="Recovery drop"
            description="Alert when today's recovery is 25 % below your 7-day average."
            value={prefs.notifications.recoveryDrop}
            onChange={(v) => patch({ notifications: { recoveryDrop: v } })}
            disabled={loading}
          />
          <Divider />
          <ToggleRow
            label="Strap battery low"
            description="Alert when the strap drops below 15 %."
            value={prefs.notifications.strapBatteryLow}
            onChange={(v) => patch({ notifications: { strapBatteryLow: v } })}
            disabled={loading}
          />
        </Card>

        <SectionLabel>Daily rhythm</SectionLabel>
        <Card>
          <ToggleRow
            label="Bedtime reminder"
            description="Nudge an hour before your planner bedtime."
            value={prefs.notifications.sleepBedtimeReminder}
            onChange={(v) => patch({ notifications: { sleepBedtimeReminder: v } })}
            disabled={loading}
          />
          <Divider />
          <ToggleRow
            label="Morning summary"
            description="Push with last night's sleep + today's recovery as you wake."
            value={prefs.notifications.morningSummary}
            onChange={(v) => patch({ notifications: { morningSummary: v } })}
            disabled={loading}
          />
        </Card>

        <SectionLabel>Reports</SectionLabel>
        <Card>
          <ToggleRow
            label="Weekly digest"
            description="Sunday-evening recap of the week's trends."
            value={prefs.notifications.weeklyDigest}
            onChange={(v) => patch({ notifications: { weeklyDigest: v } })}
            disabled={loading}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const SectionLabel: FC<{ children: string }> = ({ children }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={children.toUpperCase()}
      style={{
        color: colors.textDim,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        marginTop: 6,
        marginLeft: 4,
      }}
    />
  )
}

const Card: FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = LOCAL_THEME
  return <View style={[$card, { backgroundColor: colors.surfaceCard }]}>{children}</View>
}

const Divider: FC = () => {
  const { colors } = LOCAL_THEME
  return <View style={[$divider, { backgroundColor: colors.surfaceElevated }]} />
}

const ToggleRow: FC<{
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}> = ({ label, description, value, onChange, disabled }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={$row}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text text={label} style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} />
        <Text
          text={description}
          style={{ color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 }}
        />
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          onChange(v)
        }}
        disabled={disabled}
        thumbColor="#FFFFFF"
        trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn ?? colors.tint }}
      />
    </View>
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

const $divider: ViewStyle = {
  height: 1,
  marginLeft: 0,
  marginRight: 0,
}
