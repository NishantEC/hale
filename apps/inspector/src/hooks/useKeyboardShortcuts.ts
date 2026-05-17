import { useEffect } from "react"

type Bindings = Record<string, (e: KeyboardEvent) => void>

// Key format: lowercased Key, prefixed with "mod+" if Cmd (macOS) or
// Ctrl (everywhere else) was held. Letter keys ignored when an input or
// textarea has focus, except Escape which always fires.
export function useKeyboardShortcuts(bindings: Bindings, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable

      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey
      const lookup = mod ? `mod+${key}` : key

      if (inEditable && lookup !== "escape" && !mod) return

      const fn = bindings[lookup]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [bindings, enabled])
}
