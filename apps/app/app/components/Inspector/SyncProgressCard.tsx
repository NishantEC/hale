import { FC, useEffect, useMemo, useState } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats"
import {
  useLastDrainAt,
  useLastDrainOutcome,
} from "@/stores/drainTelemetryStore"
import {
  useLastBatchWindow,
  useLastPipelineAt,
  usePipelineState,
  useSyncIsRunning,
  useSyncIteration,
  useSyncIterationCap,
  useSyncProgress,
  useSyncStage,
  useSyncStopReason,
  useSyncSummary,
} from "@/stores/syncStore"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"
import { StatusPill, StatusTone } from "./StatusPill"

function formatIst(ms: number): string {
  // IST = UTC+5:30. Hand-roll the formatter since RN's Intl is bulky and we
  // only need one zone for this card.
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000)
  const date = ist.toISOString().slice(5, 10).replace("-", "/")
  const time = ist.toISOString().slice(11, 19)
  return `${date} ${time} IST`
}

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export const SyncProgressCard: FC = () => {
  const isSyncing = useSyncIsRunning()
  const syncStage = useSyncStage()
  const syncProgress = useSyncProgress()
  const syncSummary = useSyncSummary()
  const syncIteration = useSyncIteration()
  const syncIterationCap = useSyncIterationCap()
  const syncLastStopReason = useSyncStopReason()
  const pipelineState = usePipelineState()
  const lastPipelineAt = useLastPipelineAt()
  const lastBatchWindow = useLastBatchWindow()
  const queueStats = useOutboundQueueStats()
  const lastDrainOutcome = useLastDrainOutcome()
  const lastDrainAt = useLastDrainAt()

  // Damp the iteration counter ~500ms so users don't see flicker as the
  // strap finishes one pass and starts the next.
  const [visibleIteration, setVisibleIteration] = useState(syncIteration)
  useEffect(() => {
    if (syncIteration === visibleIteration) return
    const t = setTimeout(() => setVisibleIteration(syncIteration), 500)
    return () => clearTimeout(t)
  }, [syncIteration, visibleIteration])

  const { tone, pill, defaultExpanded } = useMemo(() => {
    if (isSyncing) {
      const t: StatusTone = "warn"
      return { tone: t, pill: "Syncing", defaultExpanded: true }
    }
    if (pipelineState === "running") {
      const t: StatusTone = "warn"
      return { tone: t, pill: "Pipeline", defaultExpanded: true }
    }
    if (pipelineState === "failed") {
      const t: StatusTone = "bad"
      return { tone: t, pill: "Pipeline failed", defaultExpanded: true }
    }
    if (syncSummary) {
      const t: StatusTone = "ok"
      return { tone: t, pill: "Idle", defaultExpanded: false }
    }
    const t: StatusTone = "dim"
    return { tone: t, pill: "Idle", defaultExpanded: false }
  }, [isSyncing, pipelineState, syncSummary])

  return (
    <InspectorCard
      title="Sync Progress"
      pill={<StatusPill tone={tone} text={pill} />}
      defaultExpanded={defaultExpanded}
    >
      <Row label="State" value={syncProgress?.state ?? (isSyncing ? "starting" : "idle")} />
      <Row label="Stage" value={syncStage || "—"} />
      <Row
        label="Pass"
        value={
          visibleIteration > 0
            ? `${visibleIteration}${
                Number.isFinite(syncIterationCap) ? `/${syncIterationCap}` : ""
              }${!isSyncing && syncLastStopReason ? ` · stopped: ${syncLastStopReason}` : ""}`
            : "—"
        }
      />
      <Row
        label="Chunks received"
        value={syncProgress ? String(syncProgress.chunksReceived) : "—"}
      />
      <Row
        label="Records parsed"
        value={syncProgress ? String(syncProgress.recordsParsed) : "—"}
      />
      <Row
        label="Bytes transferred"
        value={syncProgress ? formatKB(syncProgress.totalBytes) : "—"}
      />
      <Row
        label="Last batch"
        value={
          lastBatchWindow
            ? `${lastBatchWindow.batchSize} records · ${formatIst(
                lastBatchWindow.oldestMs,
              )} → ${formatIst(lastBatchWindow.newestMs)}`
            : "—"
        }
      />
      <Row
        label="Queue"
        value={`${queueStats.depth ?? 0} pending · ${queueStats.deadCount ?? 0} dead`}
        tone={(queueStats.deadCount ?? 0) > 0 ? "bad" : undefined}
      />
      <Row
        label="Last drain"
        value={formatLastDrain(lastDrainOutcome, lastDrainAt)}
        tone={lastDrainTone(lastDrainOutcome)}
      />
      <Row
        label="Pipeline"
        value={formatPipeline(pipelineState, lastPipelineAt)}
        tone={
          pipelineState === "failed" ? "bad" : pipelineState === "running" ? "warn" : undefined
        }
      />
      {syncSummary ? (
        <Row
          label="Last summary"
          value={`${syncSummary.nights} nights · ${syncSummary.stages} stages · ${syncSummary.scores} scores`}
        />
      ) : null}
    </InspectorCard>
  )
}

