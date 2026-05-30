import { useCallback, useEffect, useState } from "react"
import {
  fetchPreferences,
  patchPreferences,
  type ServerPreferences,
  type ServerPreferencesPatch,
} from "@/services/api/noopClient"

// Mirror the backend DEFAULTS so the UI renders before the first fetch
// completes (and works offline). Keep in sync with
// apps/backend/src/preferences/preferences.service.ts:DEFAULTS.
const FALLBACK: ServerPreferences = {
  notifications: {
    recoveryDrop: true,
    sleepBedtimeReminder: true,
    morningSummary: true,
    strapBatteryLow: true,
    weeklyDigest: false,
  },
  goals: {
    sleepTargetMinutes: 480,
    strainTargetDaily: 12,
    activeMinutesDaily: 30,
  },
  metrics: {
    showHealthspan: true,
    showStress: true,
    showHrv: true,
    showRespiratoryRate: true,
  },
  journal: {
    morningReminder: false,
    eveningReminder: false,
  },
}

export function useServerPreferences(): {
  prefs: ServerPreferences
  loading: boolean
  patch: (p: ServerPreferencesPatch) => Promise<void>
  refresh: () => Promise<void>
} {
  const [prefs, setPrefs] = useState<ServerPreferences>(FALLBACK)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPreferences()
      setPrefs(next)
    } catch (e) {
      console.warn("[prefs] fetch failed", e)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const patch = useCallback(
    async (p: ServerPreferencesPatch) => {
      // Optimistic update so the UI snaps immediately; rollback on failure.
      const prev = prefs
      setPrefs((cur) => mergePref(cur, p))
      try {
        const next = await patchPreferences(p)
        setPrefs(next)
      } catch (e) {
        console.warn("[prefs] patch failed", e)
        setPrefs(prev)
        throw e
      }
    },
    [prefs],
  )

  return { prefs, loading, patch, refresh }
}

function mergePref(base: ServerPreferences, patch: ServerPreferencesPatch): ServerPreferences {
  const next: ServerPreferences = { ...base }
  for (const key of Object.keys(patch) as (keyof ServerPreferences)[]) {
    const sub = patch[key]
    if (!sub) continue
    next[key] = { ...(base[key] as object), ...(sub as object) } as never
  }
  return next
}
