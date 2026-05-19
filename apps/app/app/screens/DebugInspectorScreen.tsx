import { FC, useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, RefreshControl, View, ViewStyle } from "react-native"
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { ActionsCard } from "@/components/Inspector/ActionsCard"
import { SyncProgressCard } from "@/components/Inspector/SyncProgressCard"
import { DiagnosticsCard } from "@/components/Inspector/DiagnosticsCard"
import { LogsCard } from "@/components/Inspector/LogsCard"
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
  const ble = useBle()
  const { syncNow, rebootStrap, powerCycleStrap, probeDataRange, rewindAndResync, probeRewindProbe, probeRewindVerbose, forceTrimRewindAndSync, whoopsiInitThenForceTrim } = ble

  // Earliest timestamp confirmed in the GetDataRange response (offset 35
  // of the 69-byte payload): 2026-05-05 23:25:47 UTC. The strap reports
  // data on flash back to this point, so this is the rewind target until
  // we have a date picker.
  const REWIND_TARGET_UNIX_TS = 1778025947
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
          apiPost(`/pipeline/ingest-table`, { tableName, rows: payloads }, 60_000),
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

  const handleRewind = useCallback(
    async (shape: "ts" | "ack" | "bare") => {
      setError(null)
      setBanner(`Rewind ${shape} → re-syncing from ${new Date(REWIND_TARGET_UNIX_TS * 1000).toISOString().slice(0, 16).replace("T", " ")}…`)
      try {
        await rewindAndResync(REWIND_TARGET_UNIX_TS, shape)
        await refreshDashboard()
        await refreshInspector()
        setBanner(`Rewind ${shape} complete. Check Metro logs for record counts.`)
      } catch (e: any) {
        setError(`Rewind ${shape} failed: ${e?.message ?? "unknown error"}`)
      }
    },
    [refreshDashboard, refreshInspector, rewindAndResync],
  )

  const handleProbeRewindProbe = useCallback(
    async (sector: number, offset: number) => {
      setError(null)
      setBanner(`A/B/A: GetDataRange → SetReadPointer(${sector},${offset}) → GetDataRange…`)
      try {
        const result = await probeRewindProbe(sector, offset)
        const verdict = result.movedStart
          ? "✓ READ POINTER MOVED"
          : "✗ no movement"
        Alert.alert(
          `Probe (sector=${sector}, offset=${offset})`,
          `BEFORE:\n${result.before}\n\nSetReadPointer response:\n${result.response}\n\nAFTER:\n${result.after}\n\n${verdict}`,
        )
        setBanner(
          `${verdict} — ${result.before} → ${result.after}`,
        )
      } catch (e: any) {
        setError(`Probe failed: ${e?.message ?? "unknown error"}`)
      }
    },
    [probeRewindProbe],
  )

  const handleForceTrimRewindWithFraming = useCallback(
    (framing: "legacy" | "maverick") => {
      Alert.alert(
        `FORCE_TRIM(0, 0) [${framing}]?`,
        `Sends WHOOP cmd 25 with payload (sector=0, offset=0) in ${framing} framing, then re-syncs if the read pointer moves. Per whoopsi, this only exposes the wrap-around segment of flash. The dangerous 0xFEFEFEFE 'Trim All' sentinel is hard-rejected.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Force Trim",
            style: "destructive",
            onPress: async () => {
              setError(null)
              setBanner(`Probe → FORCE_TRIM(0,0) [${framing}] → Probe → Sync (if rewound)…`)
              try {
                const result = await forceTrimRewindAndSync(0, 0, framing)
                const verdict = result.rewound ? "✓ REWOUND, syncing" : "✗ no movement"
                Alert.alert(
                  `FORCE_TRIM(0, 0) [${framing}]`,
                  `BEFORE:\n${result.before}\n\nFORCE_TRIM response:\n${result.trimResponse}\n\nAFTER:\n${result.after}\n\n${verdict}`,
                )
                setBanner(`${verdict} — ${result.before} → ${result.after}`)
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

  const handleForceTrimRewind = useCallback(
    () => handleForceTrimRewindWithFraming("legacy"),
    [handleForceTrimRewindWithFraming],
  )
  const handleForceTrimRewindMaverick = useCallback(
    () => handleForceTrimRewindWithFraming("maverick"),
    [handleForceTrimRewindWithFraming],
  )

  const handleWhoopsiInitThenForceTrim = useCallback(() => {
    Alert.alert(
      "Whoopsi full init + FORCE_TRIM?",
      "Mimics whoopsi's complete connect+sync init sequence end-to-end: ABORT_HISTORICAL → GET_HELLO_EXT (Maverick) → battery → GET_DATA_RANGE → FORCE_TRIM(0,0) → GET_DATA_RANGE. Triggers syncNow on backward cursor movement. Hypothesis: strap gates FORCE_TRIM behind the Maverick identity handshake we've been skipping.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Run",
          style: "destructive",
          onPress: async () => {
            setError(null)
            setBanner("Running whoopsi init + FORCE_TRIM…")
            try {
              const result = await whoopsiInitThenForceTrim()
              const verdict = result.rewound ? "✓ REWOUND, syncing" : "✗ no movement"
              Alert.alert(
                "Whoopsi init + FORCE_TRIM result",
                `GET_HELLO_EXT response:\n${result.helloExtResponse}\n\nBEFORE:\n${result.before}\n\nFORCE_TRIM response:\n${result.trimResponse}\n\nAFTER:\n${result.after}\n\n${verdict}`,
              )
              setBanner(`${verdict} — ${result.before} → ${result.after}`)
            } catch (e: any) {
              setError(`Whoopsi init failed: ${e?.message ?? "unknown error"}`)
            }
          },
        },
      ],
    )
  }, [whoopsiInitThenForceTrim])

  const handleProbeRewindVerbose = useCallback(async () => {
    setError(null)
    setBanner("Verbose probe: capturing all packets for 5s after SetReadPointer(10,0)…")
    try {
      const result = await probeRewindVerbose(10, 0, 5000)
      // Show packet count in banner; the full per-packet table is in
      // Metro logs (one console.log per packet for easy copy/paste).
      setBanner(
        `Verbose capture done: ${result.packetCount} packets in 5s. See Metro logs for the table.`,
      )
    } catch (e: any) {
      setError(`Verbose probe failed: ${e?.message ?? "unknown error"}`)
    }
  }, [probeRewindVerbose])

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

  const handleRecoverBacklog = useCallback(() => {
    Alert.alert(
      "Recover backlog? (experimental)",
      "Runs the full WHOOPSI init sequence (HELLO_EXT Maverick + battery probes + GET_DATA_RANGE) then FORCE_TRIM(0,0) Maverick. Per the open hypothesis from the #89 RE notes, the strap may gate FORCE_TRIM behind a Maverick identity handshake we usually skip — this is the path we never fully tested. If it works the cursor rewinds and a full resync runs; skip-enqueue dedups already-synced rows so only the gaps fill. If it doesn't, the result alert will say 'no movement' and nothing is touched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Try Recovery",
          style: "destructive",
          onPress: async () => {
            setError(null)
            setBanner("WHOOPSI init → FORCE_TRIM(0,0) → probe → resync (if rewound)…")
            try {
              const result = await whoopsiInitThenForceTrim()
              const verdict = result.rewound
                ? "Rewound ✓ — sync started"
                : "No movement — WHOOPSI-gated FORCE_TRIM didn't move the cursor either"
              Alert.alert(
                "Recover Backlog (WHOOPSI init)",
                `GET_HELLO_EXT:\n${result.helloExtResponse}\n\nBefore:\n${result.before}\n\nFORCE_TRIM response:\n${result.trimResponse}\n\nAfter:\n${result.after}\n\n${verdict}`,
              )
              setBanner(verdict)
              await refreshInspector()
            } catch (e: any) {
              setError(`Recover failed: ${e?.message ?? "unknown error"}`)
            }
          },
        },
      ],
    )
  }, [whoopsiInitThenForceTrim, refreshInspector])

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

  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

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
        <SyncProgressCard />
        <DiagnosticsCard overview={overview} lastPipelineRun={lastPipelineRun} />
        <LogsCard />
        <ActionsCard
          isSyncing={ble.isSyncing}
          onSync={handleSync}
          onForceUpload={handleForceUpload}
          onRunPipeline={handleRunPipeline}
          onRefreshView={() => void refreshInspector()}
          onRebootStrap={handleRebootStrap}
          onPowerCycleStrap={handlePowerCycleStrap}
          onClearQueue={handleClearQueue}
          onOpenWebInspector={() => openLinkInBrowser(INSPECTOR_WEB_URL)}
          onProbeDataRange={handleProbeDataRange}
          onRewindTs={() => handleRewind("ts")}
          onRewindAck={() => handleRewind("ack")}
          onRewindBare={() => handleRewind("bare")}
          onProbeRewindSector0={() => handleProbeRewindProbe(0, 0)}
          onProbeRewindSector10={() => handleProbeRewindProbe(10, 0)}
          onProbeRewindVerbose={handleProbeRewindVerbose}
          onForceTrimRewind={handleForceTrimRewind}
          onForceTrimRewindMaverick={handleForceTrimRewindMaverick}
          onWhoopsiInitThenForceTrim={handleWhoopsiInitThenForceTrim}
          onRecoverBacklog={handleRecoverBacklog}
        />

        {isLoading && !overview ? (
          <View style={{ paddingVertical: 14, alignItems: "center" }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : null}
      </Animated.ScrollView>
    </SafeAreaView>
  )
}

// Tab-respecting layout: top edge is SafeArea, bottom is left to the
// native tab bar (so content scrolls past it under the translucent
// blur). paddingBottom is the runway so the last action button isn't
// glued to the tab strip.
const $container: ViewStyle = {
  paddingHorizontal: 14,
  paddingTop: 24,
  paddingBottom: 100,
  gap: 12,
}
