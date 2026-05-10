import { View } from "react-native"

import { Text } from "@/components/Text"
import { useColorMode } from "@/context/ThemeContext"
import { LOCAL_THEME } from "@/utils/localTheme"

export type MetricHeroProps = {
  /** Big number / display text on the left (e.g. "12.4", "58 ms"). */
  value: string
  /** Optional sub-line under the value (range, target, etc.). */
  valueDetail?: string | null
  /** Optional badge in the top-right ("Build" / "Good" / "Normal"). */
  badge?: {
    label: string
    /** Tint color — used for the badge text + background tint. */
    tint: string
    /** Optional number inside the badge ("87" before "Good"). */
    accent?: string
  }
  /** Optional "+/- N vs week" line under the badge. */
  delta?: number | null
  deltaUnit?: string
  deltaPositiveIsGood?: boolean
  /** Optional paragraph under the row. */
  detail?: string
}

export function MetricHero({
  value,
  valueDetail,
  badge,
  delta,
  deltaUnit,
  deltaPositiveIsGood = true,
  detail,
}: MetricHeroProps) {
  useColorMode()
  const colors = LOCAL_THEME.colors

  const showDelta = delta != null && Number.isFinite(delta)
  const isGood = showDelta && (deltaPositiveIsGood ? delta! >= 0 : delta! <= 0)
  const deltaColor = !showDelta ? colors.textMuted : isGood ? "#4ade80" : "#f87171"
  const sign = showDelta && delta! > 0 ? "+" : ""

  return (
    <View style={{ paddingVertical: 18, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text
            text={value}
            style={{ fontSize: 44, lineHeight: 52, fontWeight: "300", color: colors.text }}
          />
          {valueDetail ? (
            <Text text={valueDetail} size="xs" style={{ color: colors.textDim, marginTop: 4 }} />
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          {badge ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: `${badge.tint}1F`,
              }}
            >
              {badge.accent ? (
                <Text
                  text={badge.accent}
                  style={{ color: badge.tint, fontWeight: "600", fontSize: 18, lineHeight: 22 }}
                />
              ) : null}
              <Text text={badge.label} size="xs" style={{ color: badge.tint, opacity: 0.85 }} />
            </View>
          ) : null}
          {showDelta ? (
            <Text
              text={`${sign}${delta} ${deltaUnit ?? ""} vs week`.trim()}
              size="xxs"
              style={{ color: deltaColor, marginTop: 4 }}
            />
          ) : null}
        </View>
      </View>

      {detail ? (
        <Text
          text={detail}
          size="xs"
          style={{ color: colors.textDim, marginTop: 14, lineHeight: 18 }}
        />
      ) : null}
    </View>
  )
}
