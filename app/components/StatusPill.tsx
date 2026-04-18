import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type StatusPillProps = {
  label: string
  tone?: "default" | "success" | "warning"
}

export function StatusPill({ label, tone = "default" }: StatusPillProps) {
  const { themed } = useAppTheme()

  return (
    <View style={themed($pill(tone))}>
      <Text text={label} size="xxs" weight="semiBold" style={themed($label)} />
    </View>
  )
}

function $pill(tone: StatusPillProps["tone"]): ThemedStyle<ViewStyle> {
  return ({ colors }) => {
    const toneMap = {
      default: {
        backgroundColor: colors.surfaceSubtle,
        borderColor: colors.surfaceCardBorder,
      },
      success: {
        backgroundColor: "rgba(44, 204, 113, 0.14)",
        borderColor: "rgba(44, 204, 113, 0.2)",
      },
      warning: {
        backgroundColor: "rgba(255, 170, 40, 0.14)",
        borderColor: "rgba(255, 170, 40, 0.2)",
      },
    }
    return {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      ...toneMap[tone ?? "default"],
    }
  }
}

const $label: ThemedStyle<ViewStyle | any> = ({ colors }) => ({
  color: colors.text,
  textTransform: "uppercase",
  letterSpacing: 0.6,
})
