import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Check, Clock, Pulse, Warning } from "phosphor-react-native"
import type { Icon as PhosphorIcon } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import type {
  ApiFailureRecord,
  DetectedGap,
  SyncSession,
} from "@/services/sync/syncTelemetry"

export type EventRow = {
  id: string
  tone: "warn" | "bad" | "ok"
  icon: PhosphorIcon
  title: string
  sub: string
  at: number
}

type BuildInput = {
  apiFailures: ApiFailureRecord[]
  detectedGaps: DetectedGap[]
  syncSessions: SyncSession[]
  lastPipelineRunAt: number | null
  lastPipelineDurationMs: number | null
  daemonRunning: boolean
  lastTickAt: number | null
  nowMs: number
}

const TICK_AGE_FOR_WARN_MS = 5 * 60_000
const MAX = 10

export function buildEvents(i: BuildInput): EventRow[] {
  const out: EventRow[] = []
  for (const f of i.apiFailures) {
    out.push({
      id: `api-${f.at}-${f.method}-${f.path}`,
      tone: "warn",
      icon: Warning,
      title: `API · ${f.method} ${f.path}`,
      sub: `${f.kind} · ${Math.round((i.nowMs - f.at) / 1000)}s ago`,
      at: f.at,
    })
  }
  if (
    !i.daemonRunning &&
    i.lastTickAt != null &&
    i.nowMs - i.lastTickAt > TICK_AGE_FOR_WARN_MS
  ) {
    out.push({
      id: `daemon-stopped-${i.lastTickAt}`,
      tone: "warn",
      icon: Pulse,
      title: "Daemon stopped",
      sub: `last tick ${Math.round((i.nowMs - i.lastTickAt) / 60_000)}m ago`,
      at: i.lastTickAt,
    })
  }
  for (const g of i.detectedGaps) {
    out.push({
      id: `gap-${g.fromMs}`,
      tone: "warn",
      icon: Clock,
      title: `${g.durationMinutes.toFixed(0)}-min gap`,
      sub: formatGapWindow(g.fromMs, g.toMs),
      at: g.detectedAt,
    })
  }
  for (const s of i.syncSessions) {
    out.push({
      id: `sync-${s.startedAt}`,
      tone: "ok",
      icon: Check,
      title: `Sync · ${s.recordsPulled} rec · ${s.stopReason}`,
      sub: `${formatAgo(i.nowMs - s.startedAt)} · ${(s.durationMs / 1000).toFixed(1)}s · ${s.iterations} pass`,
      at: s.startedAt,
    })
  }
  if (i.lastPipelineRunAt != null && i.lastPipelineDurationMs != null) {
    out.push({
      id: `pipeline-${i.lastPipelineRunAt}`,
      tone: "ok",
      icon: Check,
      title: "Pipeline",
      sub: `${formatAgo(i.nowMs - i.lastPipelineRunAt)} · ${(i.lastPipelineDurationMs / 1000).toFixed(0)}s`,
      at: i.lastPipelineRunAt,
    })
  }
  out.sort((a, b) => {
    const toneRank = (t: EventRow["tone"]) => (t === "bad" ? 0 : t === "warn" ? 1 : 2)
    const r = toneRank(a.tone) - toneRank(b.tone)
    return r !== 0 ? r : b.at - a.at
  })
  return out.slice(0, MAX)
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  return `${(ms / 3_600_000).toFixed(1)}h ago`
}

function formatGapWindow(fromMs: number, toMs: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  return `${fmt(fromMs)} → ${fmt(toMs)}`
}

export const EventsCard: FC<{ events: EventRow[] }> = ({ events }) => {
  const { colors } = LOCAL_THEME
  if (events.length === 0) {
    return (
      <View
        style={[
          $card,
          { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceCard },
        ]}
      >
        <Text text="No events" size="xs" style={{ color: colors.textDim }} />
      </View>
    )
  }
  return (
    <View
      style={[
        $card,
        { borderColor: colors.surfaceCardBorder, backgroundColor: colors.surfaceCard },
      ]}
    >
      {events.map((e, i) => {
        const Icon = e.icon
        const titleColor =
          e.tone === "warn"
            ? colors.statusAmber
            : e.tone === "bad"
              ? colors.statusRed
              : colors.text
        return (
          <View
            key={e.id}
            style={[
              $row,
              i > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceCardBorder } : null,
            ]}
          >
            <Icon size={14} color={titleColor} weight="regular" />
            <View style={{ flex: 1 }}>
              <Text
                text={e.title}
                size="xs"
                weight="semiBold"
                style={{ color: titleColor }}
              />
              <Text
                text={e.sub}
                size="xxs"
                style={{ color: colors.textDim, marginTop: 1 }}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const $card: ViewStyle = {
  borderRadius: 14,
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 4,
}
const $row: ViewStyle = {
  flexDirection: "row",
  gap: 10,
  paddingVertical: 8,
  alignItems: "flex-start",
}
