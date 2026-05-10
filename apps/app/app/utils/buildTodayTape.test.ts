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
})
