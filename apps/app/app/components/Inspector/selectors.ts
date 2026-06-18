export type Dot = "green" | "amber" | "red"

export type StrapInput = {
  connectionState: "ready" | "connecting" | "disconnected"
  isWorn: boolean
  batteryLevel: number | null
  lastStreamAt: number | null
  backlogChunks: number
  nowMs: number
}

const STREAM_SILENT_MS = 3 * 60_000

export function strapChipState(i: StrapInput): { dot: Dot; sub: string } {
  if (i.connectionState === "disconnected") return { dot: "red", sub: "—" }
  if (i.connectionState === "connecting") return { dot: "amber", sub: "—" }
  if (i.backlogChunks > 0) {
    return { dot: "green", sub: `backlog · ${i.backlogChunks} chunks` }
  }
  if (i.lastStreamAt != null && i.nowMs - i.lastStreamAt > STREAM_SILENT_MS) {
    return { dot: "green", sub: "stream silent" }
  }
  const bat = i.batteryLevel != null ? `${Math.round(i.batteryLevel)}%` : "—"
  const wear = i.isWorn ? "on wrist" : "off wrist"
  return { dot: "green", sub: `${wear} · ${bat}` }
}

export type PhoneInput = {
  daemonRunning: boolean
  lastTickAt: number | null
  daemonTicks: number
  nowMs: number
  appErrorsLast5min: number
}

const TICK_STALE_MS = 90_000

export function phoneChipState(i: PhoneInput): { dot: Dot; sub: string } {
  const sub = i.daemonRunning ? `daemon · ${i.daemonTicks} ticks` : "daemon stopped"
  if (i.appErrorsLast5min > 0) return { dot: "red", sub }
  if (!i.daemonRunning) return { dot: "amber", sub }
  if (i.lastTickAt != null && i.nowMs - i.lastTickAt > TICK_STALE_MS) {
    return { dot: "amber", sub }
  }
  return { dot: "green", sub }
}

export function coverageChipState(i: { percent: number }): {
  color: "green" | "amber" | "red"
  percent: number
} {
  const p = i.percent
  if (p >= 80) return { color: "green", percent: p }
  if (p >= 50) return { color: "amber", percent: p }
  return { color: "red", percent: p }
}
