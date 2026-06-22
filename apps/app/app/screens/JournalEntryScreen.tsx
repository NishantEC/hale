import { useEffect, useMemo, useState } from "react"
import { CheckCircle, X } from "phosphor-react-native"
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"

import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import {
  JOURNAL_FACTORS,
  type FactorCategory,
  type FactorDefinition,
} from "@/constants/journalFactors"
import { type JournalEntryResponse } from "@/services/api/viewModels"
import { openDatabase } from "@/services/db"
import {
  insertJournalEntry,
  listJournalEntriesByDate,
} from "@/services/db/repositories/journalEntry"
import { LOCAL_THEME } from "@/utils/localTheme"
import { hexWithAlpha } from "@/utils/hexWithAlpha"

// Master-plan §4.9 category ordering — substances + activity first because
// those have the strongest sleep / recovery correlations in the lit. Health
// + context land lower because users log them less often.
const CATEGORY_ORDER: FactorCategory[] = [
  "Substances",
  "Food & Drink",
  "Activity",
  "Wellness",
  "Sleep",
  "Circadian",
  "Health",
  "Social",
  "Context",
]

const SCREEN_WIDTH = Dimensions.get("window").width
const TILE_WIDTH = (SCREEN_WIDTH - 40 - 24) / 3

export function JournalEntryScreen() {
  const navigation = useNavigation()
  const { colors } = LOCAL_THEME

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [value, setValue] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [todayEntries, setTodayEntries] = useState<JournalEntryResponse[]>([])

  const selectedFactor = JOURNAL_FACTORS.find((f) => f.tag === selectedTag) ?? null

  const grouped = useMemo(() => {
    const map = new Map<FactorCategory, FactorDefinition[]>()
    for (const factor of JOURNAL_FACTORS) {
      const list = map.get(factor.category) ?? []
      list.push(factor)
      map.set(factor.category, list)
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const items = map.get(cat)
      return items && items.length > 0 ? [{ category: cat, items }] : []
    })
  }, [])

  // Show what the user already logged today so they don't double-log the
  // same factor. Fetch is best-effort — failure just means we render an
  // empty "Today's entries" slot.
  useEffect(() => {
    let cancelled = false
    const todayIso = new Date().toISOString().slice(0, 10)
    listJournalEntriesByDate(openDatabase(), todayIso)
      .then((rows) => {
        if (cancelled) return
        setTodayEntries(
          rows.map((r) => ({
            id: r.id,
            factorTag: r.factorTag,
            intensity: r.intensity,
            note: r.note,
            timestamp: new Date(r.timestamp).toISOString(),
            createdAt: new Date(r.createdAt).toISOString(),
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setTodayEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSelectFactor(factor: FactorDefinition) {
    if (selectedTag === factor.tag) return
    setSelectedTag(factor.tag)
    setValue(null)
    if (factor.input.kind === "toggle") setValue(1)
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
      await insertJournalEntry(db, {
        id,
        timestamp: now,
        factorTag: selectedTag!,
        intensity: value!,
        note: note.trim(),
        createdAt: now,
      })
      Toast.show(`${selectedFactor?.label ?? "Factor"} logged`, {
        type: "success",
        position: "top",
      })
      navigation.goBack()
    } catch (e: any) {
      setError(e.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const loggedTags = useMemo(
    () => new Set(todayEntries.map((e) => e.factorTag)),
    [todayEntries],
  )

  return (
    <SafeAreaView
      style={[$container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <View style={$header}>
        <Text
          text="Log a factor"
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "700",
            letterSpacing: -0.3,
          }}
        />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={22} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={$scrollView}
        contentContainerStyle={$scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {todayEntries.length > 0 ? (
          <View
            style={[$todayCard, { backgroundColor: colors.surfaceCard }]}
          >
            <Text
              text={`LOGGED TODAY · ${todayEntries.length}`}
              style={{
                color: colors.textDim,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                marginBottom: 8,
              }}
            />
            <View style={$todayChips}>
              {todayEntries.map((entry) => {
                const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
                const label = factor?.label ?? entry.factorTag
                const color = factor?.color ?? colors.tint
                return (
                  <View
                    key={entry.id}
                    style={[
                      $chip,
                      {
                        backgroundColor: hexWithAlpha(color, 0.18),
                        borderColor: hexWithAlpha(color, 0.35),
                      },
                    ]}
                  >
                    <Text
                      text={label}
                      style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}
                    />
                  </View>
                )
              })}
            </View>
          </View>
        ) : null}

        {grouped.map(({ category, items }) => (
          <View key={category} style={{ marginTop: 18 }}>
            <Text
              text={category.toUpperCase()}
              style={{
                color: colors.textDim,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                marginBottom: 10,
                marginLeft: 2,
              }}
            />
            <View style={$factorGrid}>
              {items.map((factor) => {
                const isSelected = selectedTag === factor.tag
                const alreadyLogged = loggedTags.has(factor.tag)
                return (
                  <TouchableOpacity
                    key={factor.tag}
                    onPress={() => handleSelectFactor(factor)}
                    style={[
                      $factorTile,
                      {
                        backgroundColor: colors.surfaceCard,
                        borderColor: isSelected
                          ? factor.color
                          : alreadyLogged
                            ? hexWithAlpha(factor.color, 0.4)
                            : "transparent",
                        borderWidth: isSelected ? 2 : alreadyLogged ? 1 : 0,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <factor.icon size={24} color={factor.color} />
                    <Text
                      text={factor.label}
                      style={{
                        color: colors.text,
                        fontSize: 11,
                        fontWeight: "600",
                        marginTop: 6,
                        textAlign: "center",
                      }}
                      numberOfLines={2}
                    />
                    {alreadyLogged ? (
                      <View
                        style={[
                          $loggedBadge,
                          { backgroundColor: factor.color },
                        ]}
                      >
                        <CheckCircle size={10} color={colors.background} weight="fill" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}

        {selectedFactor ? (
          <View style={$selectedSection}>
            <View
              style={[
                $selectedBadge,
                {
                  backgroundColor: hexWithAlpha(selectedFactor.color, 0.18),
                  borderColor: hexWithAlpha(selectedFactor.color, 0.4),
                },
              ]}
            >
              <selectedFactor.icon size={16} color={selectedFactor.color} />
              <Text
                text={selectedFactor.label}
                style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
              />
            </View>

            <FactorInput factor={selectedFactor} value={value} onChange={setValue} />

            <TextInput
              style={[
                $noteInput,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.text,
                },
              ]}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
            />

            {error ? (
              <Text
                text={error}
                style={{ color: colors.error, fontSize: 12, marginTop: 8 }}
              />
            ) : null}

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
              activeOpacity={0.85}
            >
              <Text
                text={saving ? "Saving…" : `Log ${selectedFactor.label}`}
                style={{ color: colors.background, fontSize: 15, fontWeight: "700" }}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              $emptyHint,
              { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceSubtle },
            ]}
          >
            <Text
              text="Tap a factor above to log it"
              style={{ color: colors.textMuted, fontSize: 13 }}
            />
          </View>
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
  const { colors } = LOCAL_THEME
  const { input, color } = factor

  if (input.kind === "toggle") {
    return (
      <View style={$inputSection}>
        <View style={$toggleRow}>
          <CheckCircle size={20} color={color} weight="fill" />
          <Text
            text="Will be logged"
            style={{ color: colors.textDim, fontSize: 13, fontWeight: "600" }}
          />
        </View>
      </View>
    )
  }

  if (input.kind === "quantity") {
    return (
      <View style={$inputSection}>
        <Text
          text={`How many ${input.unit}?`}
          style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
        />
        <View style={$quantityRow}>
          {Array.from({ length: input.max }, (_, i) => i + 1).map((n) => {
            const isSelected = value === n
            return (
              <TouchableOpacity
                key={n}
                onPress={() => onChange(n)}
                style={[
                  $quantityChip,
                  isSelected
                    ? { backgroundColor: color }
                    : {
                        backgroundColor: colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: colors.surfaceCardBorder,
                      },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  text={`${n}`}
                  style={{
                    color: isSelected ? colors.background : colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                />
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
                    : {
                        backgroundColor: colors.surfaceElevated,
                      },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  text={label}
                  style={{
                    color: isSelected ? colors.background : colors.textDim,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  return null
}

const $container: ViewStyle = { flex: 1 }

const $header: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: 20,
  paddingTop: 12,
  paddingBottom: 4,
}

const $scrollView: ViewStyle = { flex: 1 }

const $scrollContent: ViewStyle = {
  paddingHorizontal: 20,
  paddingBottom: 40,
}

const $todayCard: ViewStyle = {
  borderRadius: 14,
  marginTop: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
}

const $todayChips: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 6,
}

const $chip: ViewStyle = {
  borderRadius: 999,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: 10,
  paddingVertical: 5,
}

const $factorGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
}

const $factorTile: ViewStyle = {
  width: TILE_WIDTH,
  aspectRatio: 1,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 6,
  position: "relative",
}

const $loggedBadge: ViewStyle = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 16,
  height: 16,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
}

const $selectedSection: ViewStyle = { marginTop: 24, gap: 10 }

const $selectedBadge: ViewStyle = {
  alignSelf: "flex-start",
  alignItems: "center",
  flexDirection: "row",
  gap: 8,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: 1,
}

const $inputSection: ViewStyle = { gap: 12 }

const $toggleRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
}

const $quantityRow: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
}

const $quantityChip: ViewStyle = {
  width: 42,
  height: 42,
  borderRadius: 21,
  alignItems: "center",
  justifyContent: "center",
}

const $scaleRow: ViewStyle = {
  flexDirection: "row",
  gap: 8,
}

const $scaleChip: ViewStyle = {
  flex: 1,
  borderRadius: 12,
  paddingVertical: 12,
  alignItems: "center",
}

const $noteInput: TextStyle = {
  borderRadius: 12,
  padding: 14,
  fontSize: 14,
  marginTop: 4,
}

const $saveButton: ViewStyle = {
  marginTop: 8,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: "center",
}

const $emptyHint: ViewStyle = {
  alignItems: "center",
  borderRadius: 14,
  borderStyle: "dashed",
  borderWidth: 1,
  marginTop: 24,
  paddingVertical: 22,
}
