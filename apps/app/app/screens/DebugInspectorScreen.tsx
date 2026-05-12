import { FC, useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, ScrollView, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { LocalDbDiagnostics } from "@/components/LocalDbDiagnostics"
import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { openDatabase } from "@/services/db"
import { purgeOutboundQueue } from "@/services/db/repositories/outboundQueue"
import { runForceUpload } from "@/services/sync/forceUpload"
import {
  apiPost,
  DebugOverview,
  DebugSleepNight,
  fetchDebugOverview,
  fetchDebugSleepNight,
  forceLogout,
  INSPECTOR_WEB_URL,
  runDebugPipeline,
} from "@/services/api/noopClient"
import { useAuth } from "@/context/AuthContext"
import { openLinkInBrowser } from "@/utils/openLinkInBrowser"

const PALETTE = {
  tint: "#C76542",
  textDim: "#564E4A",
  text: "#191015",
  surfaceSubtle: "rgba(0,0,0,0.03)",
  surfaceCard: "rgba(0,0,0,0.035)",
  surfaceCardBorder: "rgba(0,0,0,0.06)",
}

function formatTimestamp(value?: string | null) {
  if (!value) return "--"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export const DebugInspectorScreen: FC = () => {
  const colors = PALETTE
  const themed = <T,>(s: T): T => s
  const { selectedDate, refreshDashboard } = useDashboard()
  const { syncNow } = useBle()
  const { logout } = useAuth()
  const [overview, setOverview] = useState<DebugOverview | null>(null)
  const [sleepNight, setSleepNight] = useState<DebugSleepNight | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refreshInspector = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [nextOverview, nextSleepNight] = await Promise.all([
        fetchDebugOverview(selectedDate),
        fetchDebugSleepNight(selectedDate),
      ])
      setOverview(nextOverview)
      setSleepNight(nextSleepNight)
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load sync inspector data.")
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    void refreshInspector()
  }, [refreshInspector])

  const handleSync = useCallback(async () => {
    setBanner("Running mobile sync…")
    await syncNow()
    await refreshDashboard()
    await refreshInspector()
    setBanner("Mobile sync completed.")
  }, [refreshDashboard, refreshInspector, syncNow])

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      "Clear outbound queue?",
      "Drops every pending and dead-lettered upload row. The records themselves stay in raw_sensor_records — only the queue is purged. Use after shipping a backend fix that lets the drainer succeed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const db = openDatabase()
              const purged = await purgeOutboundQueue(db)
              setBanner(`Cleared ${purged} queue rows.`)
              await refreshInspector()
            } catch (err: any) {
              setError(err?.message ?? "Failed to clear queue")
            }
          },
        },
      ],
    )
  }, [refreshInspector])

  const handleForceUpload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setBanner(null)
    try {
      const db = openDatabase()
      const result = await runForceUpload(db, {
        post: (tableName, payloads) =>
          apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }),
        onProgress: (progress) => {
          setBanner(
            `Uploading ${progress.tableName} batch (${progress.batchSize})… ${progress.uploaded} / ${progress.total}`,
          )
        },
      })

      if (result.depthAfter === 0 && result.uploaded === 0 && !result.error) {
        setBanner("Queue is empty — nothing to upload.")
        return
      }

      if (result.error) {
        setError(`Upload failed after ${result.uploaded} records: ${result.error}`)
      } else {
        setBanner(`Uploaded ${result.uploaded} records. ${result.depthAfter} still queued. ${result.deadCount} dead.`)
      }
    } catch (err: any) {
      setError(err?.message ?? "Upload failed")
    } finally {
      setIsLoading(false)
      await refreshInspector()
    }
  }, [refreshInspector])

  const handleRunPipeline = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await runDebugPipeline(selectedDate)
      setBanner(
        `Pipeline reran. Detections ${result.runResult.computed.sleepDetections ?? 0}, stages ${result.runResult.computed.sleepStages ?? 0}.`,
      )
      await refreshDashboard()
      await refreshInspector()
    } catch (nextError: any) {
      setError(nextError?.message || "Pipeline rerun failed.")
    } finally {
      setIsLoading(false)
    }
  }, [refreshDashboard, refreshInspector, selectedDate])

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={themed($container)}>
      <View style={themed($header)}>
        <Text text="Sync Inspector" size="lg" weight="semiBold" />
        <Text
          text={`Selected day ${overview?.selectedDateTitle ?? "Today"} · ${overview?.selectedDateSubtitle ?? ""}`}
          size="xs"
          style={themed($subtle)}
        />
      </View>

      <LocalDbDiagnostics />

      {error ? (
        <View style={themed($errorBanner)}>
          <Text text={error} size="xs" weight="semiBold" />
        </View>
      ) : null}

      {banner ? (
        <View style={themed($infoBanner)}>
          <Text text={banner} size="xs" weight="semiBold" />
        </View>
      ) : null}

      <View style={themed($buttonRow)}>
        <ActionButton label={isLoading ? "Refreshing…" : "Refresh"} onPress={() => void refreshInspector()} />
        <ActionButton label="Sync from Strap" onPress={() => void handleSync()} />
      </View>
      <View style={themed($buttonRow)}>
        <ActionButton label="Force Upload" onPress={() => void handleForceUpload()} />
        <ActionButton label="Run Pipeline Now" onPress={() => void handleRunPipeline()} />
      </View>
      <View style={themed($buttonRow)}>
        <ActionButton label="Open Web Inspector" onPress={() => openLinkInBrowser(INSPECTOR_WEB_URL)} />
        <ActionButton label="Clear Outbound Queue" onPress={handleClearQueue} />
      </View>
      <View style={themed($buttonRow)}>
        <ActionButton label="Log Out" onPress={() => { forceLogout(); void logout() }} />
      </View>

      {isLoading && !overview ? (
        <View style={themed($loadingWrap)}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : null}

      <View style={themed($metricsRow)}>
        <MetricTile label="Raw rows" value={`${overview?.counts.rawRecordCount ?? 0}`} />
        <MetricTile label="Detections" value={`${overview?.counts.sleepDetectionCount ?? 0}`} />
        <MetricTile label="Stages" value={`${overview?.counts.sleepStageCount ?? 0}`} />
      </View>

      <View style={themed($card)}>
        <Text text="Overview" size="sm" weight="semiBold" />
        <KeyValue label="Selection mode" value={overview?.selectionMode ?? "--"} />
        <KeyValue label="Selected night" value={overview?.selectedNightDate ?? "--"} />
        <KeyValue label="Reason" value={overview?.selectionReason ?? "--"} />
        <KeyValue label="Earliest raw" value={formatTimestamp(overview?.earliestRawTimestamp)} />
        <KeyValue label="Latest raw" value={formatTimestamp(overview?.latestRawTimestamp)} />
        <KeyValue label="Pipeline state" value={overview?.lastPipelineRunStatus ?? "--"} />
      </View>

      <View style={themed($card)}>
        <Text text="Selected Night" size="sm" weight="semiBold" />
        <KeyValue label="Mode" value={sleepNight?.selectionMode ?? "--"} />
        <KeyValue
          label="Night date"
          value={sleepNight?.selectedNightDate ? formatTimestamp(sleepNight.selectedNightDate) : "--"}
        />
        <KeyValue
          label="Detection"
          value={
            sleepNight?.selectedDetection
              ? `${sleepNight.selectedDetection.durationHours.toFixed(2)}h · confidence ${sleepNight.selectedDetection.confidence.toFixed(2)}`
              : "--"
          }
        />
        <KeyValue
          label="Stage totals"
          value={
            sleepNight?.stageTotals
              ? `Awake ${sleepNight.stageTotals.awakeMinutes}m · Light ${sleepNight.stageTotals.lightMinutes}m · Deep ${sleepNight.stageTotals.deepMinutes}m · REM ${sleepNight.stageTotals.remMinutes}m`
              : "--"
          }
        />
        <KeyValue label="Epochs" value={`${sleepNight?.epochTimelineCount ?? 0}`} />
      </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const ActionButton = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const colors = PALETTE
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.surfaceCardBorder, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" }}>
        <Text text={label} size="xs" weight="semiBold" />
      </View>
    </TouchableOpacity>
  )
}

