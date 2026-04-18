import { useEffect, useState } from "react"
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"

import { Text } from "@/components/Text"
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import {
  fetchJournalEntries,
  deleteJournalEntry,
  JournalEntryResponse,
} from "@/services/api/noopClient"
import { useAppTheme } from "@/theme/context"
import { ThemedStyle } from "@/theme/types"

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function formatTime(ts: string) {
  const d = new Date(ts)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, "0")
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function JournalHistoryScreen() {
  const navigation = useNavigation()
  const { themed, theme: { colors } } = useAppTheme()
  const [entries, setEntries] = useState<JournalEntryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadEntries()
  }, [])

  async function loadEntries() {
    try {
      const res = await fetchJournalEntries(todayKey())
      setEntries(res.entries)
    } catch {}
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadEntries()
  }

  async function handleDelete(id: string) {
    Alert.alert("Delete Entry", "Remove this journal entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteJournalEntry(id)
            setEntries((prev) => prev.filter((e) => e.id !== id))
          } catch {}
        },
      },
    ])
  }

  function renderItem({ item }: { item: JournalEntryResponse }) {
    const factor = JOURNAL_FACTORS.find((f) => f.tag === item.factorTag)
    const iconName: keyof typeof Ionicons.glyphMap = factor?.icon ?? "ellipse-outline"
    const color = factor?.color ?? "#888888"
    const label = factor?.label ?? item.factorTag

    // Build contextual detail string
    let detail: string | null = null
    if (factor) {
      const { input } = factor
      if (input.kind === "quantity") {
        detail = `${item.intensity} ${input.unit}`
      } else if (input.kind === "scale") {
        detail = input.labels[item.intensity - 1] ?? null
      }
      // toggle: no detail needed
    }

    return (
      <View style={themed($entryRow)}>
        {/* Icon circle */}
        <View style={[themed($iconCircle), { backgroundColor: color + "20" }]}>
          <Ionicons name={iconName} size={18} color={color} />
        </View>

        {/* Middle */}
        <View style={themed($entryMiddle)}>
          <Text size="sm" weight="semiBold" style={themed($factorLabel)}>
            {label}
          </Text>
          <View style={themed($dotNoteRow)}>
            {detail && (
              <Text size="xxs" weight="medium" style={{ color }}>
                {detail}
              </Text>
            )}
            {!!item.note && (
              <Text
                size="xxs"
                style={themed($notePreview)}
                numberOfLines={1}
              >
                {item.note}
              </Text>
            )}
          </View>
        </View>

        {/* Right: time + delete */}
        <View style={themed($entryRight)}>
          <Text size="xxs" style={themed($timeText)}>
            {formatTime(item.timestamp)}
          </Text>
          <TouchableOpacity
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderEmpty() {
    return (
      <View style={themed($emptyContainer)}>
        <Ionicons name="journal-outline" size={48} color={colors.iconDim} />
        <Text size="md" weight="medium" style={themed($emptyTitle)}>
          No entries today
        </Text>
        <Text size="xs" style={themed($emptySubtitle)}>
          Tap + on the home screen to log a factor
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text size="xl" weight="bold" style={themed($headerTitle)}>
          Journal
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={themed($listContent)}
        ListEmptyComponent={loading ? null : renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textMuted}
          />
        }
      />
    </SafeAreaView>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.screenBackground,
})

const $header: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 12,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
})

const $listContent: ThemedStyle<ViewStyle> = () => ({
  paddingHorizontal: 20,
  paddingTop: 12,
  gap: 10,
})

const $entryRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surfaceElevated,
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 14,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
})

const $iconCircle: ThemedStyle<ViewStyle> = () => ({
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
})

const $entryMiddle: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 4,
})

const $factorLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.onSurface,
})

const $dotNoteRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
})

const $notePreview: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.textMuted,
})

const $entryRight: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
  gap: 6,
})

const $timeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $emptyContainer: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  paddingTop: 60,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginTop: 12,
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginTop: 4,
})
