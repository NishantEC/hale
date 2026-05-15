import { FC } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { TapeEvent } from "@/utils/buildTodayTape"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  events: TapeEvent[]
  onEventPress?: (event: TapeEvent) => void
}

export const TodayCard: FC<Props> = ({ events, onEventPress }) => {
  const { colors } = LOCAL_THEME

  return (
    <View style={styles.wrap}>
      <Text
        text="TODAY"
        style={{
          color: colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.8,
          marginBottom: 10,
        }}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
        ]}
      >
        {events.length === 0 ? (
          <View style={{ paddingVertical: 14 }}>
            <Text
              text="No events yet."
              style={{ color: colors.textDim, fontSize: 13 }}
            />
            <Text
              text="Sleep, recovery and activity events will appear here as your day progresses."
              style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}
            />
          </View>
        ) : (
          events.map((event, i) => (
            <View key={event.id}>
              <Row
                event={event}
                onPress={onEventPress ? () => onEventPress(event) : undefined}
              />
              {i < events.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  )
}

const Row: FC<{ event: TapeEvent; onPress?: () => void }> = ({ event, onPress }) => {
  const { colors } = LOCAL_THEME
  const inner = (
    <View style={styles.row}>
      <Text
        text={event.time}
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "600",
          minWidth: 46,
          paddingTop: 3,
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={[styles.dot, { backgroundColor: event.dotColor }]} />
      <View style={styles.body}>
        <Text
          text={event.title}
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: "600",
            lineHeight: 20,
          }}
        />
        {event.desc ? (
          <Text
            text={event.desc}
            numberOfLines={2}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
        ) : null}
      </View>
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {inner}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
  } as ViewStyle,
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  } as ViewStyle,
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 10,
  } as ViewStyle,
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 7,
    flexShrink: 0,
  } as ViewStyle,
  body: {
    flex: 1,
    minWidth: 0,
  } as ViewStyle,
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  } as ViewStyle,
})
