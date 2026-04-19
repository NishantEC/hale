import { useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { useNavigation } from "@react-navigation/native"

import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { JOURNAL_FACTORS, FactorDefinition } from "@/constants/journalFactors"
import { createJournalEntry } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { insertJournalEntry } from "@/services/db/repositories/journalEntry"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const SCREEN_WIDTH = Dimensions.get("window").width
const TILE_WIDTH = (SCREEN_WIDTH - 40 - 24) / 3

export function JournalEntryScreen() {
  const navigation = useNavigation()
  const { themed, theme: { colors } } = useAppTheme()

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [value, setValue] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFactor = JOURNAL_FACTORS.find((f) => f.tag === selectedTag) ?? null

  function handleSelectFactor(factor: FactorDefinition) {
    if (selectedTag === factor.tag) return
    setSelectedTag(factor.tag)
    setValue(null)

    // Toggle factors auto-set value to 1 (just "yes")
    if (factor.input.kind === "toggle") {
      setValue(1)
    }
  }

  const canSave = !!selectedTag && value !== null && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const now = Date.now()
      const id = `journal-${now}-${Math.random().toString(36).slice(2, 8)}`
      const db = openDatabase()
      // Write local-first; drainer handles backend sync.
      await insertJournalEntry(db, {
        id,
        timestamp: now,
        factorTag: selectedTag!,
        intensity: value!,
        note: note.trim(),
        createdAt: now,
      })
      // Best-effort direct POST for immediate backend visibility.
      try {
        await createJournalEntry({
          factorTag: selectedTag!,
          intensity: value!,
          note: note.trim() || undefined,
        })
      } catch (postErr) {
        console.warn("[journal] direct POST failed — drainer will retry", postErr)
      }
      Toast.show(`${selectedFactor?.label ?? "Factor"} logged`, { type: "success", position: "top" })
      navigation.goBack()
    } catch (e: any) {
      setError(e.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={themed($container)}>
      <View style={$header}>
        <Text preset="bold" size="xl" style={{ color: colors.onSurface }}>
          Log Factor
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={$scrollView}
        contentContainerStyle={$scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Factor Grid */}
        <View style={$factorGrid}>
          {JOURNAL_FACTORS.map((factor) => {
            const isSelected = selectedTag === factor.tag
            return (
              <TouchableOpacity
                key={factor.tag}
                onPress={() => handleSelectFactor(factor)}
                style={[
                  themed($factorTile),
                  isSelected && {
                    borderWidth: 2,
                    borderColor: factor.color,
                    backgroundColor: colors.surfaceElevated,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Ionicons name={factor.icon} size={28} color={factor.color} />
                <Text size="xxs" weight="medium" style={{ color: colors.textDim }}>
                  {factor.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Per-factor input */}
        {selectedFactor && (
          <>
            <FactorInput factor={selectedFactor} value={value} onChange={setValue} />

            <TextInput
              style={themed($noteInput)}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
            />

            {error && (
              <Text size="xs" style={{ color: colors.error, marginTop: 8 }}>
                {error}
              </Text>
            )}

            <TouchableOpacity
              style={[
                $saveButton,
                {
                  backgroundColor: selectedFactor.color,
                  opacity: canSave ? 1 : 0.4,
                },
              ]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.8}
            >
              <Text size="md" weight="bold" style={{ color: colors.onSurface }}>
                {saving ? "Saving..." : `Log ${selectedFactor.label}`}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!selectedFactor && (
          <TouchableOpacity style={[$saveButton, themed($saveButtonDisabled)]} disabled>
            <Text size="md" weight="bold" style={{ color: colors.onSurface }}>
              Select a factor
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function FactorInput({
  factor,
  value,
  onChange,
}: {
  factor: FactorDefinition
  value: number | null
  onChange: (v: number) => void
}) {
  const { themed, theme: { colors } } = useAppTheme()
  const { input, color } = factor

  if (input.kind === "toggle") {
    return (
      <View style={$inputSection}>
        <View style={$toggleRow}>
          <Ionicons name="checkmark-circle" size={24} color={color} />
          <Text size="sm" weight="medium" style={{ color: colors.textDim }}>
            Will be logged
          </Text>
        </View>
      </View>
    )
  }

  if (input.kind === "quantity") {
    return (
      <View style={$inputSection}>
        <Text size="sm" weight="semiBold" style={{ color: colors.onSurface }}>
          How many {input.unit}?
        </Text>
        <View style={$quantityRow}>
          {Array.from({ length: input.max }, (_, i) => i + 1).map((n) => {
            const isSelected = value === n
            return (
              <TouchableOpacity
                key={n}
                onPress={() => onChange(n)}
                style={[
                  $quantityChip,
                  isSelected ? { backgroundColor: color } : themed($quantityChipUnselected),
                ]}
                activeOpacity={0.75}
              >
                <Text
                  size="sm"
                  weight="bold"
                  style={{ color: isSelected ? colors.onSurface : colors.textDim }}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  if (input.kind === "scale") {
    return (
      <View style={$inputSection}>
        <View style={$scaleRow}>
          {input.labels.map((label, i) => {
            const scaleValue = i + 1
            const isSelected = value === scaleValue
            return (
              <TouchableOpacity
                key={label}
                onPress={() => onChange(scaleValue)}
                style={[
                  $scaleChip,
                  isSelected
                    ? { backgroundColor: color }
                    : themed($scaleChipUnselected),
                ]}
                activeOpacity={0.75}
              >
                <Text
                  size="xs"
                  weight="bold"
                  style={{ color: isSelected ? colors.onSurface : colors.textDim }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  return null
}

// ── Themed styles (depend on theme colors) ──────────────────────────

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.screenBackground,
})

const $header: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: 20,
  paddingTop: 16,
}

const $scrollView: ViewStyle = {
  flex: 1,
}

const $scrollContent: ViewStyle = {
  paddingHorizontal: 20,
  paddingTop: 24,
  paddingBottom: 40,
}

const $factorGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 12,
}

const $factorTile: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: TILE_WIDTH,
  aspectRatio: 1,
  backgroundColor: colors.surfaceElevated,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $inputSection: ViewStyle = {
  marginTop: 28,
  gap: 14,
}

const $toggleRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $quantityRow: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 10,
}

const $quantityChip: ViewStyle = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
}

const $quantityChipUnselected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "transparent",
  borderWidth: 2,
  borderColor: colors.surfaceCardBorder,
})

const $scaleRow: ViewStyle = {
  flexDirection: "row",
  gap: 10,
}

const $scaleChip: ViewStyle = {
  flex: 1,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: "center",
}

const $scaleChipUnselected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
})

const $noteInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  marginTop: 24,
  backgroundColor: colors.surfaceSubtle,
  borderRadius: 14,
  padding: 14,
  color: colors.onSurface,
  fontSize: 15,
})

const $saveButton: ViewStyle = {
  marginTop: 28,
  borderRadius: 16,
  paddingVertical: 16,
  alignItems: "center",
}

const $saveButtonDisabled: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
  opacity: 0.4,
})
