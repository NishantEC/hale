// Translation map for the internal factor tags the pipeline emits. The raw
// tags (CAFFEINE_LATE, ALCOHOL_2_PLUS, …) must never leak into the UI; this
// folds them to human-readable labels. Unknown tags fall back to a title-cased
// version so we never show raw SCREAMING_SNAKE strings.
export const FACTOR_TAG_LABELS: Record<string, string> = {
  CAFFEINE_LATE: "Caffeine after 2pm",
  CAFFEINE_NONE: "No caffeine",
  ALCOHOL_NONE: "No alcohol",
  ALCOHOL_1: "1 drink",
  ALCOHOL_2_PLUS: "2+ drinks",
  LATE_MEAL: "Late meal",
  LATE_SCREEN: "Late screen time",
  EXERCISE_LATE: "Late workout",
  EXERCISE_HARD: "Hard workout",
  EXERCISE_REST: "Rest day",
  STRESS_HIGH: "High stress day",
  STRESS_LOW: "Low stress day",
  TRAVEL: "Traveling",
  SHIFT_WORK: "Shift work",
  NAP: "Daytime nap",
  ILLNESS: "Feeling unwell",
  MEDITATION: "Meditation",
  MEDICATION: "Medication",
  WIND_DOWN: "Wound down before bed",
  COLD_ROOM: "Cool room",
  HOT_ROOM: "Hot room",
}

export function humanizeFactorTag(tag: string): string {
  if (FACTOR_TAG_LABELS[tag]) return FACTOR_TAG_LABELS[tag]
  return tag
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ")
}
