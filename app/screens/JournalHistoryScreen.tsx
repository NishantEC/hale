import { useEffect, useState } from "react"
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
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

const BACKGROUND = "#06070A"
const CARD_BG = "rgba(255,255,255,0.085)"

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
      <View style={styles.entryRow}>
        {/* Icon circle */}
        <View style={[styles.iconCircle, { backgroundColor: color + "20" }]}>
          <Ionicons name={iconName} size={18} color={color} />
        </View>

        {/* Middle */}
        <View style={styles.entryMiddle}>
          <Text size="sm" weight="semiBold" style={styles.factorLabel}>
            {label}
          </Text>
          <View style={styles.dotNoteRow}>
            {detail && (
              <Text size="xxs" weight="medium" style={{ color }}>
                {detail}
              </Text>
            )}
            {!!item.note && (
              <Text
                size="xxs"
                style={styles.notePreview}
                numberOfLines={1}
              >
                {item.note}
              </Text>
            )}
          </View>
        </View>

        {/* Right: time + delete */}
        <View style={styles.entryRight}>
          <Text size="xxs" style={styles.timeText}>
            {formatTime(item.timestamp)}
          </Text>
          <TouchableOpacity
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderEmpty() {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="journal-outline" size={48} color="rgba(255,255,255,0.15)" />
        <Text size="md" weight="medium" style={styles.emptyTitle}>
          No entries today
        </Text>
        <Text size="xs" style={styles.emptySubtitle}>
          Tap + on the home screen to log a factor
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text size="xl" weight="bold" style={styles.headerTitle}>
          Journal
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? null : renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="rgba(255,255,255,0.4)"
          />
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  } as ViewStyle,
  headerTitle: {
    color: "#ffffff",
  } as TextStyle,
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  entryRow: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } as ViewStyle,
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  entryMiddle: {
    flex: 1,
    gap: 4,
  } as ViewStyle,
  factorLabel: {
    color: "#ffffff",
  } as TextStyle,
  dotNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  } as ViewStyle,
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  } as ViewStyle,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  } as ViewStyle,
  dotFilled: {} as ViewStyle,
  dotEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
  } as ViewStyle,
  notePreview: {
    flex: 1,
    color: "rgba(255,255,255,0.4)",
  } as TextStyle,
  entryRight: {
    alignItems: "flex-end",
    gap: 6,
  } as ViewStyle,
  timeText: {
    color: "rgba(255,255,255,0.4)",
  } as TextStyle,
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  } as ViewStyle,
  emptyTitle: {
    color: "rgba(255,255,255,0.4)",
    marginTop: 12,
  } as TextStyle,
  emptySubtitle: {
    color: "rgba(255,255,255,0.25)",
    marginTop: 4,
  } as TextStyle,
})
