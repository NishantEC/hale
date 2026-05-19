import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AppState } from "react-native"

import { storage } from "@/utils/storage"

import {
  awaitCommandResponse,
  AwaitableResponse,
  bleManager,
  CMD_FROM_STRAP_UUID,
  DATA_FROM_STRAP_UUID,
  EVENTS_FROM_STRAP_UUID,
  CommandNumber,
  CommandService,
  ConnectionState,
  ConsoleLogLineForwarder,
  createCommandResponseForwarder,
  createEventForwarder,
  createImuForwarder,
  DownloadProgress,
  EventNumber,
  HistoryDownloader,
  PacketType,
  parseIMUPacket,
  RealtimeSessionForwarder,
  ScannedDevice,
  uint8ArrayToBase64,
  WhoopPacket,
} from "@/services/ble"
import { runBackgroundDrain } from "@/services/sync/backgroundSync"
import {
  startContinuousSyncDaemon,
  stopContinuousSyncDaemon,
} from "@/services/sync/continuousSyncDaemon"
import {
  startAndroidForegroundService,
  stopAndroidForegroundService,
} from "@/services/sync/androidForegroundService"
import { historicalRecordToRawRow, ingestBleRecords } from "@/services/sync/bleIngest"
import { shouldRunPipelineAfterSync } from "@/services/sync/pipelineTrigger"
import {
  decideContinueSync,
  DEFAULT_CAUGHT_UP_WINDOW_MS,
  DEFAULT_MAX_ITERATIONS,
} from "@/services/sync/syncLoop"
import { runPipeline, fetchResults, SeriesPoint } from "@/services/api/noopClient"
import { openDatabase } from "@/services/db"
import { useDashboard } from "@/context/DashboardContext"
import { useAuth } from "@/context/AuthContext"
// Battery parsers live in a separate module so they can be unit-tested
// without dragging in BleProvider's dependency graph.
import {
  parseBatteryLevel,
  parseBatteryLevelEvent,
  parseExtendedBatteryEvent,
} from "@/services/ble/battery-parsers"

const LAST_SYNC_KEY = "noop.lastSyncTimestamp"
const REALTIME_HR_KEY = "noop.prefersRealtimeHeartRate"
const BROADCAST_HR_KEY = "noop.prefersBroadcastHeartRate"
const RAW_STREAM_KEY = "noop.prefersRawDataStream"

export type SyncSummary = {
  nights: number
  stages: number
  scores: number
}

type BleDeviceState = {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  batteryVoltageMv: number | null
  batteryTemperatureC: number | null
  batteryIconLevel: number | null
  isCharging: boolean
  isBusy: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
}

export type BleContextValue = {
  connectionState: ConnectionState
  deviceName: string | null
  batteryLevel: number | null
  batteryVoltageMv: number | null
  batteryTemperatureC: number | null
  batteryIconLevel: number | null
  isCharging: boolean
  isBusy: boolean
  isRealtimeHeartRateEnabled: boolean
  isBroadcastHeartRateEnabled: boolean
  isRawDataStreamingEnabled: boolean
  realtimeHeartRate: number | null
  realtimeSamples: SeriesPoint[]
  liveStressLevel: number | null
  strapAlarmAt: string | null
  strapAlarmArmed: boolean
  isWorn: boolean
  lastSyncAt: string | null
  firmwareVersion: string | null
  deviceClock: Date | null
  scannedDevices: ScannedDevice[]
  isSyncing: boolean
  syncStage: string
  syncProgress: DownloadProgress | null
  syncSummary: SyncSummary | null
  // Strap-time window of the most recent persisted batch (updates each HistoryEnd).
  lastBatchWindow: { oldestMs: number; newestMs: number; batchSize: number } | null
  // Backend pipeline state — independent of isSyncing so the Sync button can
  // re-enable as soon as the strap → SQLite leg finishes.
  pipelineState: "idle" | "running" | "success" | "failed"
  lastPipelineAt: string | null
  // Loop progress inside a single Sync tap. A single download session pulls
  // one strap-decided window; syncNow loops until the cursor catches up or
  // a safety cap fires.
  syncIteration: number
  syncIterationCap: number
  syncLastStopReason: string | null
  error: string | null
  scan: () => Promise<void>
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  refreshStrapMetadata: () => Promise<void>
  toggleRealtimeHeartRate: (enabled: boolean) => Promise<void>
  toggleBroadcastHeartRate: (enabled: boolean) => Promise<void>
  toggleRawDataStreaming: (enabled: boolean) => Promise<void>
  armAlarm: () => Promise<void>
  disarmAlarm: () => Promise<void>
  testAlarm: () => Promise<void>
  rebootStrap: () => Promise<void>
  powerCycleStrap: () => Promise<void>
  probeDataRange: () => Promise<{ raw: number[]; hex: string; decoded: string }>
  rewindAndResync: (unixTs: number, shape: "ts" | "ack" | "bare") => Promise<void>
  probeRewindProbe: (
    sector: number,
    offset: number,
  ) => Promise<{ before: string; response: string; after: string; movedStart: boolean }>
  probeRewindVerbose: (
    sector: number,
    offset: number,
    listenMs?: number,
  ) => Promise<{ packetCount: number; packets: string[] }>
  forceTrimRewindAndSync: (
    sector: number,
    offset: number,
    framing?: "legacy" | "maverick",
  ) => Promise<{ before: string; trimResponse: string; after: string; rewound: boolean }>
  whoopsiInitThenForceTrim: () => Promise<{
    helloExtResponse: string
    before: string
    trimResponse: string
    after: string
    rewound: boolean
  }>
  clearError: () => void
}

const BleContext = createContext<BleContextValue | null>(null)

const commandService = new CommandService()
const eventForwarder = createEventForwarder()
// Both forwarders are write-only as of this session — IMU produces
// ~45M rows/day per active strap with no downstream reader, and
// command-responses captures every cmd response (low volume, but no
// consumer yet either). Default off until a reader/retention exists.
// Set EXPO_PUBLIC_ENABLE_IMU_INGEST=1 / EXPO_PUBLIC_ENABLE_CMD_RESP_INGEST=1
// to turn back on locally.
const IMU_INGEST_ENABLED = process.env.EXPO_PUBLIC_ENABLE_IMU_INGEST === "1"
const CMD_RESP_INGEST_ENABLED = process.env.EXPO_PUBLIC_ENABLE_CMD_RESP_INGEST === "1"
const commandResponseForwarder = createCommandResponseForwarder()
const imuForwarder = createImuForwarder()
const consoleLogForwarder = new ConsoleLogLineForwarder()
const realtimeForwarder = new RealtimeSessionForwarder()

const emptyDeviceState: BleDeviceState = {
  connectionState: "disconnected",
  deviceName: null,
  batteryLevel: null,
  batteryVoltageMv: null,
  batteryTemperatureC: null,
  batteryIconLevel: null,
  isCharging: false,
  isBusy: false,
  isRealtimeHeartRateEnabled: true,
  isBroadcastHeartRateEnabled: true,
  isRawDataStreamingEnabled: true,
  realtimeHeartRate: null,
  realtimeSamples: [],
  strapAlarmAt: null,
  strapAlarmArmed: false,
  isWorn: true,
  lastSyncAt: null,
  firmwareVersion: null,
  deviceClock: null,
}

function parseUint32LE(data: Uint8Array, offset: number) {
  if (offset + 3 >= data.length) return null
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  )
}

function readUint16LE(data: Uint8Array, offset: number) {
  if (offset + 1 >= data.length) return null
  return data[offset] | (data[offset + 1] << 8)
}


function parseVersionInfo(packet: WhoopPacket): string | null {
  if (packet.command !== CommandNumber.ReportVersionInfo) return null
  if (packet.data.length < 3 + 8 * 4) return null
  const values: number[] = []
  for (let i = 0; i < 8; i++) {
    const v = parseUint32LE(packet.data, 3 + i * 4)
    if (v == null) return null
    values.push(v)
  }
  const harvard = values.slice(0, 4).join(".")
  const boylston = values.slice(4, 8).join(".")
  return `${harvard} / ${boylston}`
}

