import { useCallback, useState } from "react"

import {
  getPreferences,
  mergePreferences,
  setPreferences,
  type Preferences,
  type PreferencesPatch,
} from "@/services/preferences/localPreferences"

// Device-local preferences hook, backed by MMKV. Replaces the server
// `/preferences` endpoint — reads and writes are synchronous and offline,
// so there is no loading state and nothing to fetch.
export function useServerPreferences(): {
  prefs: Preferences
  loading: boolean
  patch: (p: PreferencesPatch) => Promise<void>
  refresh: () => Promise<void>
} {
  const [prefs, setPrefs] = useState<Preferences>(getPreferences)

  const refresh = useCallback(async () => {
    setPrefs(getPreferences())
  }, [])

  const patch = useCallback(async (p: PreferencesPatch) => {
    const next = mergePreferences(getPreferences(), p)
    setPreferences(next)
    setPrefs(next)
  }, [])

  return { prefs, loading: false, patch, refresh }
}
