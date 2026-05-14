import { FC } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"

export type StatusTone = "ok" | "warn" | "bad" | "dim"

const TONE_STYLE: Record<StatusTone, { bg: string; fg: string }> = {
  ok:   { bg: "rgba(34,197,94,0.18)",  fg: "#1a7741" },
  warn: { bg: "rgba(251,191,36,0.20)", fg: "#7a5202" },
  bad:  { bg: "rgba(239,68,68,0.18)",  fg: "#8a1a1a" },
  dim:  { bg: "rgba(0,0,0,0.06)",      fg: "#564E4A" },
}

type Props = { tone: StatusTone; text: string }

export const StatusPill: FC<Props> = ({ tone, text }) => {
  const palette = TONE_STYLE[tone]
  return (
    <View style={[$pill, { backgroundColor: palette.bg }]}>
      <Text text={text} size="xxs" weight="bold" style={{ color: palette.fg }} />
    </View>
  )
}

const $pill: ViewStyle = {
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderRadius: 999,
}
