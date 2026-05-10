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

export function buildTodayTape(_input: {
  homeView: HomeViewModel | null
  journalEntries: JournalEntryResponse[]
  now: number
  colors: ColorTokens
  selectedDate: string
}): TapeEvent[] {
  return []
}
