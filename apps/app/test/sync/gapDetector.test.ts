import { detectGaps, GAP_THRESHOLD_MS } from "@/services/sync/gapDetector"

describe("detectGaps", () => {
  test("returns empty when no records", () => {
    expect(detectGaps([])).toEqual([])
  })

  test("returns empty when records are dense (< threshold gap)", () => {
    const base = 1_700_000_000_000
    const recs = Array.from({ length: 60 }, (_, i) => base + i * 1_000)
    expect(detectGaps(recs)).toEqual([])
  })

  test("detects a single gap above threshold", () => {
    const base = 1_700_000_000_000
    const before = [base, base + 1_000, base + 2_000]
    const after = [base + 10 * 60_000, base + 10 * 60_000 + 1_000]
    const gaps = detectGaps([...before, ...after])
    expect(gaps).toHaveLength(1)
    expect(gaps[0].fromMs).toBe(base + 2_000)
    expect(gaps[0].toMs).toBe(base + 10 * 60_000)
    expect(gaps[0].durationMinutes).toBeCloseTo((10 * 60_000 - 2_000) / 60_000, 2)
  })

  test("ignores gaps just below threshold", () => {
    const base = 1_700_000_000_000
    const recs = [base, base + (GAP_THRESHOLD_MS - 1_000)]
    expect(detectGaps(recs)).toEqual([])
  })

  test("includes gaps exactly at threshold (inclusive boundary)", () => {
    const base = 1_700_000_000_000
    const recs = [base, base + GAP_THRESHOLD_MS]
    const gaps = detectGaps(recs)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].durationMinutes).toBeCloseTo(GAP_THRESHOLD_MS / 60_000, 2)
  })

  test("detects multiple gaps in one input", () => {
    const base = 1_700_000_000_000
    const recs = [
      base,
      base + 1_000,
      base + 8 * 60_000, // gap 1
      base + 8 * 60_000 + 1_000,
      base + 20 * 60_000, // gap 2
    ]
    const gaps = detectGaps(recs)
    expect(gaps).toHaveLength(2)
  })

  test("works on unsorted input by sorting first", () => {
    const base = 1_700_000_000_000
    const recs = [base + 10 * 60_000, base, base + 1_000]
    const gaps = detectGaps(recs)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].fromMs).toBe(base + 1_000)
  })
})
