import { FC, useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { ActionsRow } from "@/components/Inspector/ActionsRow"
import { DaemonDrilldown } from "@/components/Inspector/DaemonDrilldown"
import { buildEvents, EventsCard } from "@/components/Inspector/EventsCard"
import { ExpertActions } from "@/components/Inspector/ExpertActions"
import { HealthStrip } from "@/components/Inspector/HealthStrip"
import { LogsCard } from "@/components/Inspector/LogsCard"
import { SyncProgressCard } from "@/components/Inspector/SyncProgressCard"
import { useExpertMode } from "@/components/Inspector/useExpertMode"
import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useDashboard } from "@/context/DashboardContext"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats"
import {
  apiPost,
  DebugOverview,
  fetchDebugOverview,
  fetchDebugPipelineRuns,
  INSPECTOR_WEB_URL,
  runDebugPipeline,
} from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { purgeOutboundQueue } from "@/services/db/repositories/outboundQueue"
import {
  DEFAULT_INTERVAL_MS,
  getContinuousSyncStats,
} from "@/services/sync/continuousSyncDaemon"
import { runForceUpload } from "@/services/sync/forceUpload"
import {
  getSyncTelemetry,
  recordPipelineRun,
  subscribeSyncTelemetry,
} from "@/services/sync/syncTelemetry"
import { LOCAL_THEME } from "@/utils/localTheme"
import { openLinkInBrowser } from "@/utils/openLinkInBrowser"

// Earliest timestamp confirmed in the GetDataRange response (offset 35
// of the 69-byte payload): 2026-05-05 23:25:47 UTC. The strap reports
// data on flash back to this point, so this is the rewind target until
// we have a date picker.
const REWIND_TARGET_UNIX_TS = 1778025947

function tsMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

