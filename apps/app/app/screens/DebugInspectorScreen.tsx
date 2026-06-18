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
import { AckResponsesCard } from "@/components/Inspector/AckResponsesCard"
import { DbSnapshotCard } from "@/components/Inspector/DbSnapshotCard"
import { ExpertActions } from "@/components/Inspector/ExpertActions"
import { HealthStrip } from "@/components/Inspector/HealthStrip"
import { LogsCard } from "@/components/Inspector/LogsCard"
import { SyncProgressCard } from "@/components/Inspector/SyncProgressCard"
import { useExpertMode } from "@/components/Inspector/useExpertMode"
import { Text } from "@/components/Text"
import { useBle } from "@/context/BleContext"
import { useSyncIsRunning } from "@/stores/syncStore"
import { useDashboard } from "@/context/DashboardContext"
import { openDatabase } from "@/services/db"
import { peekActiveUserId } from "@/services/db/session"
import { getRawCoverageForDay } from "@/services/db/repositories/rawSensorRecord"
import { runDeviceComputeForDay } from "@/services/compute/runDeviceCompute"
import {
  DEFAULT_INTERVAL_MS,
  getContinuousSyncStats,
} from "@/services/sync/continuousSyncDaemon"
import {
  getSyncTelemetry,
  recordPipelineRun,
  subscribeSyncTelemetry,
} from "@/services/sync/syncTelemetry"
import { LOCAL_THEME } from "@/utils/localTheme"

// Earliest timestamp confirmed in the GetDataRange response (offset 35
// of the 69-byte payload): 2026-05-05 23:25:47 UTC. The strap reports
// data on flash back to this point, so this is the rewind target until
// we have a date picker.
const REWIND_TARGET_UNIX_TS = 1778025947

export const DebugInspectorScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const { selectedDate, refreshDashboard } = useDashboard()
  const ble = useBle()
  const isSyncing = useSyncIsRunning()
  const {
    syncNow,
    rebootStrap,
    powerCycleStrap,
    probeDataRange,
    rewindAndResync,
    forceTrimRewindAndSync,
    whoopsiInitThenForceTrim,
  } = ble

  const { expert, handleLongPress } = useExpertMode()

  const [coverage, setCoverage] = useState<{
    latestTimestampMs: number | null
    coverageMinutes: number
  }>({ latestTimestampMs: null, coverageMinutes: 0 })
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
      const db = openDatabase()
      const [y, m, d] = selectedDate.split("-").map(Number)
      const dayStartMs = new Date(y, m - 1, d).getTime()
      setCoverage(await getRawCoverageForDay(db, dayStartMs))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load inspector data.")
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

  const handleRunPipeline = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const started = Date.now()
    try {
      const userId = peekActiveUserId()
      if (!userId) {
        setError("No active user — cannot run compute.")
        return
      }
      const db = openDatabase()
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const ok = await runDeviceComputeForDay(db, userId, selectedDate, tz)
      recordPipelineRun(started, Date.now() - started)
      setBanner(
        ok
          ? "Local compute reran for the selected day."
          : "No input to compute for the selected day.",
      )
      await refreshDashboard()
      await refreshInspector()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Local compute failed.")
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

  const coveragePercent = Math.min(100, Math.max(0, (coverage.coverageMinutes / 1440) * 100))
  const lastStreamAt = coverage.latestTimestampMs

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
          coveragePercent={coveragePercent}
          onTapPhone={() => setDrilldownOpen((v) => !v)}
        />

        {isSyncing ? <SyncProgressCard /> : null}

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
          isSyncing={isSyncing}
          onSync={handleSync}
          onRefresh={() => void refreshInspector()}
        />

        {expert ? <AckResponsesCard /> : null}

        {expert ? <DbSnapshotCard /> : null}

        {expert ? (
          <ExpertActions
            onProbeRange={handleProbeDataRange}
            onRunPipeline={handleRunPipeline}
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

        {isLoading && lastStreamAt === null ? (
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
  paddingTop: 12,
  paddingBottom: 100,
  gap: 12,
}
