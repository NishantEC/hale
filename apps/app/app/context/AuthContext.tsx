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
import { wipeDatabaseForLogout } from "@/services/db/wipe"
import {
  registerSessionClearedCallback,
  setSessionToken,
} from "@/services/api/noopClient"

const SECURE_TOKEN_KEY = "noop.authToken"
const MMKV_EMAIL_KEY = "AuthProvider.authEmail"

export type AuthContextType = {
  isAuthenticated: boolean
  authToken: string | null
  authEmail: string | null
  setAuthToken: (token: string | null) => Promise<void>
  setAuthEmail: (email: string) => void
  logout: () => Promise<void>
  validationError: string
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [authToken, setAuthTokenState] = useState<string | null>(null)
  const [authEmail, setAuthEmailState] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(SECURE_TOKEN_KEY).then((t) => {
      if (active && t) setAuthTokenState(t)
    })
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      const email = mmkv.getString(MMKV_EMAIL_KEY)
      if (active && email) setAuthEmailState(email)
    } catch {
      // MMKV unavailable on first install — no email to restore.
    }
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setSessionToken(authToken)
    setActiveUserId(authToken && authEmail ? authEmail : null)
  }, [authToken, authEmail])

  useEffect(() => {
    registerSessionClearedCallback(() => {
      setAuthTokenState(null)
      setActiveUserId(null)
    })
  }, [])

  const setAuthToken = useCallback(async (token: string | null) => {
    if (token) {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token)
    } else {
      await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY)
    }
    setAuthTokenState(token)
  }, [])

  const setAuthEmail = useCallback((email: string) => {
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      mmkv.set(MMKV_EMAIL_KEY, email)
    } catch {
      // best effort
    }
    setAuthEmailState(email)
  }, [])

  const logout = useCallback(async () => {
    await setAuthToken(null)
    setAuthEmailState(null)
    try {
      const { MMKV } = require("react-native-mmkv")
      const mmkv = new MMKV()
      mmkv.delete(MMKV_EMAIL_KEY)
    } catch {
      // best effort
    }
    void wipeDatabaseForLogout().catch((err) =>
      console.warn("[auth] db wipe failed", err),
    )
  }, [setAuthToken])

  const validationError = useMemo(() => {
    if (!authEmail || authEmail.length === 0) return "can't be blank"
    if (authEmail.length < 6) return "must be at least 6 characters"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail))
      return "must be a valid email address"
    return ""
  }, [authEmail])

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: !!authToken,
      authToken,
      authEmail,
      setAuthToken,
      setAuthEmail,
      logout,
      validationError,
    }),
    [authToken, authEmail, setAuthToken, setAuthEmail, logout, validationError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
