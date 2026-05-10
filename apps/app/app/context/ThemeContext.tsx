import {
  createContext,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react"
import { useColorScheme, View } from "react-native"
import { useMMKVString } from "react-native-mmkv"

import { applyColorMode } from "@/utils/localTheme"

export type ColorMode = "system" | "light" | "dark"

type ThemeContextValue = {
  mode: ColorMode
  setMode: (mode: ColorMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "ThemeProvider.mode"

function isColorMode(value: unknown): value is ColorMode {
  return value === "system" || value === "light" || value === "dark"
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [storedMode, setStoredMode] = useMMKVString(STORAGE_KEY)
  const systemScheme = useColorScheme()

  const mode: ColorMode = isColorMode(storedMode) ? storedMode : "system"
  const isDark =
    mode === "dark" || (mode === "system" && systemScheme === "dark")

  useMemo(() => applyColorMode(isDark), [isDark])

  const setMode = useCallback(
    (next: ColorMode) => {
      setStoredMode(next)
    },
    [setStoredMode],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, isDark }),
    [mode, setMode, isDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function ThemedSubtree({ children }: { children: ReactNode }) {
  const { isDark } = useColorMode()
  return (
    <View key={isDark ? "dark" : "light"} style={{ flex: 1 }}>
      {children}
    </View>
  )
}

export function useColorMode() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useColorMode must be used within a ThemeProvider")
  }
  return ctx
}
