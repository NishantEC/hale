import { DarkTheme, Theme } from "@react-navigation/native"

// Feeds Tamagui's active theme values into react-navigation's ThemeProvider
// so nav bar / tab bar colors track the app theme.
export function useNavigationTheme(): Theme {
  return {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: "#151517",
      card: "#1C1C1F",
      text: "#FFFFFF",
      border: "#2A2A2E",
      primary: "#7C3AED",
      notification: "#DC2626",
    },
  }
}
