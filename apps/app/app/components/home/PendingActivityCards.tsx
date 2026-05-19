import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { CandidateDeck, type CandidatePayload } from "@/components/activity"
import { confirmActivity, dismissActivity, PendingActivityCard } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  cards: PendingActivityCard[]
  onResolved?: () => void
}

function toPayload(card: PendingActivityCard): CandidatePayload {
  return {
    id: card.id,
    startTime: new Date(card.startTime),
    endTime: new Date(card.endTime ?? card.startTime),
    durationMinutes: card.durationMinutes,
    heartRateAvg: card.heartRateAvg,
    heartRateMax: card.heartRateMax ?? card.heartRateAvg,
    confidence: card.confidence,
    suggestedType: card.activityType,
    hrSparkline: card.hrSparkline,
  }
}

export const PendingActivityCards: FC<Props> = ({ cards, onResolved }) => {
  if (cards.length === 0) return null
  const payloads = cards.map(toPayload)
  return (
    <View style={styles.wrap}>
      <Text
        text="NEW ACTIVITY"
        style={{
          color: LOCAL_THEME.colors.textDim,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.8,
          marginBottom: 10,
        }}
      />
      <CandidateDeck
        cards={payloads}
        onConfirm={async (id, finalType) => {
          await confirmActivity(id, finalType)
          onResolved?.()
        }}
        onDismiss={async (id) => {
          await dismissActivity(id)
          onResolved?.()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 } as ViewStyle,
})
