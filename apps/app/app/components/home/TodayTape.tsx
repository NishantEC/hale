import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { TapeEvent } from "@/utils/buildTodayTape"
import { LOCAL_THEME } from "@/utils/localTheme"

import { TapeRow } from "./TapeRow"

type Props = {
  events: TapeEvent[]
  onEventPress?: (event: TapeEvent) => void
}

export const TodayTape: FC<Props> = ({ events, onEventPress }) => {
  const colors = LOCAL_THEME.colors

  if (events.length === 0) {
    return (
      <View style={$empty}>
        <Text
          text="Nothing logged yet today."
          style={{ color: colors.textDim, fontSize: 11 }}
        />
        <Text
          text="Tap + to log your first entry."
          style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}
        />
      </View>
    )
  }

  return (
    <View>
      {events.map((event, i) => (
        <View key={event.id}>
          <TapeRow
            time={event.time}
            dotColor={event.dotColor}
            title={event.title}
            desc={event.desc}
            onPress={onEventPress ? () => onEventPress(event) : undefined}
          />
          {i < events.length - 1 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.divider,
                marginLeft: 44 + 12 + 9 + 12, // time width + gap + dot + gap
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  )
}

const $empty: ViewStyle = {
  paddingVertical: 16,
  alignItems: "flex-start",
}
