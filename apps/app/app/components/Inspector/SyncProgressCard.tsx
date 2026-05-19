import { FC, useEffect, useMemo, useState } from "react"
import { View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats"
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
  const ble = useBle()
  const queueStats = useOutboundQueueStats()

  // Damp the iteration counter ~500ms so users don't see flicker as the
  // strap finishes one pass and starts the next.
  const [visibleIteration, setVisibleIteration] = useState(ble.syncIteration)
  useEffect(() => {
    if (ble.syncIteration === visibleIteration) return
    const t = setTimeout(() => setVisibleIteration(ble.syncIteration), 500)
    return () => clearTimeout(t)
  }, [ble.syncIteration, visibleIteration])

  const { tone, pill, defaultExpanded } = useMemo(() => {
    if (ble.isSyncing) {
      const t: StatusTone = "warn"
      return { tone: t, pill: "Syncing", defaultExpanded: true }
    }
    if (ble.pipelineState === "running") {
      const t: StatusTone = "warn"
      return { tone: t, pill: "Pipeline", defaultExpanded: true }
    }
    if (ble.pipelineState === "failed") {
      const t: StatusTone = "bad"
      return { tone: t, pill: "Pipeline failed", defaultExpanded: true }
    }
    if (ble.syncSummary) {
      const t: StatusTone = "ok"
      return { tone: t, pill: "Idle", defaultExpanded: false }
    }
    const t: StatusTone = "dim"
    return { tone: t, pill: "Idle", defaultExpanded: false }
  }, [ble.isSyncing, ble.pipelineState, ble.syncSummary])

  return (
    <InspectorCard
      title="Sync Progress"
      pill={<StatusPill tone={tone} text={pill} />}
      defaultExpanded={defaultExpanded}
    >
      <Row label="State" value={ble.syncProgress?.state ?? (ble.isSyncing ? "starting" : "idle")} />
      <Row label="Stage" value={ble.syncStage || "—"} />
      <Row
        label="Pass"
        value={
          visibleIteration > 0
            ? `${visibleIteration}/${ble.syncIterationCap}${
                !ble.isSyncing && ble.syncLastStopReason
                  ? ` · stopped: ${ble.syncLastStopReason}`
                  : ""
              }`
            : "—"
        }
      />
      <Row
        label="Chunks received"
        value={ble.syncProgress ? String(ble.syncProgress.chunksReceived) : "—"}
      />
      <Row
        label="Records parsed"
        value={ble.syncProgress ? String(ble.syncProgress.recordsParsed) : "—"}
      />
      <Row
        label="Bytes transferred"
        value={ble.syncProgress ? formatKB(ble.syncProgress.totalBytes) : "—"}
      />
      <Row
        label="Last batch"
        value={
          ble.lastBatchWindow
            ? `${ble.lastBatchWindow.batchSize} records · ${formatIst(
                ble.lastBatchWindow.oldestMs,
              )} → ${formatIst(ble.lastBatchWindow.newestMs)}`
            : "—"
        }
      />
      <Row
        label="Queue"
        value={`${queueStats.depth ?? 0} pending · ${queueStats.deadCount ?? 0} dead`}
        tone={(queueStats.deadCount ?? 0) > 0 ? "bad" : undefined}
      />
      <Row
        label="Pipeline"
        value={formatPipeline(ble.pipelineState, ble.lastPipelineAt)}
        tone={
          ble.pipelineState === "failed"
            ? "bad"
            : ble.pipelineState === "running"
              ? "warn"
              : undefined
        }
      />
      {ble.syncSummary ? (
        <Row
          label="Last summary"
          value={`${ble.syncSummary.nights} nights · ${ble.syncSummary.stages} stages · ${ble.syncSummary.scores} scores`}
        />
      ) : null}
    </InspectorCard>
  )
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
