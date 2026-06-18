import * as SecureStore from "expo-secure-store"
import {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import { setActiveUserId } from "@/services/db/session"
import { resolveLocalUserId } from "@/services/identity/localIdentity"

// Legacy keys from the pre-cutover auth era. The token is only cleared (never
// written) now; the email is read once for display in settings.
const SECURE_TOKEN_KEY = "noop.authToken"
const MMKV_EMAIL_KEY = "AuthProvider.authEmail"

// Serverless identity provider. There is no account login any more: the app
// resolves a stable device-local user id at boot and is always "authenticated"
// to it. `authEmail` is retained only as a display label in settings.
export type AuthContextType = {
  isAuthenticated: boolean
  authEmail: string | null
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [localUserId, setLocalUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    // Resolve the device-local user id (reusing the legacy email when present)
    // and key all local data by it.
    void resolveLocalUserId().then((id) => {
      if (!active) return
      setLocalUserId(id)
      setActiveUserId(id)
    })

    // Display-only: restore the legacy email if one was stored.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MMKV } = require("react-native-mmkv")
      const email = new MMKV().getString(MMKV_EMAIL_KEY)
      if (email) setAuthEmail(email)
    } catch {
      // MMKV unavailable on first install — no email to restore.
    }

    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    // Serverless: no account session to end. Clear any stale legacy auth token;
    // the device-local identity and all local data are preserved.
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => undefined)
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: !!localUserId,
      authEmail,
      logout,
    }),
    [localUserId, authEmail, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
