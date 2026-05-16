import {
  Airplane,
  Barbell,
  BookOpen,
  Coffee,
  DeviceMobile,
  ForkKnife,
  Heartbeat,
  Icon as PhosphorIcon,
  Leaf,
  Moon,
  User,
  WarningCircle,
  Wine,
} from "phosphor-react-native"

export type InputType =
  | { kind: "toggle" } // yes/no — logs with intensity=1
  | { kind: "quantity"; unit: string; max: number } // e.g. "cups", max 6
  | { kind: "scale"; labels: string[] } // e.g. ["Low", "Medium", "High"]

export interface FactorDefinition {
  tag: string
  label: string
  icon: PhosphorIcon
  color: string
  input: InputType
}

export const JOURNAL_FACTORS: FactorDefinition[] = [
  // Substances
  { tag: "caffeine", label: "Caffeine", icon: Coffee, color: "#F59E0B", input: { kind: "quantity", unit: "cups", max: 6 } },
  { tag: "alcohol", label: "Alcohol", icon: Wine, color: "#F87171", input: { kind: "quantity", unit: "drinks", max: 8 } },
  { tag: "melatonin", label: "Melatonin", icon: Moon, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "supplements", label: "Supplements", icon: Heartbeat, color: "#34D399", input: { kind: "toggle" } },
  // Lifestyle
  { tag: "late_meal", label: "Late Meal", icon: ForkKnife, color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "screen_time", label: "Screen Time", icon: DeviceMobile, color: "#60A5FA", input: { kind: "scale", labels: ["Minimal", "Moderate", "Heavy"] } },
  { tag: "reading", label: "Reading", icon: BookOpen, color: "#34D399", input: { kind: "toggle" } },
  // Wellness
  { tag: "meditation", label: "Meditation", icon: Leaf, color: "#34D399", input: { kind: "toggle" } },
  { tag: "exercise", label: "Exercise", icon: Barbell, color: "#F59E0B", input: { kind: "scale", labels: ["Light", "Moderate", "Hard"] } },
  { tag: "stretching", label: "Stretching", icon: User, color: "#A78BFA", input: { kind: "toggle" } },
  // Context
  { tag: "stress", label: "High Stress", icon: WarningCircle, color: "#F87171", input: { kind: "scale", labels: ["Low", "Medium", "High"] } },
  { tag: "travel", label: "Travel", icon: Airplane, color: "#60A5FA", input: { kind: "toggle" } },
]
