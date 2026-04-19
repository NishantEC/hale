import { createContext, FC, PropsWithChildren, useCallback, useContext, useEffect, useMemo } from "react"
import { useMMKVString } from "react-native-mmkv"

import { setActiveUserId } from "@/services/db/session"
import { wipeDatabaseForLogout } from "@/services/db/wipe"

export type AuthContextType = {
  isAuthenticated: boolean
  authToken?: string
  authEmail?: string
  setAuthToken: (token?: string) => void
  setAuthEmail: (email: string) => void
  logout: () => void
  validationError: string
}

export const AuthContext = createContext<AuthContextType | null>(null)

export interface AuthProviderProps {}

export const AuthProvider: FC<PropsWithChildren<AuthProviderProps>> = ({ children }) => {
  const [authToken, setAuthToken] = useMMKVString("AuthProvider.authToken")
  const [authEmail, setAuthEmail] = useMMKVString("AuthProvider.authEmail")

  // Stamp the SQLite session userId whenever auth state changes.
  // Uses authEmail as the stable per-user key for local scoping
  // (the backend maps email → uuid on its own side).
  useEffect(() => {
    if (authToken && authEmail) {
      setActiveUserId(authEmail)
    } else {
      setActiveUserId(null)
    }
  }, [authToken, authEmail])

  const logout = useCallback(() => {
    setAuthToken(undefined)
    setAuthEmail("")
    // Wipe local SQLite so re-login with a different user doesn't leak data.
    void wipeDatabaseForLogout().catch((err) => console.warn("[auth] db wipe failed", err))
  }, [setAuthEmail, setAuthToken])

  const validationError = useMemo(() => {
    if (!authEmail || authEmail.length === 0) return "can't be blank"
    if (authEmail.length < 6) return "must be at least 6 characters"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) return "must be a valid email address"
    return ""
  }, [authEmail])

  const value = {
    isAuthenticated: !!authToken,
    authToken,
    authEmail,
    setAuthToken,
    setAuthEmail,
    logout,
    validationError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
