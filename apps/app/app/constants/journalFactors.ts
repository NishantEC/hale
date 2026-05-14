import type { PhosphorIconName } from "@/components/PhosphorIcon"

export type InputType =
  | { kind: "toggle" } // yes/no — logs with intensity=1
  | { kind: "quantity"; unit: string; max: number } // e.g. "cups", max 6
  | { kind: "scale"; labels: string[] } // e.g. ["Low", "Medium", "High"]

export interface FactorDefinition {
  tag: string
  label: string
  icon: PhosphorIconName
  color: string
  input: InputType
}

export const JOURNAL_FACTORS: FactorDefinition[] = [
  // Substances
  { tag: "caffeine", label: "Caffeine", icon: "cafe-outline", color: "#F59E0B", input: { kind: "quantity", unit: "cups", max: 6 } },
  { tag: "alcohol", label: "Alcohol", icon: "wine-outline", color: "#F87171", input: { kind: "quantity", unit: "drinks", max: 8 } },
  { tag: "melatonin", label: "Melatonin", icon: "moon-outline", color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "supplements", label: "Supplements", icon: "fitness-outline", color: "#34D399", input: { kind: "toggle" } },
  // Lifestyle
  { tag: "late_meal", label: "Late Meal", icon: "restaurant-outline", color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "screen_time", label: "Screen Time", icon: "phone-portrait-outline", color: "#60A5FA", input: { kind: "scale", labels: ["Minimal", "Moderate", "Heavy"] } },
  { tag: "reading", label: "Reading", icon: "book-outline", color: "#34D399", input: { kind: "toggle" } },
  // Wellness
  { tag: "meditation", label: "Meditation", icon: "leaf-outline", color: "#34D399", input: { kind: "toggle" } },
  { tag: "exercise", label: "Exercise", icon: "barbell-outline", color: "#F59E0B", input: { kind: "scale", labels: ["Light", "Moderate", "Hard"] } },
  { tag: "stretching", label: "Stretching", icon: "body-outline", color: "#A78BFA", input: { kind: "toggle" } },
  // Context
  { tag: "stress", label: "High Stress", icon: "alert-circle-outline", color: "#F87171", input: { kind: "scale", labels: ["Low", "Medium", "High"] } },
  { tag: "travel", label: "Travel", icon: "airplane-outline", color: "#60A5FA", input: { kind: "toggle" } },
]
