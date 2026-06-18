// Device-local app preferences (notification toggles, goals, metric
// visibility, journal reminders), replacing the server-side `/preferences`
// endpoint. Stored in MMKV — a tiny single record in a natively-backed-up
// location, so it survives device restore with no server. Consumed by the
// settings screens via useServerPreferences.

export interface Preferences {
  notifications: {
    recoveryDrop: boolean
    sleepBedtimeReminder: boolean
    morningSummary: boolean
    strapBatteryLow: boolean
    weeklyDigest: boolean
  }
  goals: {
    sleepTargetMinutes: number
    strainTargetDaily: number
    activeMinutesDaily: number
  }
  metrics: {
    showHealthspan: boolean
    showStress: boolean
    showHrv: boolean
    showRespiratoryRate: boolean
  }
  journal: {
    morningReminder: boolean
    eveningReminder: boolean
  }
}

export type PreferencesPatch = {
  [K in keyof Preferences]?: Partial<Preferences[K]>
}

export const DEFAULT_PREFERENCES: Preferences = {
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

const PREFERENCES_KEY = "noop.preferences"

interface MmkvLike {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

let store: MmkvLike | null = null

function mmkv(): MmkvLike | null {
  if (store) return store
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require("react-native-mmkv")
    store = new MMKV() as MmkvLike
    return store
  } catch {
    return null
  }
}

/** Shallow-merge a patch onto a full preferences object, group by group. */
export function mergePreferences(base: Preferences, patch: PreferencesPatch): Preferences {
  return {
    notifications: { ...base.notifications, ...patch.notifications },
    goals: { ...base.goals, ...patch.goals },
    metrics: { ...base.metrics, ...patch.metrics },
    journal: { ...base.journal, ...patch.journal },
  }
}

/** Read preferences from MMKV, merged onto defaults (so new keys fill in). */
export function getPreferences(): Preferences {
  try {
    const raw = mmkv()?.getString(PREFERENCES_KEY)
    if (!raw) return mergePreferences(DEFAULT_PREFERENCES, {})
    return mergePreferences(DEFAULT_PREFERENCES, JSON.parse(raw) as PreferencesPatch)
  } catch {
    return mergePreferences(DEFAULT_PREFERENCES, {})
  }
}

export function setPreferences(next: Preferences): void {
  try {
    mmkv()?.set(PREFERENCES_KEY, JSON.stringify(next))
  } catch {
    // best effort — MMKV unavailable (e.g. first run before native init).
  }
}
