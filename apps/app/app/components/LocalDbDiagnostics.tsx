import { FC, useEffect, useState } from "react"
import { View, ViewStyle, TextStyle } from "react-native"
import { sql } from "drizzle-orm"

import { Text } from "@/components/Text"
import { openDatabase } from "@/services/db"
import * as schema from "@/services/db/schema"
import { listDeadLetters, queueDepth } from "@/services/db/repositories/outboundQueue"
import { getRawSyncBreakdown } from "@/services/db/repositories/rawSensorRecord"
import { getLastSyncAt } from "@/services/db/repositories/syncState"

type Diagnostics = {
  rawSynced: number
  rawPending: number
  rawOldestPendingMs: number | null
  dailyMetricsCount: number
  sleepStagesCount: number
  journalCount: number
  viewCacheCount: number
  outboundDepth: number
  deadLetters: number
  lastSyncDailyMetrics: number
  lastSyncSleepStages: number
}

async function computeDiagnostics(): Promise<Diagnostics> {
  const db = openDatabase()
  const count = async (t: any): Promise<number> => {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(t)
    return rows[0]?.c ?? 0
  }
  const [
    { synced: rawSynced, pending: rawPending, oldestPendingMs: rawOldestPendingMs },
    dailyMetricsCount,
    sleepStagesCount,
    journalCount,
    viewCacheCount,
    outboundDepth,
    deadLetters,
    lastSyncDailyMetrics,
    lastSyncSleepStages,
  ] = await Promise.all([
    getRawSyncBreakdown(db),
    count(schema.dailyMetrics),
    count(schema.sleepStages),
    count(schema.journalEntries),
    count(schema.viewCache),
    queueDepth(db),
    listDeadLetters(db).then((r) => r.length),
    getLastSyncAt(db, "daily_metrics"),
    getLastSyncAt(db, "sleep_stages"),
  ])
  return {
    rawSynced,
    rawPending,
    rawOldestPendingMs,
    dailyMetricsCount,
    sleepStagesCount,
    journalCount,
    viewCacheCount,
    outboundDepth,
    deadLetters,
    lastSyncDailyMetrics,
    lastSyncSleepStages,
  }
}

function formatTs(ms: number) {
  if (!ms) return "never"
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
}

export const LocalDbDiagnostics: FC = () => {
  const [d, setD] = useState<Diagnostics | null>(null)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const next = await computeDiagnostics()
        if (alive) setD(next)
      } catch (err) {
        if (alive) console.warn("[diagnostics]", err)
      }
    }
    void tick()
    const interval = setInterval(tick, 5000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [])

  if (!d) {
    return (
      <View style={$card}>
        <Text text="Local DB" size="sm" weight="semiBold" />
        <Text text="Loading…" size="xs" style={$muted} />
      </View>
    )
  }

  return (
    <View style={$card}>
      <Text text="Local DB" size="sm" weight="semiBold" />
      <Row label="Raw records" value={`${d.rawSynced + d.rawPending} total`} />
      <Row label="  · synced" value={String(d.rawSynced)} />
      <Row label="  · pending" value={String(d.rawPending)} />
      {d.rawPending > 0 && d.rawOldestPendingMs != null && (
        <Row label="  · oldest pending" value={formatTs(d.rawOldestPendingMs)} />
      )}
      <Row label="Daily metrics" value={String(d.dailyMetricsCount)} />
      <Row label="Sleep stages" value={String(d.sleepStagesCount)} />
      <Row label="Journal entries" value={String(d.journalCount)} />
      <Row label="View cache rows" value={String(d.viewCacheCount)} />
      <Row label="Outbound queue" value={`${d.outboundDepth} pending · ${d.deadLetters} dead`} />
      <Row label="Last daily_metrics sync" value={formatTs(d.lastSyncDailyMetrics)} />
      <Row label="Last sleep_stages sync" value={formatTs(d.lastSyncSleepStages)} />
    </View>
  )
}

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={$row}>
    <Text text={label} size="xs" style={$muted} />
    <Text text={value} size="xs" weight="semiBold" />
  </View>
)

const $card: ViewStyle = {
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
  backgroundColor: "rgba(0,0,0,0.035)",
  gap: 4,
}
const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingVertical: 2,
}
const $muted: TextStyle = { opacity: 0.7 }
