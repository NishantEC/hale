import * as SecureStore from "expo-secure-store"

// The device-local user id keys every local DB row (mirrorColumns.userId).
// In the serverless app there is exactly one user per device; the id is
// persisted once and stable thereafter.
const LOCAL_ID_KEY = "noop.localUserId"
// The email persisted by the pre-cutover auth flow. Reused as the local id
// so data written before the cutover (keyed by that email) is not orphaned.
const LEGACY_EMAIL_KEY = "AuthProvider.authEmail"

let cachedId: string | null = null

function readLegacyEmail(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require("react-native-mmkv")
    const email = new MMKV().getString(LEGACY_EMAIL_KEY)
    return email && email.length > 0 ? email : null
  } catch {
    return null
  }
}

function generateLocalId(): string {
  const rand = Math.random().toString(36).slice(2, 12)
  return `local-${Date.now().toString(36)}-${rand}`
}

/**
 * Resolve the stable device-local user id, persisting it on first run.
 * Resolution order:
 *   1. an already-persisted local id (stable across launches),
 *   2. the legacy auth email (so pre-cutover local data is preserved),
 *   3. a freshly generated id (clean install).
 * Idempotent and cached — safe to call on every boot.
 */
export async function resolveLocalUserId(): Promise<string> {
  if (cachedId) return cachedId
  // Prefer the legacy email (MMKV) — synchronous and reliable, with none of
  // the keychain/locked-device pitfalls of SecureStore. This is the common
  // case (the user had an account) and reusing it preserves existing local
  // data. Identity resolution must never block on the keychain, since all
  // on-device compute keys off the resolved id.
  const email = readLegacyEmail()
  if (email) {
    cachedId = email
    return email
  }
  // Fresh install: a persisted generated id, via SecureStore but guarded.
  try {
    const existing = await SecureStore.getItemAsync(LOCAL_ID_KEY)
    if (existing) {
      cachedId = existing
      return existing
    }
  } catch {
    // keychain unavailable — fall through to a fresh id
  }
  const id = generateLocalId()
  try {
    await SecureStore.setItemAsync(LOCAL_ID_KEY, id)
  } catch {
    // best effort — the id stays stable within this launch via cachedId
  }
  cachedId = id
  return id
}

/** Synchronous read of the cached id, or null before {@link resolveLocalUserId}. */
export function peekLocalUserId(): string | null {
  return cachedId
}
