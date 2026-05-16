import { FC, useState } from "react"
import { Pressable, StyleSheet, View, ViewStyle } from "react-native"

import {
  Check,
  Icon as PhosphorIcon,
  PencilSimple,
  X,
} from "phosphor-react-native"
import { Text } from "@/components/Text"
import { confirmActivity, dismissActivity, PendingActivityCard } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

type Props = {
  cards: PendingActivityCard[]
  onResolved?: () => void
}

const SUGGESTED_TYPES = [
  "Walking",
  "Running",
  "Cycling",
  "Strength",
  "HIIT",
  "Stair Climbing Up",
  "Hiking",
  "Light Activity",
]

export const PendingActivityCards: FC<Props> = ({ cards, onResolved }) => {
  if (cards.length === 0) return null
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
      {cards.map((card) => (
        <Card key={card.id} card={card} onResolved={onResolved} />
      ))}
    </View>
  )
}

const Card: FC<{ card: PendingActivityCard; onResolved?: () => void }> = ({
  card,
  onResolved,
}) => {
  const { colors } = LOCAL_THEME
  const [busy, setBusy] = useState(false)
  const [showReclassify, setShowReclassify] = useState(false)

  const startLabel = new Date(card.startTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  const handle = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      onResolved?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceCard, borderColor: colors.surfaceCardBorder },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text
            text={card.activityType}
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: "700",
            }}
          />
          <Text
            text={`${startLabel} · ${card.durationMinutes} min · HR ${card.heartRateAvg}`}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}
          />
        </View>
        <Text
          text={`${Math.round(card.confidence * 100)}%`}
          style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}
        />
      </View>
      <Text
        text="Is this what you were doing?"
        style={{ color: colors.textDim, fontSize: 13, marginTop: 10 }}
      />
      <View style={styles.actions}>
        <ActionButton
          label="Yes"
          icon={Check}
          variant="primary"
          disabled={busy}
          onPress={() => handle(() => confirmActivity(card.id))}
        />
        <ActionButton
          label="No, change"
          icon={PencilSimple}
          variant="ghost"
          disabled={busy}
          onPress={() => setShowReclassify((s) => !s)}
        />
        <ActionButton
          label="Dismiss"
          icon={X}
          variant="ghost"
          disabled={busy}
          onPress={() => handle(() => dismissActivity(card.id))}
        />
      </View>
      {showReclassify ? (
        <View style={styles.reclassifyRow}>
          {SUGGESTED_TYPES.filter((t) => t !== card.activityType).map((t) => (
            <Pressable
              key={t}
              disabled={busy}
              onPress={() => handle(() => confirmActivity(card.id, t))}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.divider,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text text={t} style={{ color: colors.text, fontSize: 12 }} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const ActionButton: FC<{
  label: string
  icon: PhosphorIcon
  variant: "primary" | "ghost"
  disabled?: boolean
  onPress: () => void
}> = ({ label, icon: Icon, variant, disabled, onPress }) => {
  const { colors } = LOCAL_THEME
  const bg = variant === "primary" ? colors.tint : "transparent"
  const fg = variant === "primary" ? colors.background : colors.text
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          opacity: pressed || disabled ? 0.65 : 1,
          borderColor: variant === "primary" ? "transparent" : colors.divider,
          borderWidth: variant === "primary" ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Icon size={14} color={fg} />
      <Text text={label} style={{ color: fg, fontSize: 13, fontWeight: "600" }} />
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
    padding: 14,
    marginBottom: 10,
  } as ViewStyle,
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  } as ViewStyle,
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  } as ViewStyle,
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  } as ViewStyle,
  reclassifyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  } as ViewStyle,
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
})
