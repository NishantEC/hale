import { useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"

import { Text } from "@/components/Text"
import { JOURNAL_FACTORS, FactorDefinition } from "@/constants/journalFactors"
import { createJournalEntry } from "@/services/api/noopClient"

const SCREEN_WIDTH = Dimensions.get("window").width
const TILE_WIDTH = (SCREEN_WIDTH - 40 - 24) / 3

export function JournalEntryScreen() {
  const navigation = useNavigation()

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
      await createJournalEntry({
        factorTag: selectedTag!,
        intensity: value!,
        note: note.trim() || undefined,
      })
      navigation.goBack()
    } catch (e: any) {
      setError(e.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text preset="bold" size="xl" style={styles.white}>
          Log Factor
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Factor Grid */}
        <View style={styles.factorGrid}>
          {JOURNAL_FACTORS.map((factor) => {
            const isSelected = selectedTag === factor.tag
            return (
              <TouchableOpacity
                key={factor.tag}
                onPress={() => handleSelectFactor(factor)}
                style={[
                  styles.factorTile,
                  isSelected && {
                    borderWidth: 2,
                    borderColor: factor.color,
                    backgroundColor: "rgba(255,255,255,0.13)",
                  },
                ]}
                activeOpacity={0.75}
              >
                <Ionicons name={factor.icon} size={28} color={factor.color} />
                <Text size="xxs" weight="medium" style={styles.factorLabel}>
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
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={note}
              onChangeText={setNote}
            />

            {error && (
              <Text size="xs" style={styles.errorText}>
                {error}
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: selectedFactor.color,
                  opacity: canSave ? 1 : 0.4,
                },
              ]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.8}
            >
              <Text size="md" weight="bold" style={styles.white}>
                {saving ? "Saving..." : `Log ${selectedFactor.label}`}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!selectedFactor && (
          <TouchableOpacity style={[styles.saveButton, styles.saveButtonDisabled]} disabled>
            <Text size="md" weight="bold" style={styles.white}>
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
  const { input, color } = factor

  if (input.kind === "toggle") {
    return (
      <View style={styles.inputSection}>
        <View style={styles.toggleRow}>
          <Ionicons name="checkmark-circle" size={24} color={color} />
          <Text size="sm" weight="medium" style={styles.dimText}>
            Will be logged
          </Text>
        </View>
      </View>
    )
  }

  if (input.kind === "quantity") {
    return (
      <View style={styles.inputSection}>
        <Text size="sm" weight="semiBold" style={styles.white}>
          How many {input.unit}?
        </Text>
        <View style={styles.quantityRow}>
          {Array.from({ length: input.max }, (_, i) => i + 1).map((n) => {
            const isSelected = value === n
            return (
              <TouchableOpacity
                key={n}
                onPress={() => onChange(n)}
                style={[
                  styles.quantityChip,
                  isSelected ? { backgroundColor: color } : styles.quantityChipUnselected,
                ]}
                activeOpacity={0.75}
              >
                <Text
                  size="sm"
                  weight="bold"
                  style={{ color: isSelected ? "#fff" : "rgba(255,255,255,0.5)" }}
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
      <View style={styles.inputSection}>
        <View style={styles.scaleRow}>
          {input.labels.map((label, i) => {
            const scaleValue = i + 1
            const isSelected = value === scaleValue
            return (
              <TouchableOpacity
                key={label}
                onPress={() => onChange(scaleValue)}
                style={[
                  styles.scaleChip,
                  isSelected
                    ? { backgroundColor: color }
                    : styles.scaleChipUnselected,
                ]}
                activeOpacity={0.75}
              >
                <Text
                  size="xs"
                  weight="bold"
                  style={{ color: isSelected ? "#fff" : "rgba(255,255,255,0.55)" }}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06070A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  white: {
    color: "#fff",
  },
  dimText: {
    color: "rgba(255,255,255,0.5)",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  factorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  factorTile: {
    width: TILE_WIDTH,
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.085)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  factorLabel: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  inputSection: {
    marginTop: 28,
    gap: 14,
  },
  // Toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Quantity
  quantityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quantityChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityChipUnselected: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
  },
  // Scale
  scaleRow: {
    flexDirection: "row",
    gap: 10,
  },
  scaleChip: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  scaleChipUnselected: {
    backgroundColor: "rgba(255,255,255,0.085)",
  },
  noteInput: {
    marginTop: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
    fontSize: 15,
  },
  errorText: {
    color: "#F87171",
    marginTop: 8,
  },
  saveButton: {
    marginTop: 28,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
    opacity: 0.4,
  },
})
