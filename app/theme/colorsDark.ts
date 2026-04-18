const palette = {
  neutral900: "#FFFFFF",
  neutral800: "#F0F1F5",
  neutral700: "#D5D7E1",
  neutral600: "#A2A6B3",
  neutral500: "#777C8A",
  neutral400: "#2B2C32",
  neutral300: "#1A1B20",
  neutral200: "#0B0B0F",
  neutral100: "#000000",

  primary600: "#EAF3FF",
  primary500: "#BDD7FF",
  primary400: "#91B9EE",
  primary300: "#6796CC",
  primary200: "#4A79A6",
  primary100: "#35597A",

  secondary500: "#EAF3FF",
  secondary400: "#BDD7FF",
  secondary300: "#91B9EE",
  secondary200: "#6796CC",
  secondary100: "#4A79A6",

  accent500: "#EAF3FF",
  accent400: "#BDD7FF",
  accent300: "#91B9EE",
  accent200: "#6796CC",
  accent100: "#4A79A6",

  angry100: "#3A1A1A",
  angry500: "#FF5555",

  // Sleep stage colors
  stageAwake: "#888888",
  stageLight: "#8066E6",
  stageDeep: "#D94D80",
  stageRem: "#B333CC",

  overlay20: "rgba(7, 7, 10, 0.32)",
  overlay50: "rgba(7, 7, 10, 0.6)",
} as const

export const colors = {
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  text: palette.neutral800,
  textDim: palette.neutral600,
  textMuted: palette.neutral500,
  background: palette.neutral200,
  screenBackground: "#06070A",
  border: palette.neutral400,
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,
  error: palette.angry500,
  errorBackground: palette.angry100,

  // Surfaces
  surfaceCard: "rgba(255, 255, 255, 0.04)",
  surfaceCardBorder: "rgba(255, 255, 255, 0.07)",
  surfaceElevated: "rgba(255, 255, 255, 0.085)",
  surfaceSubtle: "rgba(255, 255, 255, 0.05)",
  cardBase: "rgba(20, 20, 25, 0.92)",
  tabBarBlur: "rgba(12, 12, 16, 0.28)",
  divider: "rgba(255, 255, 255, 0.06)",

  // Icons
  iconDefault: "rgba(255, 255, 255, 0.86)",
  iconDim: "rgba(255, 255, 255, 0.5)",

  // On-surface / on-primary
  onPrimary: "#09090B",
  onSurface: "#FFFFFF",

  // Status
  statusGreen: "#57D37C",
  statusAmber: "#FFD666",
  statusRed: "#EF4444",

  // Metric rings
  ringSleep: "#A78BFA",
  ringRecovery: "#34D399",
  ringStrain: "#F59E0B",

  // Glow SVG
  glowPrimary: "#4D9FFF",
  glowPrimaryFade: "#2B7AE8",
  glowBackground: "#06070A",

  // Switch track
  switchTrackOff: "rgba(255, 255, 255, 0.14)",
  switchTrackOn: "rgba(171, 204, 255, 0.52)",
} as const
