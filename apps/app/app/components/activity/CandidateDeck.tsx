import { FC } from "react"
import { StyleSheet, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { CandidateCard, type CandidatePayload } from "./CandidateCard"
import { visualForType } from "./bout-icons"

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

  const candidateTint = visualForType("Candidate").tintHex
  const total = cards.length
  const top = cards[0]
  const hasTwoBehind = cards.length >= 3

  return (
    <View style={styles.wrap}>
      <Text
        text={`1 of ${total} — swipe up for next`}
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

      <View style={styles.stack}>
        <View style={[styles.counterPill, { backgroundColor: candidateTint }]}>
          <Text
            text={String(total)}
            style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}
          />
        </View>

        {hasTwoBehind ? (
          <View
            style={[
              styles.behind2,
              { backgroundColor: colors.surfaceCard, borderColor: candidateTint },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.behind1,
            { backgroundColor: colors.surfaceCard, borderColor: candidateTint },
          ]}
        />
        <CandidateCard card={top} onConfirm={onConfirm} onDismiss={onDismiss} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 8 } as ViewStyle,
  stack: { position: "relative" } as ViewStyle,
  counterPill: {
    position: "absolute",
    top: -8,
    right: 24,
    zIndex: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  behind1: {
    position: "absolute",
    left: 24,
    right: 24,
    top: -4,
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
    zIndex: 2,
  } as ViewStyle,
  behind2: {
    position: "absolute",
    left: 32,
    right: 32,
    top: -8,
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    opacity: 0.45,
    transform: [{ scale: 0.92 }],
    zIndex: 1,
  } as ViewStyle,
})
