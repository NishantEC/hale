import { FC, useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { ArrowClockwise, Export as ExportIcon } from "phosphor-react-native"
import * as Sharing from "expo-sharing"
import { sql } from "drizzle-orm"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { getDatabaseFilePath, openDatabase } from "@/services/db"
import { createObservable } from "@/services/db/observable"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

type TableRow = { name: string; count: number }
type RecentRow = { timestamp: number; syncedAt: number | null }

const TABLES = [
  "raw_sensor_records",
  "outbound_queue",
  "realtime_samples",
  "device_events",
  "sleep_detections",
  "sleep_stages",
  "night_features",
  "daily_scores",
  "daily_metrics",
  "journal_entries",
]

function formatIstHms(ms: number): string {
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000)
  return `${ist.toISOString().slice(5, 10).replace("-", "/")} ${ist.toISOString().slice(11, 19)}`
}

export const DbSnapshotCard: FC = () => {
  const { colors } = LOCAL_THEME
  const [tables, setTables] = useState<TableRow[]>([])
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const db = openDatabase()
      const counts: TableRow[] = []
      for (const t of TABLES) {
        try {
          const r = (await db.all(
            sql.raw(`SELECT COUNT(*) AS c FROM "${t}"`),
          )) as Array<{ c: number }>
          counts.push({ name: t, count: Number(r[0]?.c ?? 0) })
        } catch {
          counts.push({ name: t, count: -1 })
        }
      }
      setTables(counts)
      const recentRows = (await db.all(
        sql.raw(
          `SELECT timestamp, _syncedAt as syncedAt FROM raw_sensor_records ORDER BY timestamp DESC LIMIT 5`,
        ),
      )) as Array<{ timestamp: number; syncedAt: number | null }>
      setRecent(recentRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Live-refresh while sync is writing. Without this the card silently
    // stays at "0 rows" through a 4-pass sync because the user has no
    // signal to know they should tap the refresh icon. Coalesce bursts
    // (one notify per batch) into a single refresh on the trailing edge.
    let pending: ReturnType<typeof setTimeout> | null = null
    const queueRefresh = () => {
      if (pending !== null) return
      pending = setTimeout(() => {
        pending = null
        void refresh()
      }, 600)
    }
    const unsubs = TABLES.map((t) => createObservable(t, queueRefresh))
    return () => {
      if (pending !== null) clearTimeout(pending)
      unsubs.forEach((u) => u())
    }
  }, [refresh])

  const onExport = useCallback(async () => {
    setExporting(true)
    try {
      openDatabase()
      const path = getDatabaseFilePath()
      if (!path) throw new Error("Database not opened")
      const available = await Sharing.isAvailableAsync()
      if (!available) throw new Error("Sharing unavailable on this device")
      await Sharing.shareAsync(`file://${path}`, {
        UTI: "public.database",
        mimeType: "application/x-sqlite3",
        dialogTitle: "Export noop.db",
      })
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }, [])

  const total = tables.reduce((s, t) => s + (t.count > 0 ? t.count : 0), 0)
  const queueDepth = tables.find((t) => t.name === "outbound_queue")?.count ?? 0
  const pillTone = error ? "bad" : queueDepth > 100 ? "warn" : "ok"
  const pillText = error ? "error" : `${total.toLocaleString()} rows`

  return (
    <InspectorCard
      title="DB Snapshot"
      pill={<StatusPill tone={pillTone} text={pillText} />}
      defaultExpanded
    >
      <View style={$headRow}>
        <Text
          text="On-device SQLite. Tap Export to share noop.db."
          size="xxs"
          style={{ color: colors.textDim, flex: 1 }}
        />
        <TouchableOpacity onPress={() => void refresh()} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <ArrowClockwise size={16} color={colors.text} weight="regular" />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onExport()} disabled={exporting}>
          {exporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <ExportIcon size={16} color={colors.text} weight="regular" />
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <Text text={error} size="xxs" style={{ color: "#fca5a5", marginTop: 6 }} />
      ) : null}

      <View style={{ marginTop: 6 }}>
        {tables.map((t) => (
          <View
            key={t.name}
            style={[$tableRow, { borderTopColor: colors.divider }]}
          >
            <Text
              text={t.name}
              size="xxs"
              style={{
                color: colors.textDim,
                fontFamily: "Menlo",
                flex: 1,
              }}
            />
            <Text
              text={t.count < 0 ? "—" : t.count.toLocaleString()}
              size="xxs"
              weight="semiBold"
              style={{
                color: t.count < 0 ? "#fca5a5" : colors.text,
                fontVariant: ["tabular-nums"],
                textAlign: "right",
              }}
            />
          </View>
        ))}
      </View>

      {recent.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text
            text="Most recent raw_sensor_records:"
            size="xxs"
            style={{ color: colors.textDim, paddingBottom: 4 }}
          />
          {recent.map((r) => (
            <View
              key={r.timestamp}
              style={[$tableRow, { borderTopColor: colors.divider }]}
            >
              <Text
                text={formatIstHms(r.timestamp)}
                size="xxs"
                style={{
                  color: colors.text,
                  fontFamily: "Menlo",
                  fontVariant: ["tabular-nums"],
                  flex: 1,
                }}
              />
              <Text
                text={r.syncedAt ? "synced" : "pending"}
                size="xxs"
                style={{
                  color: r.syncedAt ? "#86efac" : "#fcd34d",
                  textAlign: "right",
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </InspectorCard>
  )
}

const $headRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  paddingBottom: 4,
}

const $tableRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 4,
  borderTopWidth: 1,
}
