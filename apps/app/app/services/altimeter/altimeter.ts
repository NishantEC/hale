import { Platform } from "react-native"

import { pushBarometerSamples } from "@/services/api/noopClient"

const SAMPLE_INTERVAL_MS = 1000 // 1 Hz is plenty for elevation tracking
const FLUSH_INTERVAL_MS = 60_000 // upload every 60 s
const MAX_BUFFER = 600 // safety cap (10 min @ 1 Hz)

export type AltitudeSample = {
  timestamp: string
  pressureHpa: number
  relativeAltitudeMeters: number | null
}

// Defer-load expo-sensors so a missing native module (e.g. dev client built
// before expo-sensors was added) can't crash the JS bundle at import time.
type BarometerLike = {
  isAvailableAsync(): Promise<boolean>
  setUpdateInterval(ms: number): void
  addListener(cb: (m: { pressure: number; relativeAltitude?: number }) => void): {
    remove(): void
  }
}
let barometer: BarometerLike | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  barometer = require("expo-sensors").Barometer as BarometerLike
} catch (err) {
  console.warn("[altimeter] expo-sensors not available", err)
}

let subscription: { remove(): void } | null = null
let buffer: AltitudeSample[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let lastSampleAt = 0

export async function isBarometerAvailable(): Promise<boolean> {
  if (!barometer) return false
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false
  try {
    return await barometer.isAvailableAsync()
  } catch {
    return false
  }
}

export async function startAltimeter(): Promise<boolean> {
  if (!barometer) return false
  if (subscription) return true
  const available = await isBarometerAvailable()
  if (!available) return false

  try {
    barometer.setUpdateInterval(SAMPLE_INTERVAL_MS)
    subscription = barometer.addListener((m) => {
      const now = Date.now()
      if (now - lastSampleAt < SAMPLE_INTERVAL_MS - 50) return // throttle
      lastSampleAt = now
      buffer.push({
        timestamp: new Date(now).toISOString(),
        pressureHpa: m.pressure,
        relativeAltitudeMeters: m.relativeAltitude ?? null,
      })
      if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER)
    })

    flushTimer = setInterval(() => {
      void flush()
    }, FLUSH_INTERVAL_MS)

    return true
  } catch (err) {
    console.warn("[altimeter] start failed", err)
    return false
  }
}

export function stopAltimeter() {
  subscription?.remove()
  subscription = null
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  void flush() // final flush
}

async function flush() {
  if (buffer.length === 0) return
  const batch = buffer
  buffer = []
  try {
    await pushBarometerSamples({ samples: batch })
  } catch (err) {
    // Push failures are non-fatal — re-queue (cap to avoid memory blowup)
    console.warn("[altimeter] push failed", err)
    buffer = [...batch.slice(-MAX_BUFFER), ...buffer]
  }
}
