import { useState } from "react"
import type { FormEvent } from "react"

import { API_BASE_URL, emailStorage, signIn, signUp, tokenStorage } from "../api"

export function SignIn({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState(emailStorage.get)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === "signin" ? await signIn(email, password) : await signUp(email, password)
      tokenStorage.set(result.token)
      emailStorage.set(result.email)
      onAuthed(result.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold mb-1">Noop Inspector</h1>
        <p className="text-text-1 mb-2">
          {mode === "signin" ? "Sign in to your backend account" : "Create a new account"}
        </p>
        <p className="text-text-2 text-xs mb-8">
          {API_BASE_URL.replace(/^https?:\/\//, "")}
        </p>
        <form className="space-y-4" onSubmit={submit}>
          <input
            className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            autoComplete="email"
          />
          <input
            className="w-full bg-surface-1 border border-border rounded-lg px-4 py-3 outline-none focus:border-border-strong placeholder:text-text-2 text-[15px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          <button
            type="submit"
            className="w-full bg-text-0 text-surface font-semibold rounded-lg py-3 cursor-pointer disabled:opacity-40"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-text-2 text-sm hover:text-text-1 transition-colors cursor-pointer"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin")
            setError(null)
          }}
        >
          {mode === "signin"
            ? "No account yet? Create one."
            : "Already have an account? Sign in."}
        </button>
        {error && (
          <p className="mt-4 text-red text-sm" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
