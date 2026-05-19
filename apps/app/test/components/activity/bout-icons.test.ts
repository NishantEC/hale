import { ACTIVITY_VISUALS, visualForType, type ActivityVisual } from "../../../app/components/activity/bout-icons"

describe("ACTIVITY_VISUALS", () => {
  const expected = [
    "Running", "Walking", "Hiking", "Cycling", "Strength", "HIIT",
    "Stair Climb", "Cardio", "Mixed", "Light Activity",
    "Candidate", "Off-Wrist", "No Data",
  ]

  it("has an entry for every Rich-10 class and sentinel", () => {
    for (const t of expected) {
      const v: ActivityVisual = (ACTIVITY_VISUALS as Record<string, ActivityVisual>)[t]
      expect(v).toBeDefined()
      expect(typeof v.sfSymbol).toBe("string")
      expect(v.tintHex).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(typeof v.backgroundHex).toBe("string")
    }
  })

  it("visualForType falls back to Light Activity for unknown class", () => {
    expect(visualForType("Some Unknown Class")).toEqual(ACTIVITY_VISUALS["Light Activity"])
  })

  it("visualForType returns the matching entry for a known class", () => {
    expect(visualForType("Running")).toBe(ACTIVITY_VISUALS["Running"])
  })

  it("Stair Climb maps to a stair SF Symbol", () => {
    expect(ACTIVITY_VISUALS["Stair Climb"].sfSymbol).toContain("stair")
  })

  it("Candidate uses indigo tint", () => {
    expect(ACTIVITY_VISUALS["Candidate"].tintHex.toUpperCase()).toBe("#5E5CE6")
  })
})
