import { JOURNAL_FACTORS } from "@/constants/journalFactors"
import type { HomeViewModel, JournalEntryResponse } from "@/services/api/noopClient"

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