const MetricTile = ({ label, value }: { label: string; value: string }) => {
  const colors = PALETTE
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.surfaceCardBorder, borderRadius: 18, padding: 14, gap: 6 }}>
      <Text text={label} size="xxs" style={{ color: colors.textDim }} />
      <Text text={value} size="lg" weight="bold" />
    </View>
  )
}

const KeyValue = ({ label, value }: { label: string; value: string }) => {
  const colors = PALETTE
  return (
    <View style={{ gap: 4 }}>
      <Text text={label} size="xxs" weight="bold" style={{ color: colors.textDim }} />
      <Text text={value} size="xs" style={{ color: colors.text }} />
    </View>
  )
}

const $container: ViewStyle = { paddingHorizontal: 24, paddingVertical: 16, gap: 16 }
const $header: ViewStyle = { gap: 8 }
const $subtle: TextStyle = { color: PALETTE.textDim }
const $buttonRow: ViewStyle = { flexDirection: "row", gap: 12 }
const $metricsRow: ViewStyle = { flexDirection: "row", gap: 12 }
const $card: ViewStyle = {
  backgroundColor: PALETTE.surfaceCard,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: PALETTE.surfaceCardBorder,
  padding: 16,
  gap: 12,
}
const $errorBanner: ViewStyle = {
  backgroundColor: "rgba(255,96,96,0.16)",
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 12,
}
const $infoBanner: ViewStyle = {
  backgroundColor: "rgba(171,204,255,0.16)",
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 12,
}
const $loadingWrap: ViewStyle = { paddingVertical: 24, alignItems: "center" }
