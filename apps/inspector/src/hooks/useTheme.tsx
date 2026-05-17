import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type Ctx = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (t: Theme) => void
}

const ThemeCtx = createContext<Ctx | null>(null)
const STORAGE_KEY = "noop.inspector.theme"

function getSystem(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStored(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === "light" || v === "dark" || v === "system") return v
  return "system"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    theme === "system" ? getSystem() : theme,
  )

  useEffect(() => {
    const resolved = theme === "system" ? getSystem() : theme
    setResolvedTheme(resolved)
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light"
      setResolvedTheme(r)
      document.documentElement.classList.toggle("dark", r === "dark")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }

  return <ThemeCtx.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error("useTheme must be used inside ThemeProvider")
  return v
}
