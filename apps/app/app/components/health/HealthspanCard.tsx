import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"
import { CaretRight } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  noopAge: string
  chronologicalAge: string
  deltaText: string | null
  deltaDirection: "younger" | "older" | "even"
  onPress: () => void
}

export const HealthspanCard: FC<Props> = ({
  noopAge,
  chronologicalAge,
  deltaText,
  deltaDirection,
  onPress,
}) => {
  const { colors } = LOCAL_THEME
  const deltaColor =
    deltaDirection === "younger"
      ? colors.statusGreen
      : deltaDirection === "older"
        ? colors.statusAmber
        : colors.textMuted

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Healthspan, noop age ${noopAge}, chronological ${chronologicalAge}`}
      style={({ pressed }) => [
        $card,
        { backgroundColor: colors.surfaceCard },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={$body}>
        <Text
          text="HEALTHSPAN"
          style={{
            color: colors.textDim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
          }}
        />
        <View style={$row}>
          <Text
            text={noopAge}
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "800",
              letterSpacing: -0.4,
              fontVariant: ["tabular-nums"],
            }}
          />
          <Text
            text="yr"
            style={{
              color: colors.textDim,
              fontSize: 12,
              marginLeft: 2,
              marginBottom: 3,
              fontVariant: ["tabular-nums"],
            }}
          />
          <Text
            text={`vs ${chronologicalAge}`}
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginLeft: 8,
              fontVariant: ["tabular-nums"],
            }}
          />
          {deltaText ? (
            <Text
              text={deltaText}
              style={{
                color: deltaColor,
                fontSize: 12,
                fontWeight: "600",
                marginLeft: 8,
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : null}
        </View>
      </View>
      <CaretRight size={14} color={colors.textMuted} />
    </Pressable>
  )
}

const $card: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
}

const $body: ViewStyle = {
  flex: 1,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "baseline",
  marginTop: 6,
}
