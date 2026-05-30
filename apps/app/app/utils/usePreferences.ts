import { useEffect, useState, useCallback } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Master-plan §4.11 "Hide metrics": users should be able to opt out of
// metrics they don't want to see (Whoop pattern — important for users
// who'd rather not have an age-framed score). Persisted via AsyncStorage
// so the choice survives across launches without a backend round-trip.

const KEY_PREFIX = "@noop/pref/"

type PreferenceKey = "showHealthspan"

const DEFAULTS: Record<PreferenceKey, boolean> = {
  showHealthspan: true,
}

export function usePreference(key: PreferenceKey): {
  value: boolean
  setValue: (next: boolean) => Promise<void>
  loading: boolean
} {
  const [value, setValueState] = useState<boolean>(DEFAULTS[key])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(`${KEY_PREFIX}${key}`)
      .then((raw) => {
        if (cancelled) return
        if (raw == null) {
          setValueState(DEFAULTS[key])
        } else {
          setValueState(raw === "true")
        }
      })
      .catch(() => {
        if (!cancelled) setValueState(DEFAULTS[key])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  const setValue = useCallback(
    async (next: boolean) => {
      setValueState(next)
      try {
        await AsyncStorage.setItem(`${KEY_PREFIX}${key}`, next ? "true" : "false")
      } catch (e) {
        console.warn(`[prefs] failed to persist ${key}`, e)
      }
    },
    [key],
  )

  return { value, setValue, loading }
}
