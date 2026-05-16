import { FC, useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, ScrollView, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { ActionsCard } from "@/components/Inspector/ActionsCard"
import { DiagnosticsCard } from "@/components/Inspector/DiagnosticsCard"
import { LiveMonitorCard } from "@/components/Inspector/LiveMonitorCard"
import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { openDatabase } from "@/services/db"
import { purgeOutboundQueue } from "@/services/db/repositories/outboundQueue"
import { runForceUpload } from "@/services/sync/forceUpload"
import { recordPipelineRun } from "@/services/sync/syncTelemetry"
import {
  apiPost,
  DebugOverview,
  fetchDebugOverview,
  fetchDebugPipelineRuns,
  INSPECTOR_WEB_URL,
  runDebugPipeline,
} from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"
import { openLinkInBrowser } from "@/utils/openLinkInBrowser"

export const DebugInspectorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const { selectedDate, refreshDashboard } = useDashboard()
  const { syncNow, rebootStrap, powerCycleStrap, probeDataRange } = useBle()
  const [overview, setOverview] = useState<DebugOverview | null>(null)
  const [lastPipelineRun, setLastPipelineRun] = useState<{
    startedAt: string
    durationMs: number
    detections: number
    sleepStages: number
    computeMs: number | null
    skipped: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refreshInspector = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const nextOverview = await fetchDebugOverview(selectedDate)
      setOverview(nextOverview)
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load sync inspector data.")
    } finally {
      setIsLoading(false)
    }

    try {
      const runs = await fetchDebugPipelineRuns(1)
      if (runs.runs.length > 0) {
        const r = runs.runs[0]
        setLastPipelineRun({
          startedAt: r.startedAt,
          durationMs: r.durationMs,
          detections: r.detections,
          sleepStages: r.sleepStages,
          computeMs: r.stages?.compute ?? null,
          skipped: r.skipped,
        })
      } else {
        setLastPipelineRun(null)
      }
    } catch {
      setLastPipelineRun(null)
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
    const started = Date.now()
    try {
      const result = await runDebugPipeline(selectedDate)
      recordPipelineRun(started, Date.now() - started)
      const computed = result.runResult?.computed
      if (computed) {
        setBanner(
          `Pipeline reran. Detections ${computed.sleepDetections ?? 0}, stages ${computed.sleepStages ?? 0}.`,
        )
      } else if (result.runResult?.skipped) {
        setBanner("Pipeline skipped — no new input since the last run.")
      } else {
        setBanner("Pipeline finished.")
      }
      await refreshDashboard()
      await refreshInspector()
    } catch (nextError: any) {
      setError(nextError?.message || "Pipeline rerun failed.")
    } finally {
      setIsLoading(false)
    }
  }, [refreshDashboard, refreshInspector, selectedDate])

  const handleRebootStrap = useCallback(() => {
    Alert.alert(
      "Reboot strap?",
      "Sends a soft-reboot command over BLE. The strap will disconnect and re-connect after a few seconds.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reboot",
          style: "destructive",
          onPress: async () => {
            try {
              await rebootStrap()
              setBanner("Reboot command sent.")
            } catch (e: any) {
              setError(e?.message ?? "Failed to send reboot")
            }
          },
        },
      ],
    )
  }, [rebootStrap])

  const handleProbeDataRange = useCallback(async () => {
    setError(null)
    setBanner("Probing strap data range…")
    try {
      const result = await probeDataRange()
      // Surface every byte so we can decode the format from the response.
      // Logged to console.log so it lands in the JS log stream, AND shown
      // in an Alert so it's visible without re-attaching Console.app.
      console.log(
        "[probeDataRange] response bytes:",
        result.hex,
        "\ndecoded attempt:\n",
        result.decoded,
      )
      Alert.alert(
        "GetDataRange response",
        `hex (${result.raw.length} bytes):\n${result.hex}\n\nbest-effort decode:\n${result.decoded}`,
      )
      setBanner(`Probe ok — ${result.raw.length} bytes (see alert / console).`)
    } catch (e: any) {
      setError(e?.message ?? "Probe failed")
    }
  }, [probeDataRange])

  const handlePowerCycleStrap = useCallback(() => {
    Alert.alert(
      "Power-cycle strap?",
      "Sends a firmware-level power-cycle. Stronger than a reboot — use if reboot didn't help.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Power-cycle",
          style: "destructive",
          onPress: async () => {
            try {
              await powerCycleStrap()
              setBanner("Power-cycle command sent.")
            } catch (e: any) {
              setError(e?.message ?? "Failed to send power-cycle")
            }
          },
        },
      ],
    )
  }, [powerCycleStrap])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Text text="Inspector" size="lg" weight="semiBold" style={{ marginBottom: 14, color: colors.text }} />

        {error ? (
          <View style={{ backgroundColor: colors.errorBackground, padding: 10, borderRadius: 12, marginBottom: 8 }}>
            <Text text={error} size="xs" weight="semiBold" style={{ color: colors.error }} />
          </View>
        ) : null}
        {banner ? (
          <View style={{ backgroundColor: colors.surfaceElevated, padding: 10, borderRadius: 12, marginBottom: 8 }}>
            <Text text={banner} size="xs" weight="semiBold" style={{ color: colors.text }} />
          </View>
        ) : null}

        <LiveMonitorCard overview={overview} />
        <DiagnosticsCard overview={overview} lastPipelineRun={lastPipelineRun} />
        <ActionsCard
          onSync={handleSync}
          onForceUpload={handleForceUpload}
          onRunPipeline={handleRunPipeline}
          onRefreshView={() => void refreshInspector()}
          onRebootStrap={handleRebootStrap}
          onPowerCycleStrap={handlePowerCycleStrap}
          onClearQueue={handleClearQueue}
          onOpenWebInspector={() => openLinkInBrowser(INSPECTOR_WEB_URL)}
          onProbeDataRange={handleProbeDataRange}
        />

        {isLoading && !overview ? (
          <View style={{ paddingVertical: 14, alignItems: "center" }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
