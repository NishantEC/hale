import {
  Airplane,
  Alarm,
  ArrowRight,
  ArrowsClockwise,
  Barbell,
  BookOpen,
  Brain,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CheckCircle,
  ClockCountdown,
  BatteryCharging,
  Calendar,
  CloudArrowDown,
  Coffee,
  CircleIcon,
  DeviceMobile,
  Drop,
  ForkKnife,
  Pulse,
  Heart,
  Heartbeat,
  Info,
  Leaf,
  Lightning,
  Moon,
  NotePencil,
  Plus,
  Sparkle,
  Sun,
  Trash,
  User,
  Warning,
  WarningCircle,
  WarningOctagon,
  Watch,
  WaveSine,
  Wine,
  Wind,
  X,
  Icon as PhosphorIconType,
  IconProps,
  IconWeight,
} from "phosphor-react-native"

type AppIconName =
  | "add"
  | "airplane"
  | "alarm"
  | "alert-circle"
  | "arrow-forward"
  | "barbell"
  | "battery-charging"
  | "body"
  | "brain"
  | "calendar"
  | "book"
  | "cafe"
  | "checkmark-circle"
  | "chevron-back"
  | "chevron-down"
  | "chevron-forward"
  | "chevron-up"
  | "clock-countdown"
  | "close"
  | "cloud-download"
  | "sync"
  | "drop"
  | "fitness"
  | "flash"
  | "heart"
  | "information"
  | "journal"
  | "leaf"
  | "moon"
  | "note-pencil"
  | "pulse"
  | "sparkle"
  | "water"
  | "phone"
  | "restaurant"
  | "sunny"
  | "trash"
  | "ellipse"
  | "warning"
  | "warning-octagon"
  | "watch"
  | "wave-sine"
  | "wine"
  | "wind"

// Ionicons name compatibility — accepts the legacy names we used and
// maps them to a stable internal vocabulary, so existing call sites
// can switch with a one-token find-and-replace.
const ALIAS_MAP: Record<string, AppIconName> = {
  "add": "add",
  "airplane-outline": "airplane",
  "airplane": "airplane",
  "alarm-outline": "alarm",
  "alarm": "alarm",
  "alert-circle": "alert-circle",
  "alert-circle-outline": "alert-circle",
  "arrow-forward": "arrow-forward",
  "barbell-outline": "barbell",
  "barbell": "barbell",
  "battery-charging-outline": "battery-charging",
  "battery-charging": "battery-charging",
  "body-outline": "body",
  "body": "body",
  "brain": "brain",
  "brain-outline": "brain",
  "calendar-outline": "calendar",
  "calendar": "calendar",
  "book-outline": "book",
  "book": "book",
  "cafe-outline": "cafe",
  "cafe": "cafe",
  "checkmark-circle": "checkmark-circle",
  "checkmark-circle-outline": "checkmark-circle",
  "chevron-back": "chevron-back",
  "chevron-down": "chevron-down",
  "chevron-down-outline": "chevron-down",
  "chevron-forward": "chevron-forward",
  "chevron-up": "chevron-up",
  "chevron-up-outline": "chevron-up",
  "clock-countdown": "clock-countdown",
  "clock-countdown-outline": "clock-countdown",
  "close": "close",
  "cloud-download-outline": "cloud-download",
  "drop": "drop",
  "drop-outline": "drop",
  "sync": "sync",
  "sync-outline": "sync",
  "refresh": "sync",
  "refresh-outline": "sync",
  "reload": "sync",
  "ellipse-outline": "ellipse",
  "ellipse": "ellipse",
  "fitness-outline": "fitness",
  "fitness": "fitness",
  "flash": "flash",
  "heart": "heart",
  "heart-outline": "heart",
  "info-outline": "information",
  "information-circle-outline": "information",
  "information-circle": "information",
  "journal-outline": "journal",
  "journal": "journal",
  "leaf-outline": "leaf",
  "leaf": "leaf",
  "moon-outline": "moon",
  "moon": "moon",
  "note-pencil": "note-pencil",
  "note-pencil-outline": "note-pencil",
  "square.and.pencil": "note-pencil",
  "phone-portrait-outline": "phone",
  "phone-portrait": "phone",
  "pulse-outline": "pulse",
  "pulse": "pulse",
  "restaurant-outline": "restaurant",
  "restaurant": "restaurant",
  "sparkle": "sparkle",
  "sparkle-outline": "sparkle",
  "sunny-outline": "sunny",
  "sunny": "sunny",
  "trash-outline": "trash",
  "trash": "trash",
  "warning": "warning",
  "warning-octagon": "warning-octagon",
  "warning-octagon-outline": "warning-octagon",
  "watch-outline": "watch",
  "watch": "watch",
  "water-outline": "water",
  "water": "water",
  "wave-sine": "wave-sine",
  "wine-outline": "wine",
  "wine": "wine",
  "wind": "wind",
  "wind-outline": "wind",
}

const COMPONENT_MAP: Record<AppIconName, PhosphorIconType> = {
  "add": Plus,
  "airplane": Airplane,
  "alarm": Alarm,
  "alert-circle": WarningCircle,
  "arrow-forward": ArrowRight,
  "barbell": Barbell,
  "battery-charging": BatteryCharging,
  "body": User,
  "brain": Brain,
  "calendar": Calendar,
  "book": BookOpen,
  "cafe": Coffee,
  "checkmark-circle": CheckCircle,
  "clock-countdown": ClockCountdown,
  "chevron-back": CaretLeft,
  "chevron-down": CaretDown,
  "chevron-forward": CaretRight,
  "chevron-up": CaretUp,
  "close": X,
  "cloud-download": CloudArrowDown,
  "drop": Drop,
  "sync": ArrowsClockwise,
  "ellipse": CircleIcon,
  "fitness": Heartbeat,
  "flash": Lightning,
  "heart": Heart,
  "information": Info,
  "journal": BookOpen,
  "leaf": Leaf,
  "moon": Moon,
  "note-pencil": NotePencil,
  "phone": DeviceMobile,
  "pulse": Pulse,
  "sparkle": Sparkle,
  "restaurant": ForkKnife,
  "sunny": Sun,
  "trash": Trash,
  "warning": Warning,
  "warning-octagon": WarningOctagon,
  "watch": Watch,
  "water": Drop,
  "wave-sine": WaveSine,
  "wine": Wine,
  "wind": Wind,
}

export type PhosphorIconName = AppIconName | keyof typeof ALIAS_MAP

interface Props extends Omit<IconProps, "weight"> {
  name: PhosphorIconName
  weight?: IconWeight
}

export function PhosphorIcon({ name, weight = "regular", size = 20, ...rest }: Props) {
  const canonical = (ALIAS_MAP as Record<string, AppIconName>)[name] ?? (name as AppIconName)
  const Component = COMPONENT_MAP[canonical]
  if (!Component) {
    if (__DEV__) console.warn(`[PhosphorIcon] no icon for "${String(name)}"`)
    return null
  }
  return <Component weight={weight} size={size} {...rest} />
}
