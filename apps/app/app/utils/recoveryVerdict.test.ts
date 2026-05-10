import { recoveryVerdict } from "./recoveryVerdict"

describe("recoveryVerdict", () => {
  it("returns the high bucket for >= 67%", () => {
    expect(recoveryVerdict(87)).toEqual({
      verdict: "Push hard.",
      detail: "Body is primed. HRV trending up.",
    })
    expect(recoveryVerdict(67)).toEqual({
      verdict: "Push hard.",
      detail: "Body is primed. HRV trending up.",
    })
  })

  it("returns the moderate bucket for 34–66%", () => {
    expect(recoveryVerdict(50)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
    expect(recoveryVerdict(34)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
    expect(recoveryVerdict(66)).toEqual({
      verdict: "Train moderately.",
      detail: "Yellow zone — listen to your body.",
    })
  })

  it("returns the low bucket for < 34%", () => {
    expect(recoveryVerdict(33)).toEqual({
      verdict: "Take it easy.",
      detail: "Recovery is low. Consider rest or active recovery.",
    })
    expect(recoveryVerdict(0)).toEqual({
      verdict: "Take it easy.",
      detail: "Recovery is low. Consider rest or active recovery.",
    })
  })

  it("returns the no-data bucket when value is null or undefined", () => {
    expect(recoveryVerdict(null)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
    expect(recoveryVerdict(undefined)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
  })

  it("returns the no-data bucket when value is NaN", () => {
    expect(recoveryVerdict(NaN)).toEqual({
      verdict: "Awaiting data.",
      detail: "Sync your strap to see today's recovery.",
    })
  })
})
