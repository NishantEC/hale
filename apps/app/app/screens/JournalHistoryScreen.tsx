import { FC, useEffect, useRef, useState } from "react"
import {
  Alert,
  RefreshControl,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import {
  BookOpen,
  CircleIcon,
  Icon as PhosphorIcon,
  Plus,
  Trash,
} from "phosphor-react-native"
import { router } from "expo-router"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { InlineLineChart } from "@/components/InlineLineChart"
import { LabsAccordion } from "@/components/LabsAccordion"
import { MetricHero } from "@/components/MetricHero"
import { ScreenHeader, SCREEN_HEADER_HEIGHT } from "@/components/ScreenHeader"
import { Text } from "@/components/Text"
import { Toast } from "@/components/reactx/toast"
import { TrendSparkline } from "@/components/TrendSparkline"
import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import { useDashboard } from "@/context/DashboardContext"
import {
  deleteJournalEntry as deleteJournalEntryRemote,
  fetchJournalEntries,
  type JournalEntryResponse,
} from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import {
  deleteJournalEntry,
  listJournalEntriesByDate,
} from "@/services/db/repositories/journalEntry"
import { LOCAL_THEME, themed, type ThemedStyle } from "@/utils/localTheme"

const JOURNAL_TINT = "#C76542"

function formatTime(ts: string) {
  const d = new Date(ts)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, "0")
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${m} ${ampm}`
}

function entryDetail(item: JournalEntryResponse): string | null {
  const factor = JOURNAL_FACTORS.find((f) => f.tag === item.factorTag)
  if (!factor) return null
  if (factor.input.kind === "quantity") {
    const unit = item.intensity === 1 ? factor.input.unit.replace(/s$/, "") : factor.input.unit
    return `${item.intensity} ${unit}`
  }
  if (factor.input.kind === "scale") {
    return factor.input.labels[item.intensity - 1] ?? null
  }
  return null
}

export const JournalHistoryScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { error, clearError, selectedDate, setSelectedDate } = useDashboard()
  const [entries, setEntries] = useState<JournalEntryResponse[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [weekCounts, setWeekCounts] = useState<{ date: string; value: number }[]>([])

  const lastShownError = useRef<string | null>(null)
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })
  const scrollTopPadding = insets.top + SCREEN_HEADER_HEIGHT + 8

  useEffect(() => {
    if (error && error !== lastShownError.current) {
      lastShownError.current = error
      Toast.show(error, { type: "error", position: "top", duration: 4000 })
      clearError()
    } else if (!error) {
      lastShownError.current = null
    }
  }, [error, clearError])

  useEffect(() => {
    loadEntries(selectedDate)
    loadWeekCounts(selectedDate)
  }, [selectedDate])

  async function loadEntries(date: string) {
    try {
      const db = openDatabase()
      const locals = await listJournalEntriesByDate(db, date)
      if (locals.length > 0) {
        setEntries(
          locals.map((r) => ({
            id: r.id,
            factorTag: r.factorTag,
            intensity: r.intensity,
            note: r.note,
            timestamp: new Date(r.timestamp).toISOString(),
            createdAt: new Date(r.createdAt).toISOString(),
          })),
        )
      }
    } catch (err) {
      console.warn("[journal] local read failed", err)
    }

    try {
      const res = await fetchJournalEntries(date)
      setEntries(res.entries)
    } catch {}
    finally {
      setRefreshing(false)
    }
  }

  async function loadWeekCounts(centerDate: string) {
    const [y, m, d] = centerDate.split("-").map(Number)
    const anchor = new Date(y, m - 1, d, 12)
    const dates: string[] = []
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date(anchor)
      date.setDate(anchor.getDate() - offset)
      dates.push(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      )
    }
    try {
      const results = await Promise.all(
        dates.map(async (date) => {
          try {
            const res = await fetchJournalEntries(date)
            return { date, value: res.entries.length }
          } catch {
            return { date, value: 0 }
          }
        }),
      )
      setWeekCounts(results)
    } catch {
      setWeekCounts(dates.map((date) => ({ date, value: 0 })))
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await Promise.all([loadEntries(selectedDate), loadWeekCounts(selectedDate)])
  }

  async function handleDelete(id: string) {
    Alert.alert("Delete Entry", "Remove this journal entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const db = openDatabase()
            await deleteJournalEntry(db, id)
            setEntries((prev) => prev.filter((e) => e.id !== id))
            try {
              await deleteJournalEntryRemote(id)
            } catch (postErr) {
              console.warn("[journal] remote delete failed — drainer will retry", postErr)
            }
          } catch {}
        },
      },
    ])
  }

  const chartWidth = width - 48

  const formattedDate = (() => {
    const [year, month, day] = selectedDate.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(year, month - 1, day, 12))
  })()

  const topFactor = (() => {
    if (entries.length === 0) return null
    const counts: Record<string, number> = {}
    for (const e of entries) counts[e.factorTag] = (counts[e.factorTag] ?? 0) + 1
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return JOURNAL_FACTORS.find((f) => f.tag === top[0])
  })()

  const weekAverage = (() => {
    if (weekCounts.length === 0) return null
    const total = weekCounts.reduce((sum, p) => sum + p.value, 0)
    return Math.round((total / weekCounts.length) * 10) / 10
  })()

  const deltaVsWeek = (() => {
    if (weekAverage == null) return null
    return Math.round((entries.length - weekAverage) * 10) / 10
  })()

  const sevenDayPoints = weekCounts.map((p) => ({ date: p.date, value: p.value }))
  const lineChartPoints = weekCounts.map((p) => ({
    timestamp: `${p.date}T12:00:00Z`,
    value: p.value,
  }))

  const labsRows = [
    {
      label: "Top factor",
      value: topFactor ? topFactor.label : "—",
    },
    {
      label: "Entries this week",
      value: String(weekCounts.reduce((sum, p) => sum + p.value, 0)),
    },
    {
      label: "Daily average",
      value: weekAverage != null ? `${weekAverage}` : "—",
    },
    {
      label: "Active days",
      value: `${weekCounts.filter((p) => p.value > 0).length} / 7`,
    },
  ]

  const addRightAction = (
    <TouchableOpacity
      onPress={() => router.push("/journal-entry" as any)}
      hitSlop={12}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Plus size={20} color={colors.text} />
      <Text text="Log" size="xs" style={{ color: colors.text }} />
    </TouchableOpacity>
  )

  return (
    <View style={themed($screenWrap)}>
      <ScreenHeader
        title="Journal"
        subtitle={formattedDate}
        rightAction={addRightAction}
        scrollY={scrollY}
      />
      <Animated.ScrollView
        contentContainerStyle={[themed($container), { paddingTop: scrollTopPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <MetricHero
          value={String(entries.length)}
          valueDetail={entries.length === 1 ? "entry today" : "entries today"}
          badge={
            topFactor
              ? { label: topFactor.label, tint: topFactor.color }
              : { label: "No entries", tint: colors.textMuted }
          }
          delta={deltaVsWeek}
          deltaUnit=""
          detail="Factors you log help correlate sleep, strain, and recovery with daily inputs."
        />

        {lineChartPoints.some((p) => p.value > 0) ? (
          <View style={{ padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
            <Text
              text="Entries · 7-day"
              size="xxs"
              style={{ color: colors.textDim, letterSpacing: 0.6, marginBottom: 8 }}
            />
            <InlineLineChart
              points={lineChartPoints}
              width={chartWidth - 28}
              height={100}
              stroke={JOURNAL_TINT}
            />
          </View>
        ) : null}

        <View>
          <Text
            text="Today's entries"
            size="xs"
            style={{ color: colors.textDim, letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 }}
          />
          {entries.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                padding: 28,
                backgroundColor: colors.surfaceCard,
                borderRadius: 12,
              }}
            >
              <BookOpen size={32} color={colors.iconDim} />
              <Text
                text="Nothing logged yet today."
                size="sm"
                style={{ color: colors.textDim, marginTop: 10 }}
              />
              <Text
                text="Tap Log in the header to add one."
                size="xxs"
                style={{ color: colors.textMuted, marginTop: 2 }}
              />
            </View>
          ) : (
            <View
              style={{
                backgroundColor: colors.surfaceCard,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {entries.map((entry, i) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === entries.length - 1}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ padding: 14, backgroundColor: colors.surfaceCard, borderRadius: 12 }}>
          <TrendSparkline
            label="Entries · 7-day"
            points={sevenDayPoints}
            currentDate={selectedDate}
            color={JOURNAL_TINT}
            onPressPoint={(d) => setSelectedDate(d)}
          />
        </View>

        <LabsAccordion rows={labsRows} />
      </Animated.ScrollView>
    </View>
  )
}

function EntryRow({
  entry,
  isLast,
  onDelete,
}: {
  entry: JournalEntryResponse
  isLast: boolean
  onDelete: (id: string) => void
}) {
  const colors = LOCAL_THEME.colors
  const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
  const Icon: PhosphorIcon = factor?.icon ?? CircleIcon
  const color = factor?.color ?? colors.tint
  const label = factor?.label ?? entry.factorTag
  const detail = entryDetail(entry)

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.surfaceCardBorder,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${color}1F`,
        }}
      >
        <Icon size={18} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text text={label} size="sm" weight="semiBold" style={{ color: colors.text }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {detail ? (
            <Text text={detail} size="xxs" style={{ color }} />
          ) : null}
          {entry.note ? (
            <Text
              text={entry.note}
              size="xxs"
              numberOfLines={1}
              style={{ color: colors.textDim, flex: 1 }}
            />
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text text={formatTime(entry.timestamp)} size="xxs" style={{ color: colors.textMuted }} />
        <TouchableOpacity onPress={() => onDelete(entry.id)} hitSlop={8}>
          <Trash size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const $screenWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.screenBackground,
  flex: 1,
})

const $container: ThemedStyle<ViewStyle> = () => ({
  gap: 24,
  paddingBottom: 60,
  paddingHorizontal: 24,
  paddingTop: 12,
})
