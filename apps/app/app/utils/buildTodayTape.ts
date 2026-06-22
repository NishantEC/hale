import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import type { HomeViewModel, JournalEntryResponse } from "@/services/api/viewModels"

export type TapeEventType = "sleep" | "recovery" | "journal" | "workout" | "vital"

export type TapeEvent = {
  id: string
  time: string // "HH:MM" 24h format
  ts: number // ms epoch — for sorting only
  title: string
  desc?: string
  dotColor: string
  type: TapeEventType
  payload?: {
    journalEntryId?: string
    /** Workout-only — propagated from HomeViewModel.activities.activityFeed. */
    boutId?: string
    activityType?: string
    intensity?: "light" | "moderate" | "hard"
    durationMinutes?: number
    heartRateAvg?: number
    strain?: number
    startIso?: string
    endIso?: string
  }
}

type ColorTokens = {
  ringRecovery: string
  ringSleep: string
  ringStrain: string
  ringHrv: string
  tint: string
}

export function buildTodayTape(input: {
  homeView: HomeViewModel | null
  journalEntries: JournalEntryResponse[]
  now: number
  colors: ColorTokens
  selectedDate: string
}): TapeEvent[] {
  const { journalEntries, now, colors } = input
  const events: TapeEvent[] = []

  // Sleep wake-up — synthetic time at 06:30 of selectedDate
  if (input.homeView) {
    const sleepLabel = input.homeView.rings.sleep.value
    if (sleepLabel && sleepLabel !== "--") {
      const ts = synthesizeTimeOnDate(input.selectedDate, 6, 30)
      if (Number.isFinite(ts) && ts <= now) {
        events.push({
          id: "sleep-wake",
          time: formatTime(ts),
          ts,
          title: "Woke up",
          desc: sleepLabel,
          dotColor: colors.ringSleep,
          type: "sleep",
        })
      }
    }
  }

  // Recovery scored — synthetic time at 06:35 of selectedDate
  if (input.homeView) {
    const recoveryValue = parseScalar(input.homeView.rings.recovery.value)
    if (recoveryValue != null) {
      const ts = synthesizeTimeOnDate(input.selectedDate, 6, 35)
      if (Number.isFinite(ts) && ts <= now) {
        events.push({
          id: "recovery-scored",
          time: formatTime(ts),
          ts,
          title: `Recovery scored ${Math.round(recoveryValue)}%`,
          desc: undefined,
          dotColor: colors.ringRecovery,
          type: "recovery",
        })
      }
    }
  }

  // Workouts — from activities.activityFeed (time is "HH:MM" already)
  if (input.homeView) {
    for (let i = 0; i < input.homeView.activities.activityFeed.length; i++) {
      const a = input.homeView.activities.activityFeed[i]
      const [h, m] = a.time.split(":").map(Number)
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue
      const ts = synthesizeTimeOnDate(input.selectedDate, h, m)
      if (!Number.isFinite(ts) || ts > now) continue
      const intensity =
        a.intensity === "moderate" || a.intensity === "hard" || a.intensity === "light"
          ? (a.intensity as "light" | "moderate" | "hard")
          : "light"
      events.push({
        id: a.id ?? `workout-${i}`,
        time: a.time,
        ts,
        title: a.type,
        desc: `${a.duration} · Strain ${a.strain}`,
        dotColor: colors.ringStrain,
        type: "workout",
        payload: {
          boutId: a.id,
          activityType: a.type,
          intensity,
          durationMinutes: a.durationMinutes,
          heartRateAvg: a.heartRateAvg,
          strain: parseFloat(a.strain) || 0,
          startIso: a.startTime,
          endIso: a.endTime,
        },
      })
    }
  }

  for (const entry of journalEntries) {
    const ts = new Date(entry.createdAt).getTime()
    if (!Number.isFinite(ts)) continue
    if (ts > now) continue

    const factor = JOURNAL_FACTORS.find((f) => f.tag === entry.factorTag)
    const dotColor = factor?.color ?? colors.tint
    const title = factor?.label ?? entry.factorTag
    const desc = formatJournalDesc(factor, entry)

    events.push({
      id: `journal-${entry.id}`,
      time: formatTime(ts),
      ts,
      title,
      desc,
      dotColor,
      type: "journal",
      payload: { journalEntryId: entry.id },
    })
  }

  events.sort((a, b) => a.ts - b.ts)
  return events
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

function formatJournalDesc(
  factor: (typeof JOURNAL_FACTORS)[number] | undefined,
  entry: JournalEntryResponse,
): string | undefined {
  if (!factor) return undefined
  const { input } = factor
  if (input.kind === "toggle") return undefined
  if (input.kind === "quantity") {
    const unit = entry.intensity === 1 ? input.unit.replace(/s$/, "") : input.unit
    return `${entry.intensity} ${unit}`
  }
  if (input.kind === "scale") {
    return input.labels[entry.intensity - 1]
  }
  return undefined
}

function parseScalar(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[^\d.-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function synthesizeTimeOnDate(dateIso: string, hour: number, minute: number): number {
  const [y, m, d] = dateIso.split("-").map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime()
}
