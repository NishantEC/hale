import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { SymbolView } from "expo-symbols"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Variant = "strain" | "tape"

type Props = {
  variant: Variant
  isToday: boolean
}

export const RestDayEmpty: FC<Props> = ({ variant, isToday }) => {
  const { colors } = LOCAL_THEME

  const { title, body } = copyFor(variant, isToday)

  return (
    <View style={variant === "strain" ? $strainWrap : $tapeWrap}>
      <View style={$row}>
        <SymbolView
          name="moon.zzz.fill"
          size={18}
          tintColor={colors.textDim}
          resizeMode="scaleAspectFit"
        />
        <Text
          text={title}
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: "600",
          }}
        />
      </View>
      <Text
        text={body}
        style={{
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 6,
          marginLeft: 26,
        }}
      />
    </View>
  )
}

function copyFor(variant: Variant, isToday: boolean): { title: string; body: string } {
  if (isToday) {
    return variant === "strain"
      ? {
          title: "Resting",
          body: "Take it easy today — recovery counts too. Bouts will appear here as you move.",
        }
      : {
          title: "Resting",
          body: "Light day so far. We'll log activity as it shows up.",
        }
  }
  return variant === "strain"
    ? {
        title: "Quiet day",
        body: "No activity logged. Either a true rest day, or the strap missed the window.",
      }
    : {
        title: "Quiet day",
        body: "No events logged.",
      }
}

const $strainWrap: ViewStyle = {
  marginHorizontal: 16,
  marginTop: 6,
  paddingVertical: 8,
}

const $tapeWrap: ViewStyle = {
  paddingVertical: 14,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}
