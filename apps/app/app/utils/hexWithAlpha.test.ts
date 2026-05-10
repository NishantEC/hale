import { hexWithAlpha } from "./hexWithAlpha"

describe("hexWithAlpha", () => {
  it("converts a 6-char hex to rgba with alpha", () => {
    expect(hexWithAlpha("#1ed760", 0.18)).toBe("rgba(30, 215, 96, 0.18)")
  })

  it("returns the input unchanged when given an rgba string", () => {
    expect(hexWithAlpha("rgba(0,0,0,0.5)", 0.18)).toBe("rgba(0,0,0,0.5)")
  })

  it("returns the input unchanged when given an rgb string", () => {
    expect(hexWithAlpha("rgb(0,0,0)", 0.18)).toBe("rgb(0,0,0)")
  })

  it("returns the input unchanged when given a non-hex string", () => {
    expect(hexWithAlpha("transparent", 0.18)).toBe("transparent")
  })

  it("returns the input unchanged when given a 3-char hex (not supported)", () => {
    expect(hexWithAlpha("#abc", 0.5)).toBe("#abc")
  })
})
