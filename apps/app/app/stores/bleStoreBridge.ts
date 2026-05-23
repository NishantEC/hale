import {
  bleManager,
  CommandNumber,
  EventNumber,
  PacketType,
} from '@/services/ble'
import {
  parseBatteryLevel,
  parseBatteryLevelEvent,
  parseExtendedBatteryEvent,
} from '@/services/ble/battery-parsers'
import type { ConnectionState, WhoopPacket } from '@/services/ble/packet-types'
import type { SeriesPoint } from '@/services/api/noopClient'
import { useBleStore } from './bleStore'

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

function parseUint32LE(data: Uint8Array, offset: number): number | null {
  if (offset + 3 >= data.length) return null
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  )
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
  const harvard = values.slice(0, 4).join('.')
  const boylston = values.slice(4, 8).join('.')
  return `${harvard} / ${boylston}`
}

function parseDeviceClock(packet: WhoopPacket): Date | null {
  if (packet.command !== CommandNumber.GetClock || packet.data.length < 6) return null
  const unix = parseUint32LE(packet.data, 2)
  if (unix == null || unix === 0) return null
  return new Date(unix * 1000)
}

function parseScheduledAlarm(packet: WhoopPacket, now = new Date()): string | null {
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

function parseRealtimeHeartRate(packet: WhoopPacket): number | null {
  if (packet.type !== PacketType.RealtimeData || packet.data.length <= 5) return null
  const heartRate = packet.data[5]
  return heartRate > 0 ? heartRate : null
}

const emptyConnectionState: ConnectionState = 'disconnected'

let initialized = false
const teardowns: Array<() => void> = []

export function initBleStoreBridge(): () => void {
  if (initialized) {
    return () => {}
  }
  initialized = true

  const unsubState = bleManager.onConnectionStateChange((connectionState) => {
    const current = useBleStore.getState()

    if (connectionState === 'disconnected') {
      useBleStore.setState({
        connectionState: emptyConnectionState,
        batteryLevel: null,
        batteryVoltageMv: null,
        batteryTemperatureC: null,
        batteryIconLevel: null,
        isCharging: false,
        isBusy: false,
        realtimeHeartRate: null,
        realtimeSamples: [],
        liveStressLevel: null,
        firmwareVersion: null,
        deviceClock: null,
        isWorn: true,
        strapAlarmAt: null,
        strapAlarmArmed: false,
        deviceName: current.deviceName,
        isRealtimeHeartRateEnabled: current.isRealtimeHeartRateEnabled,
        isBroadcastHeartRateEnabled: current.isBroadcastHeartRateEnabled,
        isRawDataStreamingEnabled: current.isRawDataStreamingEnabled,
        lastSyncAt: current.lastSyncAt,
      })
    } else {
      useBleStore.setState({
        connectionState,
        isBusy: connectionState !== 'ready',
        deviceName: bleManager.getDeviceName() || current.deviceName,
      })
    }
  })

  const unsubPackets = bleManager.onPacket('*', (packet) => {
    const current = useBleStore.getState()

    // Deliberately do NOT auto-recover connectionState from a stray packet
    // arriving after onConnectionStateChange already reported 'disconnected'.
    // Stray late packets (end-of-session ACK arriving a few ms after the
    // disconnect callback) were briefly flipping the store back to 'ready',
    // producing a re-disconnect flicker on the activity strip. The
    // bleManager.onConnectionStateChange handler is the single source of
    // truth for connectionState.

    const parsedBattery =
      packet.type === PacketType.CommandResponse ? parseBatteryLevel(packet) : null
    if (parsedBattery != null) {
      useBleStore.setState({ batteryLevel: parsedBattery })
    }

    if (
      packet.type === PacketType.CommandResponse &&
      packet.command === CommandNumber.GetHelloHarvard &&
      packet.data.length > 7
    ) {
      useBleStore.setState({ isCharging: packet.data[7] !== 0 })
    }

    if (
      packet.type === PacketType.CommandResponse &&
      packet.command === CommandNumber.GetScheduledAlarm
    ) {
      const scheduledAlarm = parseScheduledAlarm(packet)
      useBleStore.setState({
        strapAlarmAt: scheduledAlarm,
        strapAlarmArmed: scheduledAlarm != null,
      })
    }

    if (packet.type === PacketType.CommandResponse) {
      const version = parseVersionInfo(packet)
      if (version != null) {
        useBleStore.setState({ firmwareVersion: version })
      }
      const clock = parseDeviceClock(packet)
      if (clock != null) {
        useBleStore.setState({ deviceClock: clock })
      }
      if (packet.command === CommandNumber.GetHelloHarvard && packet.data.length > 116) {
        useBleStore.setState({ isWorn: packet.data[116] !== 0 })
      }
    }

    if (packet.type === PacketType.Event) {
      if (packet.command === EventNumber.BatteryLevel) {
        const parsed = parseBatteryLevelEvent(packet)
        if (parsed) {
          useBleStore.setState((s) => ({
            batteryLevel: parsed.socPct ?? s.batteryLevel,
            batteryVoltageMv: parsed.voltageMv ?? s.batteryVoltageMv,
          }))
        }
      } else if (packet.command === EventNumber.ExtendedBatteryInformation) {
        const parsed = parseExtendedBatteryEvent(packet)
        if (parsed) {
          useBleStore.setState((s) => ({
            batteryVoltageMv: parsed.voltageMv ?? s.batteryVoltageMv,
            batteryTemperatureC: parsed.temperatureC ?? s.batteryTemperatureC,
            batteryIconLevel: parsed.iconLevel ?? s.batteryIconLevel,
          }))
        }
      } else if (packet.command === EventNumber.ChargingOn) {
        useBleStore.setState({ isCharging: true })
      } else if (packet.command === EventNumber.ChargingOff) {
        useBleStore.setState({ isCharging: false })
      } else if (packet.command === EventNumber.StrapDrivenAlarmSet) {
        useBleStore.setState({ strapAlarmArmed: true })
      } else if (packet.command === EventNumber.BleRealtimeHROn) {
        useBleStore.setState({ isRealtimeHeartRateEnabled: true })
      } else if (packet.command === EventNumber.BleRealtimeHROff) {
        useBleStore.setState({
          isRealtimeHeartRateEnabled: false,
          realtimeHeartRate: null,
          realtimeSamples: [],
          liveStressLevel: null,
        })
      } else if (packet.command === EventNumber.RawDataCollectionOn) {
        useBleStore.setState({ isRawDataStreamingEnabled: true })
      } else if (packet.command === EventNumber.RawDataCollectionOff) {
        useBleStore.setState({ isRawDataStreamingEnabled: false })
      } else if (packet.command === EventNumber.WristOn) {
        useBleStore.setState({ isWorn: true })
      } else if (packet.command === EventNumber.WristOff) {
        useBleStore.setState({ isWorn: false })
      }
    }

    const realtimeHeartRate = parseRealtimeHeartRate(packet)
    if (realtimeHeartRate != null) {
      const sample: SeriesPoint = {
        timestamp: new Date().toISOString(),
        value: realtimeHeartRate,
      }
      useBleStore.setState((s) => {
        const realtimeSamples = [...s.realtimeSamples.slice(-39), sample]
        const restingBpm = s.baselineRhr ?? LIVE_STRESS_RESTING_BPM_DEFAULT
        return {
          realtimeHeartRate,
          realtimeSamples,
          liveStressLevel: deriveLiveStressLevel(realtimeSamples, restingBpm),
        }
      })
    }
  })

  // The previous per-packet background-drain trigger fired roughly every
  // 1.5s (debounced) while the strap streamed in the background — once
  // realtime HR was on, every quiet window kicked runBackgroundDrain. The
  // SQLite drain lock serialised the work but telemetry filled with
  // skipped:"locked" rows and battery took the hit. The continuous-sync
  // daemon (services/sync/continuousSyncDaemon.ts, 30s) already pumps the
  // strap on connect, and SyncContext's foreground interval (15s) + the
  // AppState foreground→background single-shot drain cover the queue. No
  // need for a third per-packet starter.

  const teardown = () => {
    unsubState()
    unsubPackets()
    initialized = false
  }

  teardowns.push(teardown)
  return teardown
}
