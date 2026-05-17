import { useCallback, useEffect, useState } from "react"

// Single-source-of-truth state held in a URL search param. Reads on mount
// from ?key=value, then writes future changes back via history.replaceState
// so the URL stays shareable without forcing a navigation.
//
// `fromStorage` is an optional fallback when the URL is empty (lets
// the previous-session tab/date survive across browser restarts).
export function useUrlState(
  key: string,
  initial: string,
  fromStorage?: () => string | null,
): [string, (next: string) => void] {
  const [value, setValueState] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get(key)
    if (fromUrl !== null) return fromUrl
    if (fromStorage) {
      const fromStore = fromStorage()
      if (fromStore) return fromStore
    }
    return initial
  })

  const setValue = useCallback(
    (next: string) => {
      setValueState(next)
    },
    [],
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get(key) === value) return
    params.set(key, value)
    const qs = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
  }, [key, value])

  return [value, setValue]
}
