import {
  aggregateNoopAge,
  chronologicalAge,
  computeContributors,
  computeVo2MaxUth,
  impactYearsFor,
  METRIC_SPECS,
  paceOfAging,
  type ContributorInput,
} from "../../app/services/health/healthspan"

const spec = (key: string) => {
  const s = METRIC_SPECS.find((m) => m.key === key)
  if (!s) throw new Error(`missing spec ${key}`)
  return s
}

const noInputs: Record<string, ContributorInput> = {}

describe("chronologicalAge", () => {
  it("converts an exact 40-year span using the 365.25-day year", () => {
    const dob = "2000-01-01T00:00:00.000Z"
    const ref = new Date(Date.parse(dob) + 40 * 365.25 * 86_400_000)
    expect(chronologicalAge(dob, ref)).toBeCloseTo(40, 10)
  })

  it("returns null for missing or future birth dates", () => {
    expect(chronologicalAge(null, new Date())).toBeNull()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(chronologicalAge(future, new Date())).toBeNull()
  })
})

describe("impactYearsFor", () => {
  it("makes a low resting heart rate subtract years (improving)", () => {
    // rhr ref=65, yearsPerUnit=+0.1 (direction lower). 55 bpm → -1.0 yr.
    expect(impactYearsFor(spec("rhr"), 55, null)).toBeCloseTo(-1.0, 10)
  })

  it("makes short sleep add years (worsening)", () => {
    // hoursOfSleep ref=7.5, yearsPerUnit=-0.6. 6.5 h → +0.6 yr.
    expect(impactYearsFor(spec("hoursOfSleep"), 6.5, null)).toBeCloseTo(0.6, 10)
  })

  it("clamps to the per-metric maxAbsImpact", () => {
    // rhr cap is 3.0; a wild 200 bpm would be +13.5 uncapped.
    expect(impactYearsFor(spec("rhr"), 200, null)).toBe(3.0)
  })

  it("falls back to the 6-month value and yields 0 when both are missing", () => {
    expect(impactYearsFor(spec("rhr"), null, 55)).toBeCloseTo(-1.0, 10)
    expect(impactYearsFor(spec("rhr"), null, null)).toBe(0)
  })
})

describe("aggregateNoopAge", () => {
  it("an improving metric pushes noopAge below chronological age", () => {
    const contributors = computeContributors({
      ...noInputs,
      rhr: { thirtyDayValue: 55, sixMonthValue: null },
    })
    expect(aggregateNoopAge(40, contributors)).toBeCloseTo(39, 10)
  })

  it("a worsening metric pushes noopAge above chronological age", () => {
    const contributors = computeContributors({
      ...noInputs,
      hoursOfSleep: { thirtyDayValue: 6.5, sixMonthValue: null },
    })
    expect(aggregateNoopAge(40, contributors)).toBeCloseTo(40.6, 10)
  })

  it("clamps the summed impact to −15 and floors noopAge at 0", () => {
    // Every metric driven well past its cap in the improving direction.
    // Sum of all maxAbsImpact is 20.5y, so the −15 clamp must engage.
    const superHuman = computeContributors({
      sleepConsistency: { thirtyDayValue: 200, sixMonthValue: null },
      hoursOfSleep: { thirtyDayValue: 11, sixMonthValue: null },
      hrZones1to3: { thirtyDayValue: 7, sixMonthValue: null },
      hrZones4to5: { thirtyDayValue: 2, sixMonthValue: null },
      stepsDaily: { thirtyDayValue: 16000, sixMonthValue: null },
      strengthActivity: { thirtyDayValue: 5, sixMonthValue: null },
      vo2max: { thirtyDayValue: 60, sixMonthValue: null },
      rhr: { thirtyDayValue: 35, sixMonthValue: null },
    })
    // 40 − 15 (clamped) = 25.
    expect(aggregateNoopAge(40, superHuman)).toBeCloseTo(25, 10)
    // 10 − 15 = −5 → floored to 0.
    expect(aggregateNoopAge(10, superHuman)).toBe(0)
  })
})

describe("paceOfAging", () => {
  it("returns null without a prior assessment", () => {
    expect(paceOfAging(40, new Date("2026-01-05T00:00:00Z"), null)).toBeNull()
  })

  it("scales a one-week biological-age change by 52 and clamps to 3x", () => {
    const week = new Date("2026-01-12T00:00:00Z")
    const prior = { noopAge: 39.98, weekStart: new Date("2026-01-05T00:00:00Z") }
    expect(paceOfAging(40, week, prior)).toBeCloseTo(2.04, 10)
    // A full year of apparent aging in a week saturates the clamp.
    expect(paceOfAging(41, week, prior)).toBe(3)
  })
})

describe("computeVo2MaxUth", () => {
  it("applies the 15 × HRmax / HRrest formula and rounds to 0.1", () => {
    expect(computeVo2MaxUth(60, 190)).toBe(47.5)
  })

  it("rejects implausible or missing inputs", () => {
    expect(computeVo2MaxUth(null, 190)).toBeNull()
    expect(computeVo2MaxUth(60, null)).toBeNull()
    // 15 * 400 / 60 = 100 → out of the 15–80 band.
    expect(computeVo2MaxUth(60, 400)).toBeNull()
  })
})
