import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import { API_BASE_URL, emailStorage, signIn, signUp, tokenStorage } from "../api"
import { Logo } from "../components/Logo"

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type FormValues = z.infer<typeof schema>

export function SignIn({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: emailStorage.get() ?? "", password: "" },
  })

  const onSubmit = async (data: FormValues) => {
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === "signin"
          ? await signIn(data.email, data.password)
          : await signUp(data.email, data.password)
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card accent="cyan" className="w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Logo variant="badge" className="size-9 rounded-md" />
          <div>
            <p className="text-base font-semibold leading-tight">Noop Inspector</p>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5 tabular-nums">
              {API_BASE_URL.replace(/^https?:\/\//, "")}
            </p>
          </div>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="eyebrow">Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="eyebrow">Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Form>

        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-4 px-0 text-muted-foreground hover:text-foreground"
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
      </Card>
    </div>
  )
}
