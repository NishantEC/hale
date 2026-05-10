import { View } from "react-native"
import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useColorMode } from "@/context/ThemeContext"

export type VitalCardProps = {
  label: string
  value: string
  unit?: string
  delta?: number | null
  deltaUnit?: string
  deltaPositiveIsGood?: boolean
}

export function VitalCard({ label, value, unit, delta, deltaUnit, deltaPositiveIsGood = true }: VitalCardProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors
  const showDelta = delta != null && Number.isFinite(delta)
  const isGood = showDelta && (deltaPositiveIsGood ? delta! >= 0 : delta! <= 0)
  const deltaColor = !showDelta ? colors.textMuted : isGood ? "#4ade80" : "#f87171"
  const deltaSign = showDelta && delta! > 0 ? "+" : ""
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceCard,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text text={label.toUpperCase()} size="xxs" style={{ color: colors.textMuted, letterSpacing: 0.6 }} />
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
        <Text text={value} size="xl" weight="medium" style={{ color: colors.text }} />
        {unit ? (
          <Text text={` ${unit}`} size="xs" style={{ color: colors.textDim, marginLeft: 2 }} />
        ) : null}
      </View>
      {showDelta ? (
        <Text
          text={`${deltaSign}${delta} ${deltaUnit ?? ""} vs week`.trim()}
          size="xxs"
          style={{ color: deltaColor, marginTop: 2 }}
        />
      ) : null}
    </View>
  )
}
