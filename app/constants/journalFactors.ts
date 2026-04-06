import type { Ionicons } from "@expo/vector-icons"

export interface FactorDefinition {
  tag: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
}

export const JOURNAL_FACTORS: FactorDefinition[] = [
  { tag: "caffeine", label: "Caffeine", icon: "cafe-outline", color: "#F59E0B" },
  { tag: "alcohol", label: "Alcohol", icon: "wine-outline", color: "#F87171" },
  { tag: "melatonin", label: "Melatonin", icon: "moon-outline", color: "#A78BFA" },
  { tag: "supplements", label: "Supplements", icon: "fitness-outline", color: "#34D399" },
  { tag: "late_meal", label: "Late Meal", icon: "restaurant-outline", color: "#F59E0B" },
  { tag: "screen_time", label: "Screen Time", icon: "phone-portrait-outline", color: "#60A5FA" },
  { tag: "reading", label: "Reading", icon: "book-outline", color: "#34D399" },
  { tag: "meditation", label: "Meditation", icon: "leaf-outline", color: "#34D399" },
  { tag: "exercise", label: "Exercise", icon: "barbell-outline", color: "#F59E0B" },
  { tag: "stretching", label: "Stretching", icon: "body-outline", color: "#A78BFA" },
  { tag: "stress", label: "High Stress", icon: "alert-circle-outline", color: "#F87171" },
  { tag: "travel", label: "Travel", icon: "airplane-outline", color: "#60A5FA" },
]
