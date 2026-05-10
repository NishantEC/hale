import { FC } from "react"
import { Pressable, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  time: string // "HH:MM"
  dotColor: string
  title: string
  desc?: string
  onPress?: () => void
}

export const TapeRow: FC<Props> = ({ time, dotColor, title, desc, onPress }) => {
  const colors = LOCAL_THEME.colors

  const content = (
    <View style={$row}>
      <Text
        text={time}
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.5,
          minWidth: 44,
          paddingTop: 3,
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={[$dot, { backgroundColor: dotColor }]} />
      <View style={$body}>
        <Text
          text={title}
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
        />
        {desc ? (
          <Text
            text={desc}
            numberOfLines={2}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
        ) : null}
      </View>
    </View>
  )

  if (!onPress) return content
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  gap: 12,
  alignItems: "flex-start",
  paddingVertical: 10,
}

const $dot: ViewStyle = {
  width: 9,
  height: 9,
  borderRadius: 5,
  marginTop: 7,
  flexShrink: 0,
}

const $body: ViewStyle = {
  flex: 1,
  minWidth: 0,
}