export const DebugInspectorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const { selectedDate, refreshDashboard } = useDashboard()
  const ble = useBle()
  const {
    syncNow,
    rebootStrap,
    powerCycleStrap,
    probeDataRange,
    rewindAndResync,
    forceTrimRewindAndSync,
    whoopsiInitThenForceTrim,
  } = ble

  const queueStats = useOutboundQueueStats()
  const { expert, handleLongPress } = useExpertMode()

  const [overview, setOverview] = useState<DebugOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())
  const [daemonStats, setDaemonStats] = useState(getContinuousSyncStats)
  const [telemetry, setTelemetry] = useState(getSyncTelemetry)

  // Tick once a second so chip sub-text (ages, "synced Nm ago") stays fresh.
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now())
      setDaemonStats(getContinuousSyncStats())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Subscribe to telemetry so apiFailures / detectedGaps / syncSessions
  // update in real time without polling.
  useEffect(() => {
    const unsub = subscribeSyncTelemetry(() => setTelemetry(getSyncTelemetry()))
    return unsub
  }, [])

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
      await fetchDebugPipelineRuns(1)
    } catch {
      /* swallow */
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

  const handleClearQueue = useCallback(async () => {
    try {
      const db = openDatabase()
      const purged = await purgeOutboundQueue(db)
      setBanner(`Cleared ${purged} queue rows.`)
      await refreshInspector()
    } catch (err: any) {
      setError(err?.message ?? "Failed to clear queue")
    }
  }, [refreshInspector])

  const handleForceUpload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setBanner(null)
    try {
      const db = openDatabase()
      const result = await runForceUpload(db, {
        post: (tableName, payloads) =>
          apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }, 60_000),
        onProgress: (progress) => {
          setBanner(
            `Uploading ${progress.tableName} (${progress.batchSize})… ${progress.uploaded}/${progress.total}`,
          )
        },
      })
      if (result.depthAfter === 0 && result.uploaded === 0 && !result.error) {
        setBanner("Queue empty — nothing to upload.")
      } else if (result.error) {
        setError(`Upload failed after ${result.uploaded}: ${result.error}`)
      } else {
        setBanner(
          `Uploaded ${result.uploaded}. ${result.depthAfter} queued. ${result.deadCount} dead.`,
        )
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
        setBanner("Pipeline skipped — no new input.")
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
    Alert.alert("Reboot strap?", "Sends a soft-reboot over BLE.", [
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
    ])
  }, [rebootStrap])

  const handlePowerCycleStrap = useCallback(() => {
    Alert.alert("Power-cycle strap?", "Firmware-level power-cycle.", [
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
    ])
  }, [powerCycleStrap])

  const handleRewind = useCallback(
    async (shape: "ts" | "ack" | "bare") => {
      setError(null)
      setBanner(`Rewind ${shape}…`)
      try {
        await rewindAndResync(REWIND_TARGET_UNIX_TS, shape)
        await refreshDashboard()
        await refreshInspector()
        setBanner(`Rewind ${shape} complete.`)
      } catch (e: any) {
        setError(`Rewind ${shape} failed: ${e?.message ?? "unknown error"}`)
      }
    },
    [refreshDashboard, refreshInspector, rewindAndResync],
  )

  const handleForceTrim = useCallback(
    (framing: "legacy" | "maverick") => {
      Alert.alert(
        `FORCE_TRIM(0, 0) [${framing}]?`,
        `Sends cmd 25 with payload (0, 0) in ${framing} framing.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Force Trim",
            style: "destructive",
            onPress: async () => {
              setError(null)
              setBanner(`FORCE_TRIM(0,0) [${framing}]…`)
              try {
                const result = await forceTrimRewindAndSync(0, 0, framing)
                setBanner(result.rewound ? "✓ REWOUND" : "✗ no movement")
              } catch (e: any) {
                setError(`FORCE_TRIM failed: ${e?.message ?? "unknown error"}`)
              }
            },
          },
        ],
      )
    },
    [forceTrimRewindAndSync],
  )

  const handleWhoopsiInit = useCallback(() => {
    Alert.alert("Whoopsi init + FORCE_TRIM?", "Full Maverick handshake then FORCE_TRIM(0,0).", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Run",
        style: "destructive",
        onPress: async () => {
          setError(null)
          setBanner("Whoopsi init + FORCE_TRIM…")
          try {
            const result = await whoopsiInitThenForceTrim()
            setBanner(result.rewound ? "✓ REWOUND" : "✗ no movement")
          } catch (e: any) {
            setError(`Whoopsi init failed: ${e?.message ?? "unknown error"}`)
          }
        },
      },
    ])
  }, [whoopsiInitThenForceTrim])

  const handleProbeDataRange = useCallback(async () => {
    setError(null)
    setBanner("Probing strap data range…")
    try {
      const result = await probeDataRange()
      Alert.alert(
        "GetDataRange",
        `hex (${result.raw.length}B):\n${result.hex}\n\n${result.decoded}`,
      )
      setBanner(`Probe ok — ${result.raw.length}B`)
    } catch (e: any) {
      setError(e?.message ?? "Probe failed")
    }
  }, [probeDataRange])

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  const coveragePercent =
    overview?.todayCoverageMinutes != null
      ? Math.min(100, Math.max(0, (overview.todayCoverageMinutes / 1440) * 100))
      : 0

  const lastSyncAt = tsMs(overview?.latestRawUpdatedAt ?? null)
  const lastStreamAt = tsMs(overview?.latestSignalSampleAt ?? null)

  // Treat 2+ apiFailures within last 5 min as "consecutive" for chip purposes.
  const consecutiveApiFailures = (() => {
    const recent = telemetry.apiFailures.filter((f) => nowMs - f.at < 5 * 60_000)
    return recent.length
  })()

  const strapConn: "ready" | "connecting" | "disconnected" =
    ble.connectionState === "ready"
      ? "ready"
      : ble.connectionState === "disconnected"
        ? "disconnected"
        : "connecting"

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBackground }} edges={["top"]}>
      <Animated.ScrollView
        contentContainerStyle={$container}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void refreshInspector()}
            tintColor={colors.tint}
          />
        }
      >
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={handleLongPress}
          delayLongPress={600}
          style={{ marginBottom: 14 }}
        >
          <Text
            text="Inspector"
            size="lg"
            weight="semiBold"
            style={{ color: expert ? "#fbbf24" : colors.text }}
          />
          <Text
            text={expert ? "EXPERT" : "long-press for expert"}
            size="xxs"
            style={{ color: expert ? "#fbbf24" : colors.iconDim, paddingTop: 2 }}
          />
        </TouchableOpacity>

        {error ? (
          <View
            style={{
              backgroundColor: colors.errorBackground,
              padding: 10,
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text text={error} size="xs" weight="semiBold" style={{ color: colors.error }} />
          </View>
        ) : null}
        {banner ? (
          <View
            style={{
              backgroundColor: colors.surfaceElevated,
              padding: 10,
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text text={banner} size="xs" weight="semiBold" style={{ color: colors.text }} />
          </View>
        ) : null}

        <HealthStrip
          strap={{
            connectionState: strapConn,
            isWorn: ble.isWorn,
            batteryLevel: ble.batteryLevel,
            lastStreamAt,
            backlogChunks: 0,
            nowMs,
          }}
          phone={{
            daemonRunning: daemonStats.isRunning,
            lastTickAt: daemonStats.lastTickAt,
            daemonTicks: daemonStats.ticks,
            nowMs,
            appErrorsLast5min: 0,
          }}
          backend={{
            queueDepth: queueStats.depth ?? 0,
            queueDead: queueStats.deadCount ?? 0,
            lastSyncAt,
            consecutiveApiFailures,
            nowMs,
          }}
          coveragePercent={coveragePercent}
          onTapPhone={() => setDrilldownOpen((v) => !v)}
        />

        {ble.isSyncing ? <SyncProgressCard /> : null}

        <EventsCard
          events={buildEvents({
            apiFailures: telemetry.apiFailures,
            detectedGaps: telemetry.detectedGaps,
            syncSessions: telemetry.syncSessions,
            lastPipelineRunAt: telemetry.lastPipelineRunAt,
            lastPipelineDurationMs: telemetry.lastPipelineDurationMs,
            daemonRunning: daemonStats.isRunning,
            lastTickAt: daemonStats.lastTickAt,
            nowMs,
          })}
        />

        <DaemonDrilldown
          visible={drilldownOpen}
          ticks={daemonStats.ticks}
          skippedBusy={daemonStats.skippedBusy}
          skippedDisconnected={daemonStats.skippedDisconnected}
          intervalMs={DEFAULT_INTERVAL_MS}
          running={daemonStats.isRunning}
        />

        <LogsCard />

        <ActionsRow
          isSyncing={ble.isSyncing}
          queueDepth={queueStats.depth ?? 0}
          onSync={handleSync}
          onRefresh={() => void refreshInspector()}
          onClearQueue={handleClearQueue}
          onForceUpload={handleForceUpload}
        />

        {expert ? (
          <ExpertActions
            onProbeRange={handleProbeDataRange}
            onRunPipeline={handleRunPipeline}
            onOpenWebInspector={() => openLinkInBrowser(INSPECTOR_WEB_URL)}
            onRewindTs={() => handleRewind("ts")}
            onRewindAck={() => handleRewind("ack")}
            onRewindBare={() => handleRewind("bare")}
            onWhoopsiInit={handleWhoopsiInit}
            onForceTrimLegacy={() => handleForceTrim("legacy")}
            onForceTrimMaverick={() => handleForceTrim("maverick")}
            onRebootStrap={handleRebootStrap}
            onPowerCycleStrap={handlePowerCycleStrap}
          />
        ) : null}

        {isLoading && !overview ? (
          <View style={{ paddingVertical: 14, alignItems: "center" }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : null}
      </Animated.ScrollView>
    </SafeAreaView>
  )
}

const $container: ViewStyle = {
  paddingHorizontal: 14,
  paddingTop: 24,
  paddingBottom: 100,
  gap: 12,
}
