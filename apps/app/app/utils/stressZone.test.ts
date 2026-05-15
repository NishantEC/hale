import { scoreToZone, zoneColorToken, type StressZone } from "./stressZone"

describe("scoreToZone", () => {
  it("returns Calm for 0 ≤ score < 1", () => {
    expect(scoreToZone(0)).toBe("Calm")
    expect(scoreToZone(0.4)).toBe("Calm")
    expect(scoreToZone(0.9)).toBe("Calm")
  })
  it("returns Moderate for 1 ≤ score < 2", () => {
    expect(scoreToZone(1)).toBe("Moderate")
    expect(scoreToZone(1.5)).toBe("Moderate")
    expect(scoreToZone(1.99)).toBe("Moderate")
  })
  it("returns High for score ≥ 2", () => {
    expect(scoreToZone(2)).toBe("High")
    expect(scoreToZone(2.7)).toBe("High")
    expect(scoreToZone(3)).toBe("High")
  })
  it("clamps below 0 to Calm and above 3 to High", () => {
    expect(scoreToZone(-1)).toBe("Calm")
    expect(scoreToZone(99)).toBe("High")
  })
  it("returns null for null input", () => {
    expect(scoreToZone(null)).toBeNull()
  })
})

describe("zoneColorToken", () => {
  it("maps zones to LOCAL_THEME color keys", () => {
    expect(zoneColorToken("Calm")).toBe("ringHrv")
    expect(zoneColorToken("Moderate")).toBe("statusAmber")
    expect(zoneColorToken("High")).toBe("statusRed")
    expect(zoneColorToken(null)).toBe("statusStale")
  })
})

describe("StressZone type", () => {
  it("compiles with valid values", () => {
    const z1: StressZone = "Calm"
    const z2: StressZone = "Moderate"
    const z3: StressZone = "High"
    expect([z1, z2, z3]).toHaveLength(3)
  })
})
