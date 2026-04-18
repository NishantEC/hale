export type DaySwipeAction = "previous" | "next" | null

type DaySwipeSample = {
  translationX: number
  translationY: number
}

export function shouldLockHomeScroll({ translationX, translationY }: DaySwipeSample) {
  const horizontal = Math.abs(translationX)
  const vertical = Math.abs(translationY)
  return horizontal > Math.max(10, vertical * 1.15)
}

export function getDaySwipeAction({ translationX, translationY }: DaySwipeSample): DaySwipeAction {
  if (Math.abs(translationX) <= Math.abs(translationY) * 1.2) return null
  if (translationX > 50) return "previous"
  if (translationX < -50) return "next"
  return null
}
