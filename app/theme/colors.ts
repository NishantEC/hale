const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",

  primary100: "#F4E0D9",
  primary200: "#E8C1B4",
  primary300: "#DDA28E",
  primary400: "#D28468",
  primary500: "#C76542",
  primary600: "#A54F31",

  secondary100: "#DCDDE9",
  secondary200: "#BCC0D6",
  secondary300: "#9196B9",
  secondary400: "#626894",
  secondary500: "#41476E",

  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

  angry100: "#F2D6CD",
  angry500: "#C03403",

  overlay20: "rgba(25, 16, 21, 0.2)",
  overlay50: "rgba(25, 16, 21, 0.5)",
} as const

export const colors = {
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  text: palette.neutral800,
  textDim: palette.neutral600,
  textMuted: palette.neutral500,
  background: palette.neutral200,
  /** Deeper background for full-screen scenes (home, sleep detail). */
  screenBackground: "#F0EDE8",
  border: palette.neutral400,
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,
  error: palette.angry500,
  errorBackground: palette.angry100,

  // Surfaces
  surfaceCard: "rgba(0, 0, 0, 0.035)",
  surfaceCardBorder: "rgba(0, 0, 0, 0.06)",
  surfaceElevated: "rgba(0, 0, 0, 0.05)",
  surfaceSubtle: "rgba(0, 0, 0, 0.03)",
  cardBase: "rgba(255, 255, 255, 0.92)",
  tabBarBlur: "rgba(247, 247, 249, 0.72)",
  divider: "rgba(0, 0, 0, 0.06)",

  // Icons
  iconDefault: "rgba(0, 0, 0, 0.72)",
  iconDim: "rgba(0, 0, 0, 0.38)",

  // On-surface / on-primary
  onPrimary: "#FFFFFF",
  onSurface: "#000000",

  // Status
  statusGreen: "#16A34A",
  statusAmber: "#D97706",
  statusRed: "#DC2626",

  // Metric rings
  ringSleep: "#7C3AED",
  ringRecovery: "#16A34A",
  ringStrain: "#D97706",

  // Glow SVG
  glowPrimary: palette.primary500,
  glowPrimaryFade: palette.primary400,
  glowBackground: palette.neutral200,

  // Switch track
  switchTrackOff: "rgba(0, 0, 0, 0.14)",
  switchTrackOn: "rgba(199, 101, 66, 0.42)",
} as const
