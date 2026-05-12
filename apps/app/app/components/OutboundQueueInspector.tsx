import { FC, useCallback, useEffect, useState } from "react"
import { Alert, TouchableOpacity, View, ViewStyle, TextStyle } from "react-native"

import { Text } from "@/components/Text"
import { openDatabase } from "@/services/db"
import {
  discardOutboundRow,
  listDeadLetters,
  oldestPendingAt,
  queueDepth,
  retryOutboundRow,
} from "@/services/db/repositories/outboundQueue"
import { peekDrainLock } from "@/services/db/repositories/drainLock"
import {
  getSyncTelemetry,
  subscribeSyncTelemetry,
} from "@/services/sync/syncTelemetry"

type DeadLetter = Awaited<ReturnType<typeof listDeadLetters>>[number]

function relativeAge(fromMs: number | null | undefined): string {
  if (fromMs == null) return "—"
  const deltaMs = Date.now() - fromMs
  if (deltaMs < 60_000) return `${Math.max(0, Math.round(deltaMs / 1000))}s ago`
  if (deltaMs < 3_600_000) return `${Math.round(deltaMs / 60_000)}m ago`
  if (deltaMs < 86_400_000) return `${Math.round(deltaMs / 3_600_000)}h ago`
  return `${Math.round(deltaMs / 86_400_000)}d ago`
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

type Snapshot = {
  depth: number
  oldestPending: number | null
  deadLetters: DeadLetter[]
  drainLockHolder: string | null
  drainLockExpiresAt: number | null
  telemetry: ReturnType<typeof getSyncTelemetry>
}

async function fetchSnapshot(): Promise<Snapshot> {
  const db = openDatabase()
  const [depth, oldestPending, deadLetters, lock] = await Promise.all([
    queueDepth(db),
    oldestPendingAt(db),
    listDeadLetters(db),
    peekDrainLock(db),
  ])
  return {
    depth,
    oldestPending,
    deadLetters,
    drainLockHolder: lock?.holder ?? null,
    drainLockExpiresAt: lock?.expiresAt ?? null,
    telemetry: getSyncTelemetry(),
  }
}

export const OutboundQueueInspector: FC = () => {
  const [snap, setSnap] = useState<Snapshot | null>(null)

  const reload = useCallback(async () => {
    try {
      setSnap(await fetchSnapshot())
    } catch (err) {
      console.warn("[OutboundQueueInspector] fetch failed", err)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const next = await fetchSnapshot()
      if (alive) setSnap(next)
    }
    void tick()
    const interval = setInterval(tick, 5000)
    const unsub = subscribeSyncTelemetry(() => {
      void tick()
    })
    return () => {
      alive = false
      clearInterval(interval)
      unsub()
    }
  }, [])

  const handleRetry = useCallback(
    (row: DeadLetter) => {
      Alert.alert(
        "Retry this row?",
        `${row.tableName} · row ${row.rowId}\n\nResets attempts to 0 so the next drain tries again.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Retry",
            onPress: async () => {
              await retryOutboundRow(openDatabase(), row.id)
              await reload()
            },
          },
        ],
      )
    },
    [reload],
  )

  const handleDiscard = useCallback(
    (row: DeadLetter) => {
      Alert.alert(
        "Discard this row?",
        `${row.tableName} · row ${row.rowId}\n\nPermanently removes the queue entry. The underlying record stays in its table.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              await discardOutboundRow(openDatabase(), row.id)
              await reload()
            },
          },
        ],
      )
    },
    [reload],
  )

  if (!snap) {
    return (
      <View style={$card}>
        <Text text="Outbound Queue" size="sm" weight="semiBold" />
        <Text text="Loading…" size="xs" style={$muted} />
      </View>
    )
  }

  const t = snap.telemetry.lastDrain

  return (
    <View style={$card}>
      <Text text="Outbound Queue" size="sm" weight="semiBold" />

      <KV label="Depth" value={`${snap.depth}`} />
      <KV
        label="Oldest pending"
        value={snap.oldestPending != null ? relativeAge(snap.oldestPending) : "—"}
      />
      <KV label="Dead-letter" value={`${snap.deadLetters.length}`} />
      <KV
        label="Drain lock"
        value={
          snap.drainLockHolder
            ? `${snap.drainLockHolder} (until ${relativeAge(snap.drainLockExpiresAt)})`
            : "free"
        }
      />

      <View style={$divider} />

      <KV label="Last drain at" value={t ? relativeAge(t.at) : "never"} />
      <KV label="Last drain took" value={t ? formatDuration(t.durationMs) : "—"} />
      <KV
        label="Last drain result"
        value={
          t
            ? t.skipped === "locked"
              ? "skipped (locked)"
              : `${t.drained} ok · ${t.failed} failed`
            : "—"
        }
      />
      {t?.error ? <KV label="Last drain error" value={t.error} /> : null}

      <KV
        label="Last pipeline run"
        value={
          snap.telemetry.lastPipelineRunAt != null
            ? `${relativeAge(snap.telemetry.lastPipelineRunAt)} · ${formatDuration(snap.telemetry.lastPipelineDurationMs)}`
            : "never (this session)"
        }
      />

      {snap.deadLetters.length > 0 ? (
        <>
          <View style={$divider} />
          <Text text="Dead-lettered rows" size="xs" weight="semiBold" />
          {snap.deadLetters.slice(0, 8).map((row) => (
            <View key={row.id} style={$deadRow}>
              <View style={{ flex: 1 }}>
                <Text text={`${row.tableName} · ${row.rowId}`} size="xxs" weight="semiBold" />
                <Text
                  text={`attempts=${row.attempts} · ${row.lastError ?? "—"}`}
                  size="xxs"
                  style={$muted}
                />
              </View>
              <TouchableOpacity onPress={() => handleRetry(row)} style={$actionBtn}>
                <Text text="Retry" size="xxs" weight="semiBold" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDiscard(row)} style={$actionBtnDanger}>
                <Text text="Discard" size="xxs" weight="semiBold" />
              </TouchableOpacity>
            </View>
          ))}
          {snap.deadLetters.length > 8 ? (
            <Text
              text={`+${snap.deadLetters.length - 8} more`}
              size="xxs"
              style={$muted}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const KV: FC<{ label: string; value: string }> = ({ label, value }) => (
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
const $divider: ViewStyle = {
  height: 1,
  backgroundColor: "rgba(0,0,0,0.08)",
  marginVertical: 6,
}
const $deadRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 6,
}
const $actionBtn: ViewStyle = {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 8,
  backgroundColor: "rgba(0,0,0,0.06)",
}
const $actionBtnDanger: ViewStyle = {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 8,
  backgroundColor: "rgba(255,96,96,0.16)",
}
