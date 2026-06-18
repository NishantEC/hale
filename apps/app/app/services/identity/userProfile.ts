// Device-local demographics, replacing the server-side Better Auth `user`
// columns (dateOfBirth, biologicalSex, heightCm, weightKg). Stored in MMKV
// — a tiny single record that lives in a natively-backed-up location, so it
// survives device restore without any server. Consumed by the on-device
// Healthspan compute.

export type BiologicalSex = "male" | "female" | "other"

export interface UserProfile {
  /** ISO date (YYYY-MM-DD) or null when unset. */
  dateOfBirth: string | null
  biologicalSex: BiologicalSex | null
  heightCm: number | null
  weightKg: number | null
}

const PROFILE_KEY = "noop.userProfile"

const EMPTY: UserProfile = {
  dateOfBirth: null,
  biologicalSex: null,
  heightCm: null,
  weightKg: null,
}

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

export function getUserProfile(): UserProfile {
  try {
    const raw = mmkv()?.getString(PROFILE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

export function setUserProfile(patch: Partial<UserProfile>): UserProfile {
  const next: UserProfile = { ...getUserProfile(), ...patch }
  try {
    mmkv()?.set(PROFILE_KEY, JSON.stringify(next))
  } catch {
    // best effort — MMKV unavailable (e.g. first run before native init).
  }
  return next
}

/** True once any demographic field has been set. */
export function hasUserProfile(): boolean {
  const p = getUserProfile()
  return (
    p.dateOfBirth !== null ||
    p.biologicalSex !== null ||
    p.heightCm !== null ||
    p.weightKg !== null
  )
}