function formatRelativeAge(at: number | null): string {
  if (at == null) return "never"
  const ageMs = Date.now() - at
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`
  if (ageMs < 60 * 60_000) return `${Math.round(ageMs / 60_000)}m ago`
  return `${Math.round(ageMs / (60 * 60_000))}h ago`
}

function formatLastDrain(
  outcome: import("@/services/sync/uplinkDrainer").DrainLoopOutcome | null,
  lastDrainAt: number | null,
): string {
  if (!outcome) return "never"
  if (outcome.skipped === "locked") {
    return `skipped (locked) · ${formatRelativeAge(lastDrainAt)}`
  }
  const seconds = (outcome.durationMs / 1000).toFixed(1)
  const age = formatRelativeAge(lastDrainAt)
  // Build the count strip — surface 0/0 explicitly when nothing was drained
  // so the user sees "the drain ran but had nothing to do."
  const counts =
    outcome.drained === 0 && outcome.failed === 0
      ? "nothing to drain"
      : `${outcome.drained} ✓${outcome.failed > 0 ? ` · ${outcome.failed} ✗` : ""}`
  return outcome.error
    ? `${counts} (${truncate(outcome.error, 32)}) · ${seconds}s · ${age}`
    : `${counts} · ${seconds}s · ${age}`
}

function lastDrainTone(
  outcome: import("@/services/sync/uplinkDrainer").DrainLoopOutcome | null,
): "warn" | "bad" | undefined {
  if (!outcome) return undefined
  if (outcome.failed > 0 || outcome.error) return "bad"
  if (outcome.skipped === "locked") return "warn"
  return undefined
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function formatPipeline(
  state: "idle" | "running" | "success" | "failed",
  lastAt: string | null,
): string {
  if (state === "running") return "running… (background)"
  if (state === "failed") return "failed (records still queued)"
  if (state === "success" && lastAt) {
    const ageMs = Date.now() - new Date(lastAt).getTime()
    if (ageMs < 60_000) return `success · ${Math.max(1, Math.round(ageMs / 1000))}s ago`
    if (ageMs < 60 * 60_000) return `success · ${Math.round(ageMs / 60_000)}m ago`
    return `success · ${Math.round(ageMs / (60 * 60_000))}h ago`
  }
  return "idle"
}

type RowProps = { label: string; value: string; tone?: "warn" | "bad" }

const Row: FC<RowProps> = ({ label, value, tone }) => {
  const { colors } = LOCAL_THEME
  const valueColor =
    tone === "warn" ? colors.statusAmber : tone === "bad" ? colors.statusRed : colors.text
  return (
    <View style={[$row, { borderTopColor: colors.divider }]}>
      <Text text={label} size="xs" style={{ color: colors.textDim }} />
      <Text
        text={value}
        size="xs"
        weight="semiBold"
        style={{ color: valueColor, fontVariant: ["tabular-nums"], flexShrink: 1, textAlign: "right" }}
      />
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 7,
  borderTopWidth: 1,
  gap: 12,
}
