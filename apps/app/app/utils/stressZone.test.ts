import { scoreToZone, zoneColorToken, type StressZone } from "./stressZone"

describe("scoreToZone", () => {
  it("returns Calm for 0 ≤ score < 35", () => {
    expect(scoreToZone(0)).toBe("Calm")
    expect(scoreToZone(20)).toBe("Calm")
    expect(scoreToZone(34)).toBe("Calm")
  })
  it("returns Moderate for 35 ≤ score < 65", () => {
    expect(scoreToZone(35)).toBe("Moderate")
    expect(scoreToZone(50)).toBe("Moderate")
    expect(scoreToZone(64)).toBe("Moderate")
  })
  it("returns High for score ≥ 65", () => {
    expect(scoreToZone(65)).toBe("High")
    expect(scoreToZone(80)).toBe("High")
    expect(scoreToZone(100)).toBe("High")
  })
  it("clamps below 0 to Calm and above 100 to High", () => {
    expect(scoreToZone(-1)).toBe("Calm")
    expect(scoreToZone(150)).toBe("High")
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
