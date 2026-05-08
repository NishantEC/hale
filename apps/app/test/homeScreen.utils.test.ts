import { getDaySwipeAction, shouldLockHomeScroll } from "../app/screens/HomeScreen.utils"

describe("HomeScreen swipe helpers", () => {
  it("locks scroll for horizontal-dominant drags", () => {
    expect(shouldLockHomeScroll({ translationX: 30, translationY: 10 })).toBe(true)
  })

  it("keeps scroll enabled for vertical-dominant drags", () => {
    expect(shouldLockHomeScroll({ translationX: 18, translationY: 20 })).toBe(false)
  })

  it("moves to the previous day on a right swipe over threshold", () => {
    expect(getDaySwipeAction({ translationX: 72, translationY: 12 })).toBe("previous")
  })

  it("moves to the next day on a left swipe over threshold", () => {
    expect(getDaySwipeAction({ translationX: -72, translationY: 12 })).toBe("next")
  })

  it("ignores mostly vertical swipes", () => {
    expect(getDaySwipeAction({ translationX: 64, translationY: 56 })).toBe(null)
  })

  it("ignores short horizontal swipes", () => {
    expect(getDaySwipeAction({ translationX: 40, translationY: 6 })).toBe(null)
  })
})
