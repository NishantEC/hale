import { useState } from "react"
import type { FormEvent } from "react"
import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { API_BASE_URL, emailStorage, signIn, signUp, tokenStorage } from "../api"
import { Logo } from "../components/Logo"

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
    <div className="h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Logo variant="badge" className="size-10" />
            <div>
              <CardTitle className="text-xl leading-tight">Noop Inspector</CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5 tabular-nums">
                {API_BASE_URL.replace(/^https?:\/\//, "")}
              </p>
            </div>
          </div>
          <CardDescription>
            {mode === "signin"
              ? "Sign in to your backend account"
              : "Create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-3 px-0 text-muted-foreground"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin")
              setError(null)
            }}
          >
            {mode === "signin"
              ? "No account yet? Create one."
              : "Already have an account? Sign in."}
          </Button>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
