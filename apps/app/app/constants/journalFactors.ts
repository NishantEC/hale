import {
  Airplane,
  Bandaids,
  Barbell,
  Bed,
  BookOpen,
  Brain,
  Briefcase,
  Cigarette,
  Coffee,
  Couch,
  DeviceMobile,
  Drop,
  ForkKnife,
  HandHeart,
  Heartbeat,
  House,
  Icon as PhosphorIcon,
  Leaf,
  Lightbulb,
  MoonStars,
  Moon,
  MusicNote,
  Pill,
  Sun,
  ThermometerSimple,
  User,
  Users,
  WarningCircle,
  Wine,
} from "phosphor-react-native"

export type InputType =
  | { kind: "toggle" } // yes/no — logs with intensity=1
  | { kind: "quantity"; unit: string; max: number } // e.g. "cups", max 6
  | { kind: "scale"; labels: string[] } // e.g. ["Low", "Medium", "High"]

export type FactorCategory =
  | "Substances"
  | "Food & Drink"
  | "Activity"
  | "Wellness"
  | "Sleep"
  | "Circadian"
  | "Health"
  | "Social"
  | "Context"

export interface FactorDefinition {
  tag: string
  label: string
  category: FactorCategory
  icon: PhosphorIcon
  color: string
  input: InputType
}

