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
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import { createJournalEntry } from "@/services/api/noopClient"

const SCREEN_WIDTH = Dimensions.get("window").width
const TILE_WIDTH = (SCREEN_WIDTH - 40 - 24) / 3

export function JournalEntryScreen() {
  const navigation = useNavigation()

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [intensity, setIntensity] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFactor = JOURNAL_FACTORS.find((f) => f.tag === selectedTag) ?? null

  function handleSelectFactor(tag: string) {
    setSelectedTag(tag)
    setIntensity(null)
  }

  async function handleSave() {
    if (!selectedTag || !intensity) return
    setSaving(true)
    setError(null)
    try {
      await createJournalEntry({ factorTag: selectedTag, intensity, note: note.trim() || undefined })
      navigation.goBack()
    } catch (e: any) {
      setError(e.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!selectedTag && !!intensity && !saving

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text preset="bold" size="xl" style={styles.headerTitle}>
          Log Factor
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                onPress={() => handleSelectFactor(factor.tag)}
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
                <Text
                  preset="default"
                  size="xxs"
                  weight="medium"
                  style={styles.factorLabel}
                >
                  {factor.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Intensity section — only visible when a factor is selected */}
        {selectedFactor && (
          <>
            <View style={styles.intensitySection}>
              <Text preset="default" size="md" weight="semiBold" style={styles.intensityTitle}>
                Intensity
              </Text>
              <View style={styles.intensityRow}>
                {[1, 2, 3, 4, 5].map((i) => {
                  const isSelectedIntensity = intensity === i
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setIntensity(i)}
                      style={[
                        styles.intensityCircle,
                        isSelectedIntensity
                          ? { backgroundColor: selectedFactor.color, borderWidth: 0 }
                          : styles.intensityCircleUnselected,
                      ]}
                      activeOpacity={0.75}
                    >
                      <Text
                        preset="default"
                        size="sm"
                        weight="bold"
                        style={{
                          color: isSelectedIntensity ? "#fff" : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {i.toString()}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Note input */}
            <TextInput
              style={styles.noteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />

            {/* Error message */}
            {error && (
              <Text preset="default" size="xs" style={styles.errorText}>
                {error}
              </Text>
            )}

            {/* Save button */}
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
              <Text preset="default" size="md" weight="bold" style={styles.saveButtonText}>
                {saving ? "Saving..." : `Log ${selectedFactor.label}`}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Save button (no factor selected) */}
        {!selectedFactor && (
          <TouchableOpacity
            style={[styles.saveButton, styles.saveButtonNoFactor]}
            disabled
            activeOpacity={0.8}
          >
            <Text preset="default" size="md" weight="bold" style={styles.saveButtonText}>
              Select a factor
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  )
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
  headerTitle: {
    color: "#fff",
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
  intensitySection: {
    marginTop: 28,
  },
  intensityTitle: {
    color: "#fff",
    marginBottom: 12,
  },
  intensityRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  intensityCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  intensityCircleUnselected: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  noteInput: {
    marginTop: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
    fontSize: 15,
    textAlignVertical: "top",
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
  saveButtonNoFactor: {
    backgroundColor: "rgba(255,255,255,0.1)",
    opacity: 0.4,
  },
  saveButtonText: {
    color: "#fff",
  },
})
