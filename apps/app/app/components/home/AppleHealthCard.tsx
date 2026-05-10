import { FC } from "react"
import { Platform, Pressable, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"

import { Text } from "@/components/Text"
import { useHealthKit } from "@/context/HealthKitContext"
import { LOCAL_THEME } from "@/utils/localTheme"

type StatProps = {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  tint: string
}

const StatChip: FC<StatProps> = ({ icon, label, value, tint }) => {
  const colors = LOCAL_THEME.colors
  return (
    <View style={$chip}>
      <Ionicons name={icon} size={16} color={tint} />
      <View style={$chipText}>
        <Text
          text={label.toUpperCase()}
          style={{
            color: colors.textDim,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 1.2,
          }}
        />
        <Text
          text={value}
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "800",
            fontVariant: ["tabular-nums"],
          }}
        />
      </View>
    </View>
  )
}

function formatInt(n: number | null | undefined): string {
  if (n == null) return "--"
  return Math.round(n).toLocaleString()
}

function formatKcal(n: number | null | undefined): string {
  if (n == null) return "--"
  return `${Math.round(n).toLocaleString()}`
}

function formatKm(meters: number | null | undefined): string {
  if (meters == null) return "--"
  const km = meters / 1000
  return km < 10 ? km.toFixed(1) : Math.round(km).toString()
}

export const AppleHealthCard: FC = () => {
  const colors = LOCAL_THEME.colors
  const {
    status,
    selectedSummary,
    todaySummary,
    hasRequestedPermission,
    requestPermission,
    errorMessage,
  } = useHealthKit()

  if (Platform.OS !== "ios") return null
  if (status === "unavailable") return null

  const summary = selectedSummary ?? todaySummary

  const handleConnect = async () => {
    try {
      await requestPermission()
    } catch (err) {
      // Don't let a native rejection bubble into the React tree.
      console.warn("[apple-health-card] connect failed", err)
    }
  }

  if (status === "needsPermission" || status === "error" || !hasRequestedPermission) {
    return (
      <Pressable
        onPress={handleConnect}
        style={({ pressed }) => [
          $card,
          { backgroundColor: colors.surfaceCard },
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={$header}>
          <Ionicons name="heart" size={18} color={colors.statusRed} />
          <Text
            text="APPLE HEALTH"
            style={{
              color: colors.textDim,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.4,
            }}
          />
        </View>
        <Text
          text={status === "error" ? "Couldn't connect — tap to retry" : "Connect Apple Health"}
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "800",
            marginTop: 6,
          }}
        />
        <Text
          text={
            status === "error" && errorMessage
              ? errorMessage
              : "Blend Apple Watch and iPhone signals — steps, workouts, ECG, and more — into your recovery picture."
          }
          style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 }}
        />
      </Pressable>
    )
  }

  return (
    <View style={[$card, { backgroundColor: colors.surfaceCard }]}>
      <View style={$header}>
        <Ionicons name="heart" size={18} color={colors.statusRed} />
        <Text
          text="APPLE HEALTH"
          style={{
            color: colors.textDim,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
          }}
        />
        {status === "loading" ? (
          <Text
            text="Syncing"
            style={{
              color: colors.textDim,
              fontSize: 9,
              fontWeight: "600",
              letterSpacing: 1,
              marginLeft: "auto",
            }}
          />
        ) : null}
      </View>

      <View style={$grid}>
        <StatChip
          icon="footsteps"
          label="Steps"
          value={formatInt(summary?.steps)}
          tint={colors.ringHrv}
        />
        <StatChip
          icon="flame"
          label="Active kcal"
          value={formatKcal(summary?.activeEnergyKcal)}
          tint={colors.ringStrain}
        />
        <StatChip
          icon="time"
          label="Exercise min"
          value={formatInt(summary?.exerciseMinutes)}
          tint={colors.statusGreen}
        />
        <StatChip
          icon="sync"
          label="Stand min"
          value={formatInt(summary?.standMinutes)}
          tint={colors.ringSleep}
        />
      </View>

      <View style={$secondaryRow}>
        <Text
          text={`Walk/Run ${formatKm(summary?.walkingDistanceMeters)} km · Floors ${formatInt(
            summary?.flightsClimbed,
          )}${
            summary?.restingHeartRate
              ? ` · RHR ${Math.round(summary.restingHeartRate)}`
              : ""
          }`}
          style={{ color: colors.textMuted, fontSize: 11 }}
          numberOfLines={1}
        />
      </View>
    </View>
  )
}

const $card: ViewStyle = {
  borderRadius: 14,
  padding: 14,
  gap: 8,
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $grid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginTop: 4,
  rowGap: 10,
}

const $chip: ViewStyle = {
  width: "50%",
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $chipText: ViewStyle = {
  flexShrink: 1,
}

const $secondaryRow: ViewStyle = {
  marginTop: 4,
  borderTopWidth: 0.5,
  borderTopColor: "rgba(255,255,255,0.06)",
  paddingTop: 8,
}
