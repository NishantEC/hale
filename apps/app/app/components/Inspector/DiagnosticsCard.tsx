import { FC, useEffect, useMemo, useState } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { DebugOverview } from "@/services/api/noopClient"
import {
  type ApiFailureRecord,
  type DetectedGap,
  type SyncSession,
  getSyncTelemetry,
  subscribeSyncTelemetry,
} from "@/services/sync/syncTelemetry"
import { getContinuousSyncStats } from "@/services/sync/continuousSyncDaemon"
import { LOCAL_THEME } from "@/utils/localTheme"

import { CoverageBar } from "./CoverageBar"
import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

type Props = {
  overview: DebugOverview | null
  lastPipelineRun?: {
    startedAt: string
    durationMs: number
    detections: number
    sleepStages: number
    computeMs: number | null
    skipped: boolean
  } | null
}

function formatNightDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`
}

export const DiagnosticsCard: FC<Props> = ({ overview, lastPipelineRun }) => {
  const { colors } = LOCAL_THEME
  const recentNights = overview?.recentNights ?? []
  const coverageMin = overview?.todayCoverageMinutes ?? 0

  const [apiFailures, setApiFailures] = useState<ApiFailureRecord[]>(
    () => getSyncTelemetry().apiFailures,
  )
  const [syncSessions, setSyncSessions] = useState<SyncSession[]>(
    () => getSyncTelemetry().syncSessions,
  )
  const [detectedGaps, setDetectedGaps] = useState<DetectedGap[]>(
    () => getSyncTelemetry().detectedGaps,
  )
  // Re-render every 5s so the daemon stats row's "last tick X s ago"
  // line stays fresh — getContinuousSyncStats() is a pure read, no
  // subscription mechanism, so we poll.
  const [daemonTick, setDaemonTick] = useState(0)
  useEffect(() => {
    const unsub = subscribeSyncTelemetry(() => {
      const t = getSyncTelemetry()
      setApiFailures(t.apiFailures)
      setSyncSessions(t.syncSessions)
      setDetectedGaps(t.detectedGaps)
    })
    const id = setInterval(() => setDaemonTick((n) => n + 1), 5_000)
    return () => {
      unsub()
      clearInterval(id)
    }
  }, [])
  const daemonStats = useMemo(() => getContinuousSyncStats(), [daemonTick])
  const recentApiFailureCount = useMemo(() => {
    const cutoff = Date.now() - 5 * 60_000
    return apiFailures.filter((f) => f.at >= cutoff).length
  }, [apiFailures])

  const { tone, pillText, defaultExpanded } = useMemo(() => {
    const missed = recentNights.filter((n) => !n.hasDetection).length
    const coveragePct = coverageMin / 1440
    const issues = missed + (coveragePct < 0.8 ? 1 : 0) + (recentApiFailureCount > 0 ? 1 : 0)
    let nextTone: StatusTone = "ok"
    let nextText = "OK"
    if (recentApiFailureCount > 0) {
      nextTone = recentApiFailureCount >= 3 ? "bad" : "warn"
      nextText = `${recentApiFailureCount} API fail${recentApiFailureCount === 1 ? "" : "s"}`
    } else if (missed > 0) {
      nextTone = missed >= 2 ? "bad" : "warn"
      nextText = `${missed} night${missed === 1 ? "" : "s"} missed`
    } else if (coveragePct < 0.3) {
      nextTone = "bad"
      nextText = "Low coverage"
    } else if (coveragePct < 0.8) {
      nextTone = "warn"
      nextText = "Coverage gap"
    }
    return { tone: nextTone, pillText: nextText, defaultExpanded: issues > 0 }
  }, [recentNights, coverageMin, recentApiFailureCount])

  return (
    <InspectorCard
      title="Diagnostics"
      pill={<StatusPill tone={tone} text={pillText} />}
      defaultExpanded={defaultExpanded}
    >
      <SectionLabel text="Last 3 nights" />
      {recentNights.length === 0 ? (
        <Text text="No data" size="xs" style={{ color: colors.textDim }} />
      ) : (
        recentNights.map((n) => <NightRow key={n.nightDate} night={n} />)
      )}

      <SectionLabel text="Today's coverage" />
      <CoverageBar coveredMinutes={coverageMin} />
      <View style={[$row, { borderTopWidth: 0, paddingTop: 4 }]}>
        <Text
          text={`${coverageMin} min of 1440`}
          size="xs"
          style={{ color: colors.textDim, fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${((coverageMin / 1440) * 100).toFixed(0)}%`}
          size="xs"
          weight="semiBold"
          style={{ color: colors.text, fontVariant: ["tabular-nums"] }}
        />
      </View>

      <SectionLabel text="Recent API failures" />
      {apiFailures.length === 0 ? (
        <Text text="None" size="xs" style={{ color: colors.textDim }} />
      ) : (
        apiFailures.slice(0, 5).map((f, idx) => <ApiFailureRow key={`${f.at}-${idx}`} f={f} />)
      )}

      <SectionLabel text="Daemon" />
      <Row
        label="Continuous sync"
        value={
          daemonStats.isRunning
            ? `${daemonStats.ticks} ticks · last ${formatRelative(daemonStats.lastTickAt)}`
            : "Stopped"
        }
        tone={daemonStats.isRunning ? undefined : "warn"}
      />
      {daemonStats.isRunning ? (
        <Row
          label="Skipped"
          value={`busy ${daemonStats.skippedBusy} · disc ${daemonStats.skippedDisconnected}`}
        />
      ) : null}

      <SectionLabel text="Recent syncs" />
      {syncSessions.length === 0 ? (
        <Text text="None yet" size="xs" style={{ color: colors.textDim }} />
      ) : (
        syncSessions.slice(0, 5).map((s, idx) => (
          <SyncSessionRow key={`${s.startedAt}-${idx}`} s={s} />
        ))
      )}

      <SectionLabel text="Detected gaps" />
      {detectedGaps.length === 0 ? (
        <Text text="None" size="xs" style={{ color: colors.textDim }} />
      ) : (
        detectedGaps.slice(0, 5).map((g, idx) => (
          <GapRow key={`${g.fromMs}-${idx}`} g={g} />
        ))
      )}

      <SectionLabel text="Last pipeline run" />
      {lastPipelineRun ? (
        <>
          <Row
            label={new Date(lastPipelineRun.startedAt).toLocaleTimeString()}
            value={`${lastPipelineRun.detections} det · ${lastPipelineRun.sleepStages} stages`}
          />
          {lastPipelineRun.computeMs != null ? (
            <Row
              label="compute"
              value={`${formatDuration(lastPipelineRun.computeMs)} of ${formatDuration(lastPipelineRun.durationMs)}`}
              tone={lastPipelineRun.computeMs > 60_000 ? "warn" : undefined}
            />
          ) : null}
        </>
      ) : (
        <Text text="No runs yet" size="xs" style={{ color: colors.textDim }} />
      )}
    </InspectorCard>
  )
}

