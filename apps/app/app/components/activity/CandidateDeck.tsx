import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { CandidateCard, type CandidatePayload } from "./CandidateCard"

type Props = {
  cards: CandidatePayload[]
  onConfirm: (id: string, finalType: string) => Promise<unknown> | void
  onDismiss: (id: string) => Promise<unknown> | void
}

export const CandidateDeck: FC<Props> = ({ cards, onConfirm, onDismiss }) => {
  const colors = LOCAL_THEME.colors
  if (cards.length === 0) return null

  if (cards.length === 1) {
    return <CandidateCard card={cards[0]} onConfirm={onConfirm} onDismiss={onDismiss} />
  }

  const total = cards.length
  const top = cards[0]

  return (
    <View style={styles.wrap}>
      <Text
        text={`1 of ${total} — confirm to see next`}
        style={{
          color: colors.textMuted,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.2,
          textAlign: "center",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      />
      <CandidateCard card={top} onConfirm={onConfirm} onDismiss={onDismiss} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 8 } as ViewStyle,
})
