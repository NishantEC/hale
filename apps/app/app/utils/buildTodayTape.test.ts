import { buildTodayTape } from "./buildTodayTape"

const COLORS = {
  ringRecovery: "#1ed760",
  ringSleep: "#A78BFA",
  ringStrain: "#ffa42b",
  ringHrv: "#539df5",
  tint: "#C76542",
} as const

const NOW = Date.UTC(2026, 4, 10, 14, 30, 0) // 2026-05-10 14:30 UTC

describe("buildTodayTape", () => {
  it("returns an empty array when there is no data", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events).toEqual([])
  })

  it("emits one event per journal entry, sorted by createdAt ascending", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j2",
          factorTag: "exercise",
          intensity: 2,
          note: "",
          timestamp: "2026-05-10T09:45:00Z",
          createdAt: "2026-05-10T09:45:00Z",
        },
        {
          id: "j1",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T07:02:00Z",
          createdAt: "2026-05-10T07:02:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })

    expect(events.map((e) => e.id)).toEqual(["journal-j1", "journal-j2"])
    expect(events[0]).toMatchObject({
      type: "journal",
      title: "Caffeine",
      payload: { journalEntryId: "j1" },
    })
    expect(events[0].desc).toMatch(/1 cup/i)
  })

  it("uses factor color for the journal dot when available", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j1",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T07:02:00Z",
          createdAt: "2026-05-10T07:02:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events[0].dotColor).toBe("#F59E0B") // caffeine color from JOURNAL_FACTORS
  })

  it("filters out future-dated journal entries (ts > now)", () => {
    const events = buildTodayTape({
      homeView: null,
      journalEntries: [
        {
          id: "j-future",
          factorTag: "caffeine",
          intensity: 1,
          note: "",
          timestamp: "2026-05-10T20:00:00Z",
          createdAt: "2026-05-10T20:00:00Z",
        },
      ],
      now: NOW,
      colors: COLORS,
      selectedDate: "2026-05-10",
    })
    expect(events).toEqual([])
  })
})