const SectionLabel: FC<{ text: string }> = ({ text }) => {
  const { colors } = LOCAL_THEME
  return (
    <Text
      text={text}
      size="xxs"
      weight="bold"
      style={{
        color: colors.textDim,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: 8,
        marginBottom: 4,
      }}
    />
  )
}

const NightRow: FC<{
  night: { nightDate: string; hasDetection: boolean; rawRecordCount: number }
}> = ({ night }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={[$row, { borderTopColor: colors.divider }]}>
      <Text text={formatNightDate(night.nightDate)} size="xs" style={{ color: colors.textDim }} />
      <Text
        text={night.hasDetection ? "classified" : `no detection · ${night.rawRecordCount} rec`}
        size="xs"
        weight="semiBold"
        style={{
          color: night.hasDetection ? colors.text : colors.statusRed,
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  )
}

function ageLabel(ms: number): string {
  const delta = (Date.now() - ms) / 1000
  if (delta < 60) return `${Math.max(0, Math.round(delta))}s ago`
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`
  return `${Math.round(delta / 86400)}d ago`
}

function truncatePath(path: string, max = 38): string {
  if (path.length <= max) return path
  return path.slice(0, max - 1) + "…"
}

const ApiFailureRow: FC<{ f: ApiFailureRecord }> = ({ f }) => {
  const { colors } = LOCAL_THEME
  const tone: "warn" | "bad" = f.kind === "server" ? "bad" : "warn"
  const valueColor = tone === "bad" ? colors.statusRed : colors.statusAmber
  const kindLabel = f.kind === "timeout" ? "timeout" : f.kind === "network" ? "network" : `${f.status ?? "5xx"}`
  return (
    <View style={[$row, { borderTopColor: colors.divider, alignItems: "flex-start" }]}>
      <View style={{ flexShrink: 1, paddingRight: 8 }}>
        <Text
          text={`${f.method} ${truncatePath(f.path)}`}
          size="xs"
          weight="semiBold"
          style={{ color: valueColor, fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${kindLabel} · ${ageLabel(f.at)}`}
          size="xxs"
          style={{ color: colors.textDim, marginTop: 1 }}
        />
      </View>
    </View>
  )
}

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }
const Row: FC<RowProps> = ({ label, value, tone }) => {
  const { colors } = LOCAL_THEME
  const valueColor = tone === "warn" ? colors.statusAmber : tone === "bad" ? colors.statusRed : colors.text
  return (
    <View style={[$row, { borderTopColor: colors.divider }]}>
      <Text text={label} size="xs" style={{ color: colors.textDim }} />
      <Text
        text={value}
        size="xs"
        weight="semiBold"
        style={{ color: valueColor, fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 5,
  borderTopWidth: 1,
}

function formatRelative(ms: number | null): string {
  if (ms == null) return "never"
  const delta = (Date.now() - ms) / 1000
  if (delta < 60) return `${Math.max(0, Math.round(delta))}s ago`
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`
  return `${Math.round(delta / 86400)}d ago`
}

function formatIstShort(ms: number | null): string {
  if (ms == null) return "—"
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000)
  return `${ist.toISOString().slice(5, 10).replace("-", "/")} ${ist.toISOString().slice(11, 19)}`
}

const SyncSessionRow: FC<{ s: SyncSession }> = ({ s }) => {
  const { colors } = LOCAL_THEME
  const stopTone: "warn" | "bad" | undefined =
    s.stopReason === "error"
      ? "bad"
      : s.stopReason === "stuck_cursor" || s.stopReason === "iter_cap"
        ? "warn"
        : undefined
  const fg =
    stopTone === "bad"
      ? colors.statusRed
      : stopTone === "warn"
        ? colors.statusAmber
        : colors.text
  return (
    <View style={[$row, { borderTopColor: colors.divider, alignItems: "flex-start" }]}>
      <View style={{ flexShrink: 1, paddingRight: 8 }}>
        <Text
          text={`${s.recordsPulled} rec · ${s.iterations} pass · ${s.stopReason}`}
          size="xs"
          weight="semiBold"
          style={{ color: fg, fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${formatRelative(s.startedAt)} · ${(s.durationMs / 1000).toFixed(1)}s${s.newestBatchMs ? ` · → ${formatIstShort(s.newestBatchMs)}` : ""}`}
          size="xxs"
          style={{ color: colors.textDim, marginTop: 1 }}
        />
      </View>
    </View>
  )
}

const GapRow: FC<{ g: DetectedGap }> = ({ g }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={[$row, { borderTopColor: colors.divider, alignItems: "flex-start" }]}>
      <View style={{ flexShrink: 1, paddingRight: 8 }}>
        <Text
          text={`${g.durationMinutes.toFixed(1)} min gap`}
          size="xs"
          weight="semiBold"
          style={{ color: colors.statusAmber, fontVariant: ["tabular-nums"] }}
        />
        <Text
          text={`${formatIstShort(g.fromMs)} → ${formatIstShort(g.toMs)}`}
          size="xxs"
          style={{ color: colors.textDim, marginTop: 1 }}
        />
      </View>
    </View>
  )
}