// Vocabulary from docs/secondary-screens-master-plan-2026-05-28.md §4.9.
// Whoop-style behaviours so the journal can later correlate against sleep /
// recovery / strain. Grouped semantically; the entry screen renders the
// category as a section header. Aim ~40 to start — keep the list pruned
// to behaviours the average user can actually answer yes/no to without
// thinking.
export const JOURNAL_FACTORS: FactorDefinition[] = [
  // ─── Substances ──────────────────────────────────────────────
  { tag: "caffeine", label: "Caffeine", category: "Substances", icon: Coffee, color: "#F59E0B", input: { kind: "quantity", unit: "cups", max: 6 } },
  { tag: "caffeine_late", label: "Caffeine after 2pm", category: "Substances", icon: Coffee, color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "alcohol", label: "Alcohol", category: "Substances", icon: Wine, color: "#F87171", input: { kind: "quantity", unit: "drinks", max: 8 } },
  { tag: "nicotine", label: "Nicotine", category: "Substances", icon: Cigarette, color: "#A88B5C", input: { kind: "toggle" } },
  { tag: "melatonin", label: "Melatonin", category: "Substances", icon: MoonStars, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "supplements", label: "Supplements", category: "Substances", icon: Pill, color: "#34D399", input: { kind: "toggle" } },
  { tag: "medication", label: "Medication", category: "Substances", icon: Pill, color: "#60A5FA", input: { kind: "toggle" } },

  // ─── Food & Drink ────────────────────────────────────────────
  { tag: "late_meal", label: "Late meal", category: "Food & Drink", icon: ForkKnife, color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "heavy_meal", label: "Heavy meal", category: "Food & Drink", icon: ForkKnife, color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "hydration", label: "Hydration", category: "Food & Drink", icon: Drop, color: "#60A5FA", input: { kind: "scale", labels: ["Low", "Medium", "High"] } },
  { tag: "ate_clean", label: "Ate clean", category: "Food & Drink", icon: Leaf, color: "#34D399", input: { kind: "toggle" } },
  { tag: "high_sugar", label: "High sugar day", category: "Food & Drink", icon: ForkKnife, color: "#F87171", input: { kind: "toggle" } },

  // ─── Activity ────────────────────────────────────────────────
  { tag: "exercise", label: "Workout", category: "Activity", icon: Barbell, color: "#F59E0B", input: { kind: "scale", labels: ["Light", "Moderate", "Hard"] } },
  { tag: "workout_late", label: "Late workout", category: "Activity", icon: Barbell, color: "#F87171", input: { kind: "toggle" } },
  { tag: "stretching", label: "Stretching", category: "Activity", icon: User, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "walking", label: "Outdoor walk", category: "Activity", icon: Leaf, color: "#34D399", input: { kind: "toggle" } },
  { tag: "sedentary", label: "Sedentary day", category: "Activity", icon: Couch, color: "#978F8A", input: { kind: "toggle" } },

  // ─── Wellness ────────────────────────────────────────────────
  { tag: "meditation", label: "Meditation", category: "Wellness", icon: Leaf, color: "#34D399", input: { kind: "toggle" } },
  { tag: "breathwork", label: "Breathwork", category: "Wellness", icon: HandHeart, color: "#34D399", input: { kind: "toggle" } },
  { tag: "reading", label: "Reading", category: "Wellness", icon: BookOpen, color: "#34D399", input: { kind: "toggle" } },
  { tag: "journaling", label: "Journaling", category: "Wellness", icon: BookOpen, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "therapy", label: "Therapy", category: "Wellness", icon: HandHeart, color: "#A78BFA", input: { kind: "toggle" } },

  // ─── Sleep ───────────────────────────────────────────────────
  { tag: "nap", label: "Daytime nap", category: "Sleep", icon: Bed, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "wound_down", label: "Wound down before bed", category: "Sleep", icon: Moon, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "screen_late", label: "Late screen time", category: "Sleep", icon: DeviceMobile, color: "#60A5FA", input: { kind: "scale", labels: ["Minimal", "Moderate", "Heavy"] } },
  { tag: "cold_room", label: "Cool room", category: "Sleep", icon: ThermometerSimple, color: "#60A5FA", input: { kind: "toggle" } },
  { tag: "hot_room", label: "Hot room", category: "Sleep", icon: ThermometerSimple, color: "#F87171", input: { kind: "toggle" } },

  // ─── Circadian ───────────────────────────────────────────────
  { tag: "morning_sun", label: "Morning sunlight", category: "Circadian", icon: Sun, color: "#F59E0B", input: { kind: "toggle" } },
  { tag: "travel", label: "Travel / time zone", category: "Circadian", icon: Airplane, color: "#60A5FA", input: { kind: "toggle" } },
  { tag: "shift_work", label: "Shift work", category: "Circadian", icon: Briefcase, color: "#978F8A", input: { kind: "toggle" } },

  // ─── Health ──────────────────────────────────────────────────
  { tag: "stress", label: "Stress level", category: "Health", icon: Brain, color: "#F87171", input: { kind: "scale", labels: ["Low", "Medium", "High"] } },
  { tag: "illness", label: "Feeling unwell", category: "Health", icon: Bandaids, color: "#F87171", input: { kind: "toggle" } },
  { tag: "headache", label: "Headache", category: "Health", icon: WarningCircle, color: "#F87171", input: { kind: "toggle" } },
  { tag: "menstrual", label: "Menstrual cycle", category: "Health", icon: Heartbeat, color: "#F87171", input: { kind: "scale", labels: ["Pre", "Flow", "Post"] } },
  { tag: "injury", label: "Injury / soreness", category: "Health", icon: WarningCircle, color: "#F87171", input: { kind: "toggle" } },

  // ─── Social ──────────────────────────────────────────────────
  { tag: "social", label: "Social time", category: "Social", icon: Users, color: "#34D399", input: { kind: "toggle" } },
  { tag: "late_night_out", label: "Late night out", category: "Social", icon: MusicNote, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "alone_time", label: "Alone time", category: "Social", icon: User, color: "#60A5FA", input: { kind: "toggle" } },

  // ─── Context ─────────────────────────────────────────────────
  { tag: "stayed_home", label: "Stayed home", category: "Context", icon: House, color: "#A78BFA", input: { kind: "toggle" } },
  { tag: "creative_work", label: "Creative work", category: "Context", icon: Lightbulb, color: "#F59E0B", input: { kind: "toggle" } },
]
