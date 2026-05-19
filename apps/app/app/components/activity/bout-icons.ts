export type ActivityVisual = {
  sfSymbol: string
  tintHex: string
  backgroundHex: string
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function entry(sfSymbol: string, tintHex: string): ActivityVisual {
  return { sfSymbol, tintHex, backgroundHex: withAlpha(tintHex, 0.18) }
}

export const ACTIVITY_VISUALS = {
  "Running":        entry("figure.run", "#FF8A8A"),
  "Walking":        entry("figure.walk", "#4ADE80"),
  "Hiking":         entry("figure.hiking", "#A78BFA"),
  "Cycling":        entry("bicycle", "#64D2FF"),
  "Strength":       entry("figure.strengthtraining.functional", "#FFA42B"),
  "HIIT":           entry("bolt.fill", "#FBBF24"),
  "Stair Climb":    entry("figure.stair.stepper", "#C48BF8"),
  "Cardio":         entry("heart.fill", "#9492F5"),
  "Mixed":          entry("square.grid.2x2", "#C7C7CC"),
  "Light Activity": entry("figure.walk.motion", "#AEAEB2"),
  "Candidate":      entry("questionmark.circle.fill", "#5E5CE6"),
  "Off-Wrist":      entry("wave.3.left.slash", "#6B6B70"),
  "No Data":        entry("wifi.slash", "#6B6B70"),
} as const satisfies Record<string, ActivityVisual>

export type ActivityVisualKey = keyof typeof ACTIVITY_VISUALS

export function visualForType(type: string): ActivityVisual {
  return (ACTIVITY_VISUALS as Record<string, ActivityVisual>)[type]
    ?? ACTIVITY_VISUALS["Light Activity"]
}
