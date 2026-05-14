import { ReactNode } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

interface Props {
  voltageMv: number | null
  temperatureC: number | null
  iconLevel: number | null
}

// Shared 3-cell strip showing voltage / temperature / icon level for
// the connected strap. Rendered by both DeviceScreen and
// DeviceSettingsScreen so the formatting stays in one place.
export function BatteryPanel({ voltageMv, temperatureC, iconLevel }: Props) {
  const colors = LOCAL_THEME.colors
  if (voltageMv == null && temperatureC == null && iconLevel == null) return null

  return (
    <View style={[$row, { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceCard }]}>
      <Cell
        value={voltageMv != null ? `${(voltageMv / 1000).toFixed(3)}` : "--"}
        unit="V"
        label="Voltage"
      />
      <Divider />
      <Cell
        value={temperatureC != null ? temperatureC.toFixed(1) : "--"}
        unit="°C"
        label="Temp"
        warning={temperatureC != null && temperatureC >= 40}
      />
      <Divider />
      <Cell
        value={iconLevel != null ? <LevelBar level={iconLevel} /> : "--"}
        label="Level"
      />
    </View>
  )
}

function Cell({
  value,
  unit,
  label,
  warning = false,
}: {
  value: ReactNode
  unit?: string
  label: string
  warning?: boolean
}) {
  const colors = LOCAL_THEME.colors
  const valueColor = warning ? colors.statusAmber : colors.text
  return (
    <View style={$cell}>
      <View style={$valueRow}>
        {typeof value === "string" ? (
          <Text text={value} size="sm" weight="bold" style={{ color: valueColor }} />
        ) : (
          value
        )}
        {unit ? (
          <Text text={unit} size="xxs" weight="semiBold" style={{ color: colors.textMuted, marginLeft: 2 }} />
        ) : null}
      </View>
      <Text text={label} size="xxs" style={{ color: colors.textMuted, marginTop: 2 }} />
    </View>
  )
}

function Divider() {
  const colors = LOCAL_THEME.colors
  return <View style={{ width: 1, height: 24, backgroundColor: colors.divider }} />
}

function LevelBar({ level }: { level: number }) {
  const colors = LOCAL_THEME.colors
  const segments = 7
  const filled = Math.max(0, Math.min(segments, level))
  return (
    <View style={$levelBarRow}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: i < filled ? colors.text : colors.divider,
            borderRadius: 1,
            height: 10,
            width: 3,
          }}
        />
      ))}
    </View>
  )
}

const $row: ViewStyle = {
  alignItems: "center",
  borderRadius: 14,
  borderWidth: 1,
  flexDirection: "row",
  marginTop: 16,
  paddingHorizontal: 12,
  paddingVertical: 8,
}

const $cell: ViewStyle = { alignItems: "center", flex: 1 }
const $valueRow: ViewStyle = { alignItems: "baseline", flexDirection: "row" }
const $levelBarRow: ViewStyle = { alignItems: "center", flexDirection: "row", gap: 2, height: 14 }