function parseDeviceClock(packet: WhoopPacket): Date | null {
  if (packet.command !== CommandNumber.GetClock || packet.data.length < 6) return null
  const unix = parseUint32LE(packet.data, 2)
  if (unix == null || unix === 0) return null
  return new Date(unix * 1000)
}

function parseScheduledAlarm(packet: WhoopPacket, now = new Date()) {
  if (packet.command !== CommandNumber.GetScheduledAlarm) return null

  const nowUnix = Math.floor(now.getTime() / 1000)
  const lowerBound = nowUnix - 365 * 24 * 60 * 60
  const upperBound = nowUnix + 365 * 24 * 60 * 60

  for (let offset = 0; offset <= Math.min(16, packet.data.length - 4); offset += 1) {
    const value = parseUint32LE(packet.data, offset)
    if (value == null) continue
    if (value === 0) continue
    if (value >= lowerBound && value <= upperBound) {
      return new Date(value * 1000).toISOString()
    }
  }

  return null
}

// 0..3 stress proxy from rolling-mean HR over the live sample window.
// Baseline is sourced from BaselineProfile.restingHeartRate (per-user)
// via dashboard's homeView.activities.baselineRhr; defaults to 60 only
// if no baseline is available yet (cold-start / not enough nights).
const LIVE_STRESS_RESTING_BPM_DEFAULT = 60
function deriveLiveStressLevel(
  samples: SeriesPoint[],
  restingBpm: number = LIVE_STRESS_RESTING_BPM_DEFAULT,
): number | null {
  if (samples.length === 0) return null
  const tail = samples.slice(-15)
  const mean = tail.reduce((s, p) => s + p.value, 0) / tail.length
  const delta = mean - restingBpm
  if (delta < 10) return 0
  if (delta < 25) return 1
  if (delta < 50) return 2
  return 3
}

function parseRealtimeHeartRate(packet: WhoopPacket) {
  if (packet.type !== PacketType.RealtimeData || packet.data.length <= 5) return null
  const heartRate = packet.data[5]
  return heartRate > 0 ? heartRate : null
}

function nextAlarmDate(alarmMinutes: number) {
  const now = new Date()
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(alarmMinutes / 60),
    alarmMinutes % 60,
    0,
    0,
  )
  if (next <= now) next.setDate(next.getDate() + 1)
  return next
}

