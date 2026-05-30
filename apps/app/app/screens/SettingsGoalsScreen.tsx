import { FC, useState, useEffect } from "react"
import { ScrollView, TextInput, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { useServerPreferences } from "@/utils/useServerPreferences"

export const SettingsGoalsScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const { prefs, patch } = useServerPreferences()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={$navBar}>
        <Text
          text="Goals"
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.2,
          }}
          onPress={() => router.back()}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <Text
          text="Targets the dashboard scores against. Sleep target is also editable in the Sleep Planner."
          style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}
        />

        <SectionLabel>Sleep</SectionLabel>
        <Card>
          <NumericGoalRow
            label="Sleep target"
            unit="hours"
            value={Math.round((prefs.goals.sleepTargetMinutes / 60) * 10) / 10}
            min={5}
            max={12}
            step={0.25}
            onCommit={(hours) =>
              patch({ goals: { sleepTargetMinutes: Math.round(hours * 60) } })
            }
          />
        </Card>

        <SectionLabel>Strain</SectionLabel>
        <Card>
          <NumericGoalRow
            label="Daily strain target"
            unit="/ 21"
            value={prefs.goals.strainTargetDaily}
            min={4}
            max={21}
            step={1}
            onCommit={(strain) => patch({ goals: { strainTargetDaily: Math.round(strain) } })}
          />
        </Card>

        <SectionLabel>Movement</SectionLabel>
        <Card>
          <NumericGoalRow
            label="Active minutes / day"
            unit="min"
            value={prefs.goals.activeMinutesDaily}
            min={10}
            max={180}
            step={5}
            onCommit={(min) => patch({ goals: { activeMinutesDaily: Math.round(min) } })}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const SectionLabel: FC<{ children: string }> = ({ children }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={children.toUpperCase()}
      style={{
        color: colors.textDim,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        marginTop: 6,
        marginLeft: 4,
      }}
    />
  )
}

const Card: FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = LOCAL_THEME
  return <View style={[$card, { backgroundColor: colors.surfaceCard }]}>{children}</View>
}

const NumericGoalRow: FC<{
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (next: number) => void
}> = ({ label, unit, value, min, max, step, onCommit }) => {
  const { colors } = LOCAL_THEME
  const [raw, setRaw] = useState(String(value))

  useEffect(() => {
    setRaw(String(value))
  }, [value])

  const commit = () => {
    const n = parseFloat(raw)
    if (!Number.isFinite(n)) {
      setRaw(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n / step) * step))
    setRaw(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <View style={$row}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text text={label} style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} />
        <Text
          text={`Range ${min} – ${max} ${unit}`}
          style={{ color: colors.textDim, fontSize: 11, marginTop: 2 }}
        />
      </View>
      <View
        style={[
          $inputWrap,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceCardBorder },
        ]}
      >
        <TextInput
          value={raw}
          onChangeText={setRaw}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          style={[$input, { color: colors.text }]}
          selectTextOnFocus
        />
        <Text text={unit} style={{ color: colors.textMuted, fontSize: 11 }} />
      </View>
    </View>
  )
}

const $navBar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 16,
  paddingVertical: 12,
}

const $card: ViewStyle = {
  borderRadius: 14,
  paddingHorizontal: 16,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 14,
}

const $inputWrap: ViewStyle = {
  alignItems: "center",
  borderRadius: 10,
  borderWidth: 1,
  flexDirection: "row",
  gap: 4,
  paddingHorizontal: 10,
  paddingVertical: 6,
  minWidth: 90,
}

const $input = {
  fontSize: 16,
  fontWeight: "700" as const,
  minWidth: 50,
  textAlign: "right" as const,
}
