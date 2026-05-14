import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

export type StatusTone = "ok" | "warn" | "bad" | "dim"

// Pill backgrounds are the status colour at ~22% alpha. We append "38" (≈0.22)
// to the hex tokens at render time so the same component matches whichever
// status palette is active.
function withAlpha(hex: string, alpha: string): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex
  return `${hex}${alpha}`
}

type Props = { tone: StatusTone; text: string }

export const StatusPill: FC<Props> = ({ tone, text }) => {
  const { colors } = LOCAL_THEME
  let fg: string
  let bg: string
  switch (tone) {
    case "ok":
      fg = colors.statusGreen
      bg = withAlpha(colors.statusGreen, "38")
      break
    case "warn":
      fg = colors.statusAmber
      bg = withAlpha(colors.statusAmber, "38")
      break
    case "bad":
      fg = colors.statusRed
      bg = withAlpha(colors.statusRed, "38")
      break
    case "dim":
    default:
      fg = colors.textDim
      bg = colors.surfaceElevated
      break
  }
  return (
    <View style={[$pill, { backgroundColor: bg }]}>
      <Text text={text} size="xxs" weight="bold" style={{ color: fg }} />
    </View>
  )
}

const $pill: ViewStyle = {
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderRadius: 999,
}