export const BleProvider: FC<PropsWithChildren> = ({ children }) => {
  const { refreshDashboard, sleepView, homeView } = useDashboard()
  const { isAuthenticated } = useAuth()

  const [deviceState, setDeviceState] = useState<BleDeviceState>(emptyDeviceState)
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const isSyncingRef = useRef(false)
  // Stable handle to the latest syncNow for the continuous-sync daemon.
  // syncNow is recreated on each render via useCallback so we can't capture
  // it in a setInterval closure directly.
  const syncNowRef = useRef<() => Promise<void>>(async () => {})
  // Did the LAST syncNow tear down the strap session cleanly? If yes, the
  // next tap can skip the AbortHistoricalTransmits preflight entirely —
  // sending it gratuitously was the cause of the 05/17 multi-gap pattern
  // (the strap appears to advance its read pointer past chunks it had
  // queued for delivery but never got to send before we aborted). The
  // preflight is only valuable when the prior session crashed mid-stream.
  const lastSyncCleanRef = useRef(true)
  const [syncStage, setSyncStage] = useState("")
  const [syncProgress, setSyncProgress] = useState<DownloadProgress | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  // Newest / oldest strap-time observed in the most recent persisted batch.
  // Updated from persistBatch on each HistoryEnd so the Inspector can show
  // "currently processing strap-time X" without us needing to poll the DB.
  const [lastBatchWindow, setLastBatchWindow] = useState<{
    oldestMs: number
    newestMs: number
    batchSize: number
  } | null>(null)
  const [pipelineState, setPipelineState] = useState<
    "idle" | "running" | "success" | "failed"
  >("idle")
  const [lastPipelineAt, setLastPipelineAt] = useState<string | null>(null)
  const isPipelineRunningRef = useRef(false)
  const lastPipelineAtRef = useRef<number>(0)
  const [syncIteration, setSyncIteration] = useState(0)
  const [syncLastStopReason, setSyncLastStopReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastAutoSyncAttemptAt = useRef<number>(0)

  const clearError = useCallback(() => setError(null), [])

  // Cheap reads only. Safe to call on every screen focus.
  const refreshDeviceState = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildGetBatteryLevel())
      await bleManager.writeCommand(commandService.buildGetHelloHarvard())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      await bleManager.writeCommand(commandService.buildReportVersionInfo())
      await bleManager.writeCommand(commandService.buildGetClock())
    } catch {
      // Best-effort.
    }
  }, [])

  // Sticky modes — Realtime HR, generic HR profile, raw data streaming —
  // are remembered by the strap firmware. Re-issuing them costs BLE round
  // trips and can re-init the optical sensor. Call this exactly once per
  // connect (or when the user explicitly toggles a setting elsewhere).
  const bootstrapStrapModes = useCallback(async () => {
    if (bleManager.connectionState !== "ready") return
    try {
      await bleManager.writeCommand(commandService.buildToggleRealtimeHR(true))
      await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(true))
      await bleManager.writeCommand(commandService.buildStartRawData())
    } catch {
      // Best-effort.
    }
  }, [])

  const persistPreference = useCallback((key: string, value: boolean) => {
    storage.set(key, JSON.stringify(value))
  }, [])

  const scan = useCallback(async () => {
    setError(null)
    setScannedDevices([])
    try {
      const allowed = await bleManager.requestPermissions()
      if (!allowed) {
        throw new Error("Bluetooth permission was denied")
      }
      await bleManager.startScan((device) => {
        setScannedDevices((current) => {
          if (current.some((candidate) => candidate.id === device.id)) return current
          return [...current, device]
        })
      })
    } catch (nextError: any) {
      setError(nextError?.message ?? "Unable to scan for WHOOP devices")
    }
  }, [])

  const connect = useCallback(
    async (deviceId: string) => {
      setError(null)
      try {
        await bleManager.connect(deviceId)
        // Reconnect resets the strap's transmit state — anything that
        // was unclean before the disconnect is gone now. Allow the next
        // syncNow to skip the preflight.
        lastSyncCleanRef.current = true
        setDeviceState((current) => ({
          ...current,
          deviceName: bleManager.getDeviceName() || "WHOOP",
        }))
        await bootstrapStrapModes()
        await refreshDeviceState()
      } catch (nextError: any) {
        setError(nextError?.message ?? "Connection failed")
      }
    },
    [bootstrapStrapModes, refreshDeviceState],
  )

  const disconnect = useCallback(async () => {
    await bleManager.disconnect()
  }, [])

  // Fire-and-forget pipeline + view refresh. Sync UX completes as soon as the
  // strap → SQLite leg finishes; the backend pipeline runs on its own clock.
  // Throttled so a rapid burst of small syncs doesn't trigger a 10–25s
  // backend pipeline every time.
  const runPipelineInBackground = useCallback(
    (persistedCount: number) => {
      const msSinceLastRun =
        lastPipelineAtRef.current === 0
          ? Number.POSITIVE_INFINITY
          : Date.now() - lastPipelineAtRef.current
      if (
        !shouldRunPipelineAfterSync({
          persistedCount,
          isCurrentlyRunning: isPipelineRunningRef.current,
          msSinceLastRun,
        })
      ) {
        console.log(
          `[syncNow] skipping background pipeline (persisted=${persistedCount}, msSinceLastRun=${
            Number.isFinite(msSinceLastRun) ? Math.round(msSinceLastRun / 1000) + "s" : "first"
          }, running=${isPipelineRunningRef.current})`,
        )
        return
      }
      isPipelineRunningRef.current = true
      lastPipelineAtRef.current = Date.now()
      setPipelineState("running")
      void (async () => {
        try {
          await runPipeline()
          const results = await fetchResults()
          setSyncSummary({
            nights: results.sleepDetections?.length ?? 0,
            stages: results.sleepStages?.length ?? 0,
            scores: results.dailyScores?.length ?? 0,
          })
          await refreshDashboard()
          setPipelineState("success")
          setLastPipelineAt(new Date().toISOString())
        } catch (err: any) {
          console.warn(
            "[syncNow] background pipeline/fetchResults failed:",
            err?.message ?? err,
          )
          setPipelineState("failed")
        } finally {
          isPipelineRunningRef.current = false
        }
      })()
    },
    [refreshDashboard],
  )

  const syncNow = useCallback(async () => {
    console.log("[syncNow] start; bleState=", bleManager.connectionState)
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before syncing.")
      return
    }
    // Re-entry guard: a second syncNow while one is in flight would run the
    // preflight AbortHistoricalTransmits (cmd 20), killing the in-progress
    // strap transfer and restarting the cycle from scratch. The Sync button
    // in ActionsCard is disabled while isSyncing is true, but programmatic
    // callers (auto-sync on auth-ready, deep links, etc.) need this guard too.
    if (isSyncingRef.current) {
      console.warn("[syncNow] ignored — a sync is already in flight")
      return
    }

    isSyncingRef.current = true
    setIsSyncing(true)
    setSyncStage("Downloading from strap…")
    setSyncSummary(null)
    setSyncIteration(0)
    setSyncLastStopReason(null)
    setError(null)

    try {
      const commandService = new (
        await import("@/services/ble/command-service")
      ).CommandService()
      // Preflight only when the prior session ended messily (throw, BLE
      // drop mid-stream). When the prior session ended cleanly, sending
      // cmd 20 here is what produced the 05/17 cursor-skip gaps: between
      // taps the strap was idle, but the abort still kicked something
      // loose and the next SendHistoricalData came back from an
      // already-advanced read pointer. Skip on clean prior.
      if (!lastSyncCleanRef.current) {
        console.log("[syncNow] prior sync was unclean → running preflight abort")
        await bleManager
          .writeCommand(commandService.buildAbortHistoricalTransmits())
          .catch(() => {})
      }
      // Optimistically mark this run unclean; only flip back to clean
      // after the loop exits via a real terminal signal. A throw on the
      // way out leaves it unclean, which is exactly what we want for the
      // next tap's preflight decision.
      lastSyncCleanRef.current = false

      const db = openDatabase()
      let persistedCount = 0
      let totalRecords = 0
      let iterations = 0
      let prevNewestMs: number | null = null
      let stuckCount = 0
      let lastStopReason: string = "continue"

      // Loop: a single SendHistoricalData round-trip pulls one strap-decided
      // window. Re-issue until the cursor catches up to ~now, the strap
      // returns nothing new, or a safety cap fires.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        iterations += 1
        setSyncIteration(iterations)
        setSyncStage(
          `Downloading from strap (pass ${iterations}/${DEFAULT_MAX_ITERATIONS})…`,
        )

        let iterationRecords = 0
        let iterationNewestMs: number | null = null

        const downloader = new HistoryDownloader()
        const records = await downloader.startDownload({
          onProgress: setSyncProgress,
          // Durable-ACK: commit each batch to local SQLite BEFORE the strap
          // is ACK'd for that batch. If persistence fails, the ACK is
          // skipped and the strap retains the batch (no more silent
          // over-ACKing in release builds).
          persistBatch: async (batch) => {
            if (batch.length === 0) return
            const mapped = batch.map(historicalRecordToRawRow)
            const { ok, failed } = await ingestBleRecords(db, mapped)
            if (failed > 0) {
              throw new Error(
                `persistBatch: ${failed}/${mapped.length} records failed to persist`,
              )
            }
            persistedCount += ok
            iterationRecords += batch.length
            let oldest = Number.POSITIVE_INFINITY
            let newest = Number.NEGATIVE_INFINITY
            for (const r of batch) {
              const t = r.timestamp.getTime()
              if (t < oldest) oldest = t
              if (t > newest) newest = t
            }
            if (Number.isFinite(oldest) && Number.isFinite(newest)) {
              setLastBatchWindow({
                oldestMs: oldest,
                newestMs: newest,
                batchSize: batch.length,
              })
              if (iterationNewestMs == null || newest > iterationNewestMs) {
                iterationNewestMs = newest
              }
            }
          },
        })
        totalRecords += records.length
        console.log(
          `[syncNow] pass ${iterations}: ${records.length} records, persisted ${persistedCount} cumulative`,
        )

        const decision = decideContinueSync({
          iterationRecords,
          prevNewestMs,
          currentNewestMs: iterationNewestMs,
          stuckCount,
          iterations,
          nowMs: Date.now(),
          maxIterations: DEFAULT_MAX_ITERATIONS,
          caughtUpWindowMs: DEFAULT_CAUGHT_UP_WINDOW_MS,
        })

        stuckCount = decision.stuckThisIteration ? stuckCount + 1 : 0
        if (iterationNewestMs != null) prevNewestMs = iterationNewestMs
        lastStopReason = decision.reason

        if (decision.stop) {
          console.log(`[syncNow] loop stop: ${decision.reason} after ${iterations} passes`)
          break
        }

        // NB: do NOT issue AbortHistoricalTransmits between passes here.
        // The previous pass terminated cleanly (HistoryComplete / idle-
        // resolved persistAndFinish), so there is no in-flight strap
        // transmission to abort. The whoopsi RE notes (docs/whoop-trim-
        // ack-investigation.md) leave open the question of whether the
        // strap advances its read pointer on send vs ACK. If it advances
        // on send, an abort fired mid-stream silently drops the chunks
        // that crossed the BLE pipe but never got ACK'd — exactly the
        // morning-of-05/17 multi-gap pattern. Even between passes,
        // racing the strap's session-end signal with cmd 20 risks the
        // same. The first-iteration preflight above is still correct;
        // that's the only abort we issue per Sync tap now.
      }

      setSyncLastStopReason(lastStopReason)
      // Loop reached a terminal signal (caught_up / no_records /
      // stuck_cursor / iter_cap) without throwing — strap session is
      // wound down cleanly. Next tap can skip the preflight.
      lastSyncCleanRef.current = true
      setSyncProgress((current) => ({
        state: "complete",
        chunksReceived: current?.chunksReceived ?? 0,
        recordsParsed: totalRecords,
        totalBytes: current?.totalBytes ?? 0,
      }))

      const lastSyncAt = new Date().toISOString()
      storage.set(LAST_SYNC_KEY, lastSyncAt)
      setDeviceState((current) => ({ ...current, lastSyncAt }))

      // Kick the backend pipeline off in the background. Sync UX is "done"
      // once records are persisted locally and queued for upload; the
      // pipeline is throttled inside runPipelineInBackground so frequent
      // small syncs don't trigger a 10–25s backend run every time.
      runPipelineInBackground(persistedCount)

      void refreshDashboard().catch(() => {})
    } catch (nextError: any) {
      console.error("[syncNow] failed", nextError)
      setError(nextError?.message ?? "Sync failed")
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
      setSyncStage("")
    }
  }, [refreshDashboard, runPipelineInBackground])

  // Keep the daemon's syncNow handle pointing at the latest useCallback
  // instance every render.
  useEffect(() => {
    syncNowRef.current = syncNow
  }, [syncNow])

  const maybeAutoSync = useCallback(async () => {
    if (!isAuthenticated || isSyncingRef.current || bleManager.connectionState !== "ready") return

    const now = Date.now()
    if (now - lastAutoSyncAttemptAt.current < 60 * 1000) return

    // Strap flash holds many hours / days of history; the on-strap circular
    // buffer wraps far slower than our previous 3-minute cadence. Bumping
    // to 15 min cuts BLE chatter (and the per-pull strap-side burst work)
    // ~5x without risking buffer wrap.
    if (deviceState.lastSyncAt) {
      const lastSyncMs = new Date(deviceState.lastSyncAt).getTime()
      if (!Number.isNaN(lastSyncMs) && now - lastSyncMs < 15 * 60 * 1000) {
        return
      }
    }

    lastAutoSyncAttemptAt.current = now
    await syncNow()
  }, [isAuthenticated, deviceState.lastSyncAt, syncNow])

  const toggleRealtimeHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: enabled }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleRealtimeHR(enabled))
        setDeviceState((current) => ({
          ...current,
          isRealtimeHeartRateEnabled: enabled,
          realtimeHeartRate: enabled ? current.realtimeHeartRate : null,
          realtimeSamples: enabled ? current.realtimeSamples : [],
        }))
        await persistPreference(REALTIME_HR_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle realtime heart rate")
      }
    },
    [persistPreference],
  )

  const toggleBroadcastHeartRate = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(commandService.buildToggleGenericHRProfile(enabled))
        setDeviceState((current) => ({ ...current, isBroadcastHeartRateEnabled: enabled }))
        await persistPreference(BROADCAST_HR_KEY, enabled)
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle broadcast heart rate")
      }
    },
    [persistPreference],
  )

  const toggleRawDataStreaming = useCallback(
    async (enabled: boolean) => {
      if (bleManager.connectionState !== "ready") {
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        return
      }

      try {
        await bleManager.writeCommand(
          enabled ? commandService.buildStartRawData() : commandService.buildStopRawData(),
        )
        setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: enabled }))
        await persistPreference(RAW_STREAM_KEY, enabled)
        if (enabled) {
          realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        } else {
          realtimeForwarder.endSession()
        }
      } catch (nextError: any) {
        setError(nextError?.message ?? "Failed to toggle raw data stream")
      }
    },
    [persistPreference],
  )

  const smartWakeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const smartWakeFiredFor = useRef<string | null>(null)
  // The interval body reads the latest realtime samples via this ref to
  // avoid stale-closure capture. The ref is kept current by a useEffect
  // below; armAlarm itself doesn't need to depend on the array.
  const realtimeSamplesRef = useRef<SeriesPoint[]>([])

  // Keep ref current. setDeviceState is fast and reading the latest
  // value here is cheap.
  useEffect(() => {
    realtimeSamplesRef.current = deviceState.realtimeSamples
  }, [deviceState.realtimeSamples])

  // Cleanup on unmount — the existing big-useEffect return doesn't
  // cover this timer because it lives on a separate ref.
  useEffect(() => {
    return () => {
      if (smartWakeTimer.current) {
        clearInterval(smartWakeTimer.current)
        smartWakeTimer.current = null
      }
    }
  }, [])

  const armAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready" || !sleepView) {
      setError("Connect your WHOOP strap before arming the strap alarm.")
      return
    }

    const alarmDate = nextAlarmDate(sleepView.planner.alarmMinutes)
    const smartWake = sleepView.planner.smartWakeEnabled

    try {
      await bleManager.writeCommand(commandService.buildSetScheduledAlarm(alarmDate))
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: alarmDate.toISOString(),
        strapAlarmArmed: true,
      }))

      // Smart-wake monitor (v1, foreground-only on iOS).
      // In the 30-min window before the scheduled alarm, poll realtime
      // HR samples each minute. If recent HR mean rises > 10 bpm above
      // the session minimum, fire the strap alarm early (proxy for
      // light/REM stage). Limitations to address later:
      //   • iOS suspends JS setInterval — only fires when app is foreground
      //     or Android FGS is active. Lift onto native scheduler post v1.
      //   • The ~30s realtime buffer is short for physiological wake
      //     detection; real smart-wake uses 5-10 min rolling slopes.
      //     Good enough for a movement-spike proxy; expect false negatives.
      if (smartWakeTimer.current) {
        clearInterval(smartWakeTimer.current)
        smartWakeTimer.current = null
      }
      if (smartWake) {
        const WINDOW_MS = 30 * 60 * 1000
        const windowStart = alarmDate.getTime() - WINDOW_MS
        const alarmKey = alarmDate.toISOString()
        smartWakeFiredFor.current = null
        smartWakeTimer.current = setInterval(async () => {
          const now = Date.now()
          if (now < windowStart) return
          if (now >= alarmDate.getTime()) {
            if (smartWakeTimer.current) {
              clearInterval(smartWakeTimer.current)
              smartWakeTimer.current = null
            }
            return
          }
          if (smartWakeFiredFor.current === alarmKey) return
          // Read latest samples through the ref to avoid stale capture
          const samples = realtimeSamplesRef.current.slice(-30)
          if (samples.length < 10) return
          const values = samples.map((s) => s.value).filter((v) => v > 0)
          if (values.length < 10) return
          const mean = values.reduce((a, b) => a + b, 0) / values.length
          const min = Math.min(...values)
          if (mean - min < 10) return
          try {
            await bleManager.writeCommand(commandService.buildRunAlarm())
            smartWakeFiredFor.current = alarmKey
          } catch {
            // best-effort — fall back to scheduled fire
          }
        }, 60 * 1000)
      }

      await refreshDashboard()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to arm strap alarm")
    }
  }, [sleepView, refreshDashboard])

  const disarmAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before disarming the strap alarm.")
      return
    }

    if (smartWakeTimer.current) {
      clearInterval(smartWakeTimer.current)
      smartWakeTimer.current = null
    }
    smartWakeFiredFor.current = null

    try {
      await bleManager.writeCommand(commandService.buildClearScheduledAlarm())
      await bleManager.writeCommand(commandService.buildGetScheduledAlarm())
      setDeviceState((current) => ({
        ...current,
        strapAlarmAt: null,
        strapAlarmArmed: false,
      }))
      await refreshDashboard()
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to disarm strap alarm")
    }
  }, [refreshDashboard])

  const testAlarm = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before testing the alarm.")
      return
    }

    try {
      await bleManager.writeCommand(commandService.buildRunAlarm())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to trigger strap alarm")
    }
  }, [])

  const rebootStrap = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before rebooting.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildReboot())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to reboot strap")
    }
  }, [])

  const powerCycleStrap = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      setError("Connect your WHOOP strap before power-cycling.")
      return
    }
    try {
      await bleManager.writeCommand(commandService.buildPowerCycle())
    } catch (nextError: any) {
      setError(nextError?.message ?? "Failed to power-cycle strap")
    }
  }, [])

  // Empirically probe what historical-data range the strap reports. Sends
  // cmd 34 (GetDataRange) and waits up to 3s for the matching command
  // response on CMD_FROM_STRAP_UUID. Read-only — does not alter strap
  // state. Payload format is not reverse-engineered in any open reference;
  // this returns the raw bytes plus a best-effort decode (assumes the
  // payload is [start_u32_LE, end_u32_LE, ...] which is the convention
  // the trim-value-in-ACK uses) so we can confirm the layout on real
  // hardware before building a recovery-sync flow on top of it.
  const probeDataRange = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      throw new Error("Connect your WHOOP strap before probing.")
    }
    return await new Promise<{ raw: number[]; hex: string; decoded: string }>(
      (resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          unsub()
          reject(new Error("GetDataRange timed out (3s) — no response from strap"))
        }, 3000)
        const unsub = bleManager.onPacket(CMD_FROM_STRAP_UUID, (packet) => {
          if (settled) return
          if (
            packet.type !== PacketType.CommandResponse ||
            packet.command !== CommandNumber.GetDataRange
          ) {
            return
          }
          settled = true
          clearTimeout(timeout)
          unsub()
          const bytes = Array.from(packet.data)
          const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
          // Best-effort decode: try interpreting first 8 bytes as
          // [start_u32_LE, end_u32_LE] (unix seconds, matching the trim
          // ack encoding) and the next 8 the same way.
          const u32 = (offset: number): number | null => {
            if (offset + 4 > bytes.length) return null
            return (
              bytes[offset] |
              (bytes[offset + 1] << 8) |
              (bytes[offset + 2] << 16) |
              ((bytes[offset + 3] << 24) >>> 0)
            )
          }
          const fmtTs = (v: number | null) => {
            if (v == null) return "—"
            if (v > 1_000_000_000 && v < 4_000_000_000) {
              return `${v} (${new Date(v * 1000).toISOString()})`
            }
            return `${v}`
          }
          const a = u32(0)
          const b = u32(4)
          const c = u32(8)
          const d = u32(12)
          const decoded = [
            `len=${bytes.length}`,
            `u32@0: ${fmtTs(a)}`,
            `u32@4: ${fmtTs(b)}`,
            `u32@8: ${fmtTs(c)}`,
            `u32@12: ${fmtTs(d)}`,
          ].join("\n")
          resolve({ raw: bytes, hex, decoded })
        })
        bleManager
          .writeCommand(commandService.buildGetDataRange())
          .catch((err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            unsub()
            reject(err instanceof Error ? err : new Error(String(err)))
          })
      },
    )
  }, [])

  // Diagnostic A/B/A flow:
  //   1. GetDataRange      → log start/end/rollover (whoopsi-decoded)
  //   2. SetReadPointer    → 8-byte [sector_u32_LE, offset_u32_LE] payload,
  //                          listen for the strap's CommandResponse
  //   3. GetDataRange      → compare new start to the old one
  //
  // If `start` moved backwards between steps 1 and 3, the SetReadPointer
  // command had an effect. If it didn't move, the trim watermark is
  // firmware-enforced regardless of payload format. Decoding follows
  // chukfinley/whoopsi: response body has a 2-byte [origin_seq, result]
  // prefix, then start@9..13, end@13..17, rollover@21..25 (u32 LE).
  const probeRewindProbe = useCallback(
    async (sector: number, offset: number) => {
      if (bleManager.connectionState !== "ready") {
        throw new Error("Connect your WHOOP strap before probing.")
      }

      const u32 = (bytes: number[], off: number): number | null => {
        if (off + 4 > bytes.length) return null
        return (
          bytes[off] |
          (bytes[off + 1] << 8) |
          (bytes[off + 2] << 16) |
          ((bytes[off + 3] << 24) >>> 0)
        )
      }
      // Whoopsi: body starts at packet.data[2] (after [origin_seq, result]).
      // start@body[9..13], end@body[13..17], rollover@body[21..25].
      const decodeRange = (bytes: number[]) => ({
        start: u32(bytes, 11),
        end: u32(bytes, 15),
        rollover: u32(bytes, 23),
      })

      // Track in-flight awaits so a thrown writeCommand can't leak the
      // onPacket subscription (otherwise listeners accumulate one per
      // failed probe).
      const pending: AwaitableResponse[] = []
      try {
        console.log("[probeRewindProbe] step 1: GetDataRange (before)")
        const probe1 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
        pending.push(probe1)
        await bleManager.writeCommand(commandService.buildGetDataRange())
        const before = await probe1.promise
        const beforeRange = decodeRange(before.bytes)
        console.log(
          "[probeRewindProbe] before:",
          "hex=", before.hex,
          "start=", beforeRange.start,
          "end=", beforeRange.end,
          "rollover=", beforeRange.rollover,
        )

        console.log(
          "[probeRewindProbe] step 2: SetReadPointer sector=",
          sector,
          "offset=",
          offset,
        )
        const probe2 = awaitCommandResponse(CommandNumber.SetReadPointer, 2000)
        pending.push(probe2)
        await bleManager.writeCommand(
          commandService.buildSetReadPointerSectorOffset(sector, offset),
        )
        const response = await probe2.promise.catch((err) => ({
          bytes: [] as number[],
          hex: `(no response: ${err.message})`,
        }))
        console.log("[probeRewindProbe] response: hex=", response.hex)

        // Settle for 250ms so the strap processes the pointer change.
        await new Promise((r) => setTimeout(r, 250))

        console.log("[probeRewindProbe] step 3: GetDataRange (after)")
        const probe3 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
        pending.push(probe3)
        await bleManager.writeCommand(commandService.buildGetDataRange())
        const after = await probe3.promise
        const afterRange = decodeRange(after.bytes)
        console.log(
          "[probeRewindProbe] after:",
          "hex=", after.hex,
          "start=", afterRange.start,
          "end=", afterRange.end,
          "rollover=", afterRange.rollover,
        )

        // Only count BACKWARD movement of `start` as a real rewind. Forward
        // drift of a few units is normal — the strap is writing new samples
        // continuously between our two GetDataRange calls. A genuine rewind
        // would push start substantially lower than its before value.
        const movedStart =
          beforeRange.start != null &&
          afterRange.start != null &&
          afterRange.start < beforeRange.start
        console.log(
          "[probeRewindProbe] VERDICT: read pointer rewound =",
          movedStart,
          `(${beforeRange.start} → ${afterRange.start}; forward drift = not a rewind)`,
        )

        return {
          before: `start=${beforeRange.start} end=${beforeRange.end} rollover=${beforeRange.rollover}`,
          response: response.hex,
          after: `start=${afterRange.start} end=${afterRange.end} rollover=${afterRange.rollover}`,
          movedStart,
        }
      } finally {
        for (const p of pending) p.abort()
      }
    },
    [],
  )

  // VERBOSE probe: subscribe to ALL three "from strap" characteristics
  // (cmd / events / data), send SetReadPointer, and log EVERY packet
  // the strap emits over the next `listenMs` window — not just the
  // CommandResponse for cmd 33. Catches:
  //   - response coming back via a different cmd number (echo'd as
  //     something other than 33)
  //   - response framed as an Event (PacketType 48) instead of a
  //     CommandResponse (PacketType 36)
  //   - the strap immediately emitting historical data on the data
  //     characteristic without an intervening ack
  //   - any other channel we're not currently listening on
  // If after this we still see nothing relevant, the command is truly
  // a no-op on this firmware. If we see SOMETHING, we now know what
  // channel/shape to handle.
  const probeRewindVerbose = useCallback(
    async (sector: number, offset: number, listenMs = 5000) => {
      if (bleManager.connectionState !== "ready") {
        throw new Error("Connect your WHOOP strap before probing.")
      }

      const captured: Array<{
        ch: "cmd" | "events" | "data"
        type: number
        seq: number
        cmd: number
        len: number
        hexHead: string
        atMsAfterSend: number | null
      }> = []

      const labelType = (t: number) => {
        switch (t) {
          case PacketType.Command:
            return `Command(${t})`
          case PacketType.CommandResponse:
            return `CommandResponse(${t})`
          case PacketType.RealtimeData:
            return `RealtimeData(${t})`
          case PacketType.RealtimeRawData:
            return `RealtimeRawData(${t})`
          case PacketType.HistoricalData:
            return `HistoricalData(${t})`
          case PacketType.Event:
            return `Event(${t})`
          case PacketType.Metadata:
            return `Metadata(${t})`
          case PacketType.ConsoleLogs:
            return `ConsoleLogs(${t})`
          case PacketType.RealtimeIMUStream:
            return `RealtimeIMUStream(${t})`
          case PacketType.HistoricalIMUStream:
            return `HistoricalIMUStream(${t})`
          default:
            return `Type(${t})`
        }
      }

      let sentAt: number | null = null

      const handler = (ch: "cmd" | "events" | "data") => (packet: WhoopPacket) => {
        const data = Array.from(packet.data)
        const head = data
          .slice(0, Math.min(32, data.length))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")
        captured.push({
          ch,
          type: packet.type,
          seq: packet.sequence,
          cmd: packet.command,
          len: data.length,
          hexHead: head,
          atMsAfterSend: sentAt == null ? null : Date.now() - sentAt,
        })
      }

      const unsubCmd = bleManager.onPacket(CMD_FROM_STRAP_UUID, handler("cmd"))
      const unsubEvents = bleManager.onPacket(EVENTS_FROM_STRAP_UUID, handler("events"))
      const unsubData = bleManager.onPacket(DATA_FROM_STRAP_UUID, handler("data"))

      try {
        console.log(
          "[probeRewindVerbose] starting capture, sending SetReadPointer sector=",
          sector,
          "offset=",
          offset,
        )
        sentAt = Date.now()
        await bleManager.writeCommand(
          commandService.buildSetReadPointerSectorOffset(sector, offset),
        )
        await new Promise((r) => setTimeout(r, listenMs))
      } finally {
        unsubCmd()
        unsubEvents()
        unsubData()
      }

      const lines = captured.map(
        (p, i) =>
          `[${String(i).padStart(3, "0")}] +${
            p.atMsAfterSend == null ? "??" : p.atMsAfterSend
          }ms  ${p.ch.padEnd(6)} ${labelType(p.type).padEnd(24)} seq=${p.seq
            .toString()
            .padStart(3)} cmd=${p.cmd.toString().padStart(3)} len=${p.len
            .toString()
            .padStart(4)}  ${p.hexHead}`,
      )
      console.log(
        `[probeRewindVerbose] CAPTURED ${captured.length} packets in ${listenMs}ms:`,
      )
      for (const line of lines) console.log(line)

      return { packetCount: captured.length, packets: lines }
    },
    [],
  )

  // Run whoopsi's full init sequence (ABORT_HISTORICAL → GET_HELLO_EXT
  // [Maverick] → GET_BATTERY_LEVEL → GET_EXTENDED_BATTERY_INFO) and
  // then attempt FORCE_TRIM(0, 0) in Maverick framing. Hypothesis: the
  // strap may gate sensitive commands behind seeing the Maverick-framed
  // identity exchange first.
  const whoopsiInitThenForceTrim = useCallback(async () => {
    if (bleManager.connectionState !== "ready") {
      throw new Error("Connect your WHOOP strap first.")
    }

    const u32 = (bytes: number[], off: number): number | null => {
      if (off + 4 > bytes.length) return null
      return (
        bytes[off] |
        (bytes[off + 1] << 8) |
        (bytes[off + 2] << 16) |
        ((bytes[off + 3] << 24) >>> 0)
      )
    }
    const decodeRange = (bytes: number[]) => ({
      start: u32(bytes, 11),
      end: u32(bytes, 15),
      rollover: u32(bytes, 23),
    })

    const pending: AwaitableResponse[] = []
    try {
      console.log("[whoopsiInitThenForceTrim] step 0: ABORT_HISTORICAL_TRANSMITS")
      await bleManager
        .writeCommand(commandService.buildAbortHistoricalTransmits())
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 200))

      console.log("[whoopsiInitThenForceTrim] step 1: GET_HELLO_EXT (Maverick)")
      const helloProbe = awaitCommandResponse(CommandNumber.GetHelloExt, 3000)
      pending.push(helloProbe)
      await bleManager.writeCommand(commandService.buildGetHelloExtMaverick())
      const helloRsp = await helloProbe.promise.catch((err) => ({
        bytes: [] as number[],
        hex: `(no response: ${err.message})`,
      }))
      console.log(
        "[whoopsiInitThenForceTrim] GET_HELLO_EXT response (len=",
        helloRsp.bytes.length,
        "): hex=",
        helloRsp.hex,
      )

      console.log("[whoopsiInitThenForceTrim] step 2: battery info")
      await bleManager
        .writeCommand(commandService.buildGetBatteryLevel())
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 200))
      await bleManager
        .writeCommand(commandService.buildGetExtendedBatteryInfo())
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 500))

      console.log("[whoopsiInitThenForceTrim] step 3: GetDataRange (before)")
      const probe1 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
      pending.push(probe1)
      await bleManager.writeCommand(commandService.buildGetDataRange())
      const before = await probe1.promise
      const beforeRange = decodeRange(before.bytes)
      console.log(
        "[whoopsiInitThenForceTrim] before:",
        "start=", beforeRange.start,
        "end=", beforeRange.end,
        "rollover=", beforeRange.rollover,
      )

      console.log("[whoopsiInitThenForceTrim] step 4: FORCE_TRIM(0,0) Maverick")
      const trimProbe = awaitCommandResponse(CommandNumber.ForceTrim, 3000)
      pending.push(trimProbe)
      await bleManager.writeCommand(commandService.buildForceTrimMaverick(0, 0))
      const trimRsp = await trimProbe.promise.catch((err) => ({
        bytes: [] as number[],
        hex: `(no response: ${err.message})`,
      }))
      console.log("[whoopsiInitThenForceTrim] FORCE_TRIM response: hex=", trimRsp.hex)

      await new Promise((r) => setTimeout(r, 1500))
      console.log("[whoopsiInitThenForceTrim] step 5: GetDataRange (after)")
      const probe3 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
      pending.push(probe3)
      await bleManager.writeCommand(commandService.buildGetDataRange())
      const after = await probe3.promise
      const afterRange = decodeRange(after.bytes)
      console.log(
        "[whoopsiInitThenForceTrim] after:",
        "start=", afterRange.start,
        "end=", afterRange.end,
        "rollover=", afterRange.rollover,
      )

      const rewound =
        beforeRange.start != null &&
        afterRange.start != null &&
        afterRange.start < beforeRange.start
      console.log(
        "[whoopsiInitThenForceTrim] VERDICT: rewound =",
        rewound,
        `(${beforeRange.start} → ${afterRange.start})`,
      )

      if (rewound) {
        console.log("[whoopsiInitThenForceTrim] Rewind succeeded — triggering syncNow")
        await syncNow()
      }

      return {
        helloExtResponse: helloRsp.hex,
        before: `start=${beforeRange.start} end=${beforeRange.end} rollover=${beforeRange.rollover}`,
        trimResponse: trimRsp.hex,
        after: `start=${afterRange.start} end=${afterRange.end} rollover=${afterRange.rollover}`,
        rewound,
      }
    } finally {
      for (const p of pending) p.abort()
    }
  }, [syncNow])

  // FORCE_TRIM(0, 0) recovery flow per chukfinley/whoopsi smart-sync.
  // Sequence:
  //   1. GET_DATA_RANGE  → log start/end/rollover
  //   2. FORCE_TRIM(0,0) → rewind trim pointer (the actual rewind cmd)
  //   3. GET_DATA_RANGE  → see if start moved BACKWARDS
  //   4. If start moved backwards, call syncNow to pull whatever
  //      additional data is now reachable
  // Per whoopsi, FORCE_TRIM(0,0) only exposes the wrap-around segment,
  // not the full buffer — partial recovery, not total. Still strictly
  // better than nothing.
  const forceTrimRewindAndSync = useCallback(
    async (sector: number, offset: number, framing: "legacy" | "maverick" = "legacy") => {
      if (bleManager.connectionState !== "ready") {
        throw new Error("Connect your WHOOP strap before forcing trim.")
      }

      const u32 = (bytes: number[], off: number): number | null => {
        if (off + 4 > bytes.length) return null
        return (
          bytes[off] |
          (bytes[off + 1] << 8) |
          (bytes[off + 2] << 16) |
          ((bytes[off + 3] << 24) >>> 0)
        )
      }
      const decodeRange = (bytes: number[]) => ({
        start: u32(bytes, 11),
        end: u32(bytes, 15),
        rollover: u32(bytes, 23),
      })

      const pending: AwaitableResponse[] = []
      try {
        console.log("[forceTrimRewindAndSync] step 1: GetDataRange (before)")
        const probe1 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
        pending.push(probe1)
        await bleManager.writeCommand(commandService.buildGetDataRange())
        const before = await probe1.promise
        const beforeRange = decodeRange(before.bytes)
        console.log(
          "[forceTrimRewindAndSync] before:",
          "start=", beforeRange.start,
          "end=", beforeRange.end,
          "rollover=", beforeRange.rollover,
        )

        console.log(
          "[forceTrimRewindAndSync] step 2: FORCE_TRIM sector=",
          sector,
          "offset=",
          offset,
          "framing=",
          framing,
        )
        const probe2 = awaitCommandResponse(CommandNumber.ForceTrim, 3000)
        pending.push(probe2)
        const cmdBytes =
          framing === "maverick"
            ? commandService.buildForceTrimMaverick(sector, offset)
            : commandService.buildForceTrim(sector, offset)
        await bleManager.writeCommand(cmdBytes)
        const trimResponse = await probe2.promise.catch((err) => ({
          bytes: [] as number[],
          hex: `(no response: ${err.message})`,
        }))
        console.log("[forceTrimRewindAndSync] FORCE_TRIM response: hex=", trimResponse.hex)

        await new Promise((r) => setTimeout(r, 1500))
        console.log("[forceTrimRewindAndSync] step 3: GetDataRange (after)")
        const probe3 = awaitCommandResponse(CommandNumber.GetDataRange, 3000)
        pending.push(probe3)
        await bleManager.writeCommand(commandService.buildGetDataRange())
        const after = await probe3.promise
        const afterRange = decodeRange(after.bytes)
        console.log(
          "[forceTrimRewindAndSync] after:",
          "start=", afterRange.start,
          "end=", afterRange.end,
          "rollover=", afterRange.rollover,
        )

        const rewound =
          beforeRange.start != null &&
          afterRange.start != null &&
          afterRange.start < beforeRange.start
        console.log(
          "[forceTrimRewindAndSync] VERDICT: rewound =",
          rewound,
          `(${beforeRange.start} → ${afterRange.start})`,
        )

        if (rewound) {
          console.log("[forceTrimRewindAndSync] Rewind succeeded — triggering syncNow")
          await syncNow()
        } else {
          console.log("[forceTrimRewindAndSync] No rewind — skipping syncNow")
        }

        return {
          before: `start=${beforeRange.start} end=${beforeRange.end} rollover=${beforeRange.rollover}`,
          trimResponse: trimResponse.hex,
          after: `start=${afterRange.start} end=${afterRange.end} rollover=${afterRange.rollover}`,
          rewound,
        }
      } finally {
        for (const p of pending) p.abort()
      }
    },
    [syncNow],
  )

  // Recovery: rewind the strap's read pointer to `unixTs` then trigger a
  // normal sync. The strap re-streams everything in flash from that point
  // forward, caught by the new durable-ACK + batched-ingest path. `shape`
  // selects the experimental SetReadPointer payload format — try "ts"
  // first, fall back to "ack" or "bare" if the strap doesn't re-stream.
  //
  // Also actively listens for the strap's CommandResponse to cmd 33 for
  // up to 1.5s before issuing SendHistoricalData. If we see one, we log
  // the bytes — that's our only signal as to whether the strap accepted,
  // rejected, or doesn't implement the command.
  const rewindAndResync = useCallback(
    async (unixTs: number, shape: "ts" | "ack" | "bare") => {
      if (bleManager.connectionState !== "ready") {
        throw new Error("Connect your WHOOP strap before rewinding.")
      }
      console.log(
        "[rewindAndResync] sending SetReadPointer shape=",
        shape,
        "ts=",
        unixTs,
        new Date(unixTs * 1000).toISOString(),
      )

      const probe = awaitCommandResponse(CommandNumber.SetReadPointer, 1500)
      try {
        await bleManager.writeCommand(
          commandService.buildSetReadPointer(unixTs, shape),
        )
        const rsp = await probe.promise.catch(() => null)
        if (rsp) {
          console.log(
            "[rewindAndResync] CommandResponse for cmd 33: len=",
            rsp.bytes.length,
            "hex=",
            rsp.hex,
          )
        } else {
          console.log(
            "[rewindAndResync] no CommandResponse for cmd 33 within 1.5s — strap likely ignored or doesn't implement it",
          )
        }
      } finally {
        probe.abort()
      }
      await syncNow()
    },
    [syncNow],
  )

  useEffect(() => {
    const lastSyncAt = storage.getString(LAST_SYNC_KEY) ?? null
    setDeviceState((current) => ({ ...current, lastSyncAt }))
  }, [])

  useEffect(() => {
    const realtimeValue = storage.getString(REALTIME_HR_KEY)
    const broadcastValue = storage.getString(BROADCAST_HR_KEY)
    const rawStreamValue = storage.getString(RAW_STREAM_KEY)
    setDeviceState((current) => ({
      ...current,
      isRealtimeHeartRateEnabled:
        realtimeValue == null ? current.isRealtimeHeartRateEnabled : JSON.parse(realtimeValue),
      isBroadcastHeartRateEnabled:
        broadcastValue == null
          ? current.isBroadcastHeartRateEnabled
          : JSON.parse(broadcastValue),
      isRawDataStreamingEnabled:
        rawStreamValue == null
          ? current.isRawDataStreamingEnabled
          : JSON.parse(rawStreamValue),
    }))
  }, [])

  useEffect(() => {
    bleManager.autoConnect().catch(() => undefined)

    const unsubscribeState = bleManager.onConnectionStateChange((connectionState) => {
      setDeviceState((current) => {
        if (connectionState === "disconnected") {
          return {
            ...emptyDeviceState,
            deviceName: current.deviceName,
            isRealtimeHeartRateEnabled: current.isRealtimeHeartRateEnabled,
            isBroadcastHeartRateEnabled: current.isBroadcastHeartRateEnabled,
            isRawDataStreamingEnabled: current.isRawDataStreamingEnabled,
            lastSyncAt: current.lastSyncAt,
          }
        }
        return {
          ...current,
          connectionState,
          isBusy: connectionState !== "ready",
          deviceName: bleManager.getDeviceName() || current.deviceName,
        }
      })

      if (connectionState === "ready") {
        eventForwarder.start()
        if (CMD_RESP_INGEST_ENABLED) commandResponseForwarder.start()
        if (IMU_INGEST_ENABLED) imuForwarder.start()
        realtimeForwarder.startSession(bleManager.getDeviceId() || "unknown")
        consoleLogForwarder.start(bleManager.getDeviceId() || "unknown")
        refreshDeviceState().catch(() => undefined)
        maybeAutoSync().catch(() => undefined)
        startAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] start failed", err),
        )
        // Continuous BLE pump — polls SendHistoricalData every 30s so the
        // strap's read pointer never gets ahead of our persistence.
        // Internal guards skip when a sync is already in flight or the
        // strap is no longer connected.
        startContinuousSyncDaemon({
          syncNow: () => syncNowRef.current(),
          isSyncingRef,
          isConnected: () => bleManager.connectionState === "ready",
        })
      } else if (connectionState === "disconnected") {
        stopAndroidForegroundService().catch((err) =>
          console.warn("[android-fgs] stop failed", err),
        )
        stopContinuousSyncDaemon()
      }
    })

    const unsubscribePackets = bleManager.onPacket("*", (packet) => {
      setDeviceState((current) => {
        if (current.connectionState === "disconnected") {
          return {
            ...current,
            connectionState: "ready" as ConnectionState,
            isBusy: false,
            deviceName: bleManager.getDeviceName() || current.deviceName,
          }
        }
        return current
      })

      const parsedBattery =
        packet.type === PacketType.CommandResponse ? parseBatteryLevel(packet) : null
      if (parsedBattery != null) {
        setDeviceState((current) => ({ ...current, batteryLevel: parsedBattery }))
      }

      if (packet.type === PacketType.CommandResponse && CMD_RESP_INGEST_ENABLED) {
        const deviceId = bleManager.getDeviceId() || "unknown"
        commandResponseForwarder.push({
          deviceId,
          command: packet.command,
          commandName: CommandNumber[packet.command] ?? `unknown_${packet.command}`,
          sequence: packet.sequence,
          rawPayload: packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          capturedAt: new Date().toISOString(),
        })
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetHelloHarvard &&
        packet.data.length > 7
      ) {
        setDeviceState((current) => ({ ...current, isCharging: packet.data[7] !== 0 }))
      }

      if (
        packet.type === PacketType.CommandResponse &&
        packet.command === CommandNumber.GetScheduledAlarm
      ) {
        const scheduledAlarm = parseScheduledAlarm(packet)
        setDeviceState((current) => ({
          ...current,
          strapAlarmAt: scheduledAlarm,
          strapAlarmArmed: scheduledAlarm != null,
        }))
      }

      if (packet.type === PacketType.CommandResponse) {
        const version = parseVersionInfo(packet)
        if (version != null) {
          setDeviceState((current) => ({ ...current, firmwareVersion: version }))
        }
        const clock = parseDeviceClock(packet)
        if (clock != null) {
          setDeviceState((current) => ({ ...current, deviceClock: clock }))
        }
        if (packet.command === CommandNumber.GetHelloHarvard && packet.data.length > 116) {
          setDeviceState((current) => ({ ...current, isWorn: packet.data[116] !== 0 }))
        }
      }

      if (packet.type === PacketType.Event) {
        if (packet.command === EventNumber.BatteryLevel) {
          const parsed = parseBatteryLevelEvent(packet)
          if (parsed) {
            setDeviceState((current) => ({
              ...current,
              batteryLevel: parsed.socPct ?? current.batteryLevel,
              batteryVoltageMv: parsed.voltageMv ?? current.batteryVoltageMv,
            }))
          }
        } else if (packet.command === EventNumber.ExtendedBatteryInformation) {
          const parsed = parseExtendedBatteryEvent(packet)
          if (parsed) {
            setDeviceState((current) => ({
              ...current,
              batteryVoltageMv: parsed.voltageMv ?? current.batteryVoltageMv,
              batteryTemperatureC: parsed.temperatureC ?? current.batteryTemperatureC,
              batteryIconLevel: parsed.iconLevel ?? current.batteryIconLevel,
            }))
          }
        } else if (packet.command === EventNumber.ChargingOn) {
          setDeviceState((current) => ({ ...current, isCharging: true }))
        } else if (packet.command === EventNumber.ChargingOff) {
          setDeviceState((current) => ({ ...current, isCharging: false }))
        } else if (packet.command === EventNumber.StrapDrivenAlarmSet) {
          setDeviceState((current) => ({ ...current, strapAlarmArmed: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROn) {
          setDeviceState((current) => ({ ...current, isRealtimeHeartRateEnabled: true }))
        } else if (packet.command === EventNumber.BleRealtimeHROff) {
          setDeviceState((current) => ({
            ...current,
            isRealtimeHeartRateEnabled: false,
            realtimeHeartRate: null,
            realtimeSamples: [],
          }))
        } else if (packet.command === EventNumber.RawDataCollectionOn) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: true }))
        } else if (packet.command === EventNumber.RawDataCollectionOff) {
          setDeviceState((current) => ({ ...current, isRawDataStreamingEnabled: false }))
        } else if (packet.command === EventNumber.WristOn) {
          setDeviceState((current) => ({ ...current, isWorn: true }))
        } else if (packet.command === EventNumber.WristOff) {
          setDeviceState((current) => ({ ...current, isWorn: false }))
        }

        const deviceId = bleManager.getDeviceId() || "unknown"
        eventForwarder.push({
          deviceId,
          eventNumber: packet.command,
          eventName: EventNumber[packet.command] ?? `unknown_${packet.command}`,
          rawPayload: packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          capturedAt: new Date().toISOString(),
        })
      }

      const realtimeHeartRate = parseRealtimeHeartRate(packet)
      if (realtimeHeartRate != null) {
        const sample = { timestamp: new Date().toISOString(), value: realtimeHeartRate }
        setDeviceState((current) => ({
          ...current,
          realtimeHeartRate,
          realtimeSamples: [...current.realtimeSamples.slice(-39), sample],
        }))

        realtimeForwarder.pushHR(
          realtimeHeartRate,
          packet.data.length > 0 ? uint8ArrayToBase64(packet.data) : null,
          sample.timestamp,
        )
      }

      if (
        IMU_INGEST_ENABLED &&
        (packet.type === PacketType.RealtimeIMUStream ||
          packet.type === PacketType.HistoricalIMUStream)
      ) {
        const samples = parseIMUPacket(packet)
        if (samples) {
          const source =
            packet.type === PacketType.RealtimeIMUStream ? "realtime" : "historical"
          for (const s of samples) {
            imuForwarder.push({
              timestamp: s.timestamp.toISOString(),
              accelX: s.accelX,
              accelY: s.accelY,
              accelZ: s.accelZ,
              gyroX: s.gyroX,
              gyroY: s.gyroY,
              gyroZ: s.gyroZ,
              source,
            })
          }
        }
      }

      if (packet.type === PacketType.ConsoleLogs && packet.data.length > 7) {
        const raw = packet.data.slice(7)
        const filtered: number[] = []
        for (let i = 0; i < raw.length; i++) {
          if (i + 2 < raw.length && raw[i] === 0x34 && raw[i + 1] === 0x00 && raw[i + 2] === 0x01) {
            i += 2
            continue
          }
          filtered.push(raw[i])
        }
        if (filtered.length > 0) {
          const text = new TextDecoder().decode(new Uint8Array(filtered))
          consoleLogForwarder.push(text)
        }
      }

      if (packet.type === PacketType.RealtimeRawData && packet.data.length > 0) {
        realtimeForwarder.pushRaw(null, uint8ArrayToBase64(packet.data), new Date().toISOString())
      }
    })

    // Single source of truth for foreground/background state is SyncContext's
    // AppState listener, which also fires runBackgroundDrain on transition.
    // We only need to track the flag locally so the packet-drain debounce
    // knows whether to fire (only while backgrounded).
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let isBackground = AppState.currentState !== "active"
    const appStateSub = AppState.addEventListener("change", (next) => {
      isBackground = next !== "active"
    })

    const unsubscribePacketsForDrain = bleManager.onPacket("*", () => {
      if (!isBackground) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        runBackgroundDrain(15_000).catch((err) =>
          console.warn("[bg-packet-drain] failed", err),
        )
      }, 1500)
    })

    const syncTimer = setInterval(() => {
      maybeAutoSync().catch(() => undefined)
    }, 2 * 60 * 1000)

    // SOC changes slowly on a multi-day-life device. 30s polling was
    // pure BLE traffic for no benefit. 5 min is plenty for the UI.
    const batteryPollTimer = setInterval(() => {
      if (bleManager.connectionState !== "ready") return
      bleManager.writeCommand(commandService.buildGetBatteryLevel()).catch(() => undefined)
    }, 5 * 60 * 1000)

    const unsubscribeMemfault = bleManager.onMemfault((base64Chunk) => {
      consoleLogForwarder.pushLine(`[MEMFAULT base64=${base64Chunk}]`)
    })

    return () => {
      unsubscribeState()
      unsubscribePackets()
      unsubscribePacketsForDrain()
      unsubscribeMemfault()
      appStateSub.remove()
      clearInterval(syncTimer)
      clearInterval(batteryPollTimer)
      eventForwarder.stop()
      commandResponseForwarder.stop()
      imuForwarder.stop()
      realtimeForwarder.endSession()
      consoleLogForwarder.stop()
      stopContinuousSyncDaemon()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [maybeAutoSync, refreshDeviceState])

  const value = useMemo<BleContextValue>(
    () => ({
      connectionState: deviceState.connectionState,
      deviceName: deviceState.deviceName,
      batteryLevel: deviceState.batteryLevel,
      batteryVoltageMv: deviceState.batteryVoltageMv,
      batteryTemperatureC: deviceState.batteryTemperatureC,
      batteryIconLevel: deviceState.batteryIconLevel,
      isCharging: deviceState.isCharging,
      isBusy: deviceState.isBusy,
      isRealtimeHeartRateEnabled: deviceState.isRealtimeHeartRateEnabled,
      isBroadcastHeartRateEnabled: deviceState.isBroadcastHeartRateEnabled,
      isRawDataStreamingEnabled: deviceState.isRawDataStreamingEnabled,
      realtimeHeartRate: deviceState.realtimeHeartRate,
      realtimeSamples: deviceState.realtimeSamples,
      liveStressLevel: deriveLiveStressLevel(
        deviceState.realtimeSamples,
        homeView?.activities.baselineRhr ?? LIVE_STRESS_RESTING_BPM_DEFAULT,
      ),
      strapAlarmAt: deviceState.strapAlarmAt,
      strapAlarmArmed: deviceState.strapAlarmArmed,
      isWorn: deviceState.isWorn,
      lastSyncAt: deviceState.lastSyncAt,
      firmwareVersion: deviceState.firmwareVersion,
      deviceClock: deviceState.deviceClock,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      lastBatchWindow,
      pipelineState,
      lastPipelineAt,
      syncIteration,
      syncIterationCap: DEFAULT_MAX_ITERATIONS,
      syncLastStopReason,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshStrapMetadata: refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      rebootStrap,
      powerCycleStrap,
      probeDataRange,
      rewindAndResync,
      probeRewindProbe,
      probeRewindVerbose,
      forceTrimRewindAndSync,
      whoopsiInitThenForceTrim,
      clearError,
    }),
    [
      deviceState,
      scannedDevices,
      isSyncing,
      syncStage,
      syncProgress,
      syncSummary,
      lastBatchWindow,
      pipelineState,
      lastPipelineAt,
      syncIteration,
      syncLastStopReason,
      error,
      scan,
      connect,
      disconnect,
      syncNow,
      refreshDeviceState,
      toggleRealtimeHeartRate,
      toggleBroadcastHeartRate,
      toggleRawDataStreaming,
      armAlarm,
      disarmAlarm,
      testAlarm,
      rebootStrap,
      powerCycleStrap,
      probeDataRange,
      rewindAndResync,
      probeRewindProbe,
      probeRewindVerbose,
      forceTrimRewindAndSync,
      whoopsiInitThenForceTrim,
      clearError,
    ],
  )

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>
}

export function useBle() {
  const context = useContext(BleContext)
  if (!context) throw new Error("useBle must be used within BleProvider")
  return context
}
