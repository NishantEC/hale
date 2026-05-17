import { useState } from "react"

// Shared cursor state for cross-chart hover on the Sleep tab. Charts
// pass cursorMs down for line rendering and call onCursorChange with
// the absolute millisecond timestamp when the user hovers.
export function useScrubController(): {
  cursorMs: number | null
  setCursorMs: (next: number | null) => void
} {
  const [cursorMs, setCursorMs] = useState<number | null>(null)
  return { cursorMs, setCursorMs }
}
