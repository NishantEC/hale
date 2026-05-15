import { FC } from "react"
import { Platform, Pressable, View, ViewStyle } from "react-native"
import { PhosphorIcon } from "@/components/PhosphorIcon"

import { Text } from "@/components/Text"
import { useHealthKit } from "@/context/HealthKitContext"
import { LOCAL_THEME } from "@/utils/localTheme"

import { StatCard, type StatChipData } from "./StatCard"

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
      console.warn("[apple-health-card] connect failed", err)
    }
  }

  if (status === "needsPermission" || status === "error" || !hasRequestedPermission) {
    return (
      <Pressable
        onPress={handleConnect}
        style={({ pressed }) => [
          $promptCard,
          { backgroundColor: colors.surfaceCard },
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={$header}>
          <PhosphorIcon name="heart" size={18} color={colors.statusRed} />
          <Text
            text={status === "error" ? "Couldn't connect — tap to retry" : "Connect Apple Health"}
            style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
          />
        </View>
        <Text
          text={
            status === "error" && errorMessage
              ? errorMessage
              : "Blend Apple Watch and iPhone signals into your recovery picture."
          }
          style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 }}
        />
      </Pressable>
    )
  }

  const chips: StatChipData[] = [
    {
      key: "steps",
      label: "Steps",
      value: formatInt(summary?.steps),
      iconName: "footsteps",
      iconColor: colors.ringHrv,
    },
    {
      key: "kcal",
      label: "Active kcal",
      value: formatKcal(summary?.activeEnergyKcal),
      iconName: "flame",
      iconColor: colors.ringStrain,
    },
    {
      key: "exercise",
      label: "Exercise min",
      value: formatInt(summary?.exerciseMinutes),
      iconName: "time",
      iconColor: colors.statusGreen,
    },
    {
      key: "stand",
      label: "Stand min",
      value: formatInt(summary?.standMinutes),
      iconName: "sync",
      iconColor: colors.ringSleep,
    },
  ]

  const footer = `Walk/Run ${formatKm(summary?.walkingDistanceMeters)} km · Floors ${formatInt(
    summary?.flightsClimbed,
  )}${summary?.restingHeartRate ? ` · RHR ${Math.round(summary.restingHeartRate)}` : ""}`

  return <StatCard chips={chips} footer={footer} />
}

const $promptCard: ViewStyle = {
  borderRadius: 14,
  padding: 14,
  gap: 8,
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}
