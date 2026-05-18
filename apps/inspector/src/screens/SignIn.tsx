import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
    defaultValues: {
      email: emailStorage.get() ?? "",
      password: "",
    },
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
    <div className="min-h-screen grid grid-rows-[auto_1fr_auto] px-8 py-10">
      {/* Top masthead */}
      <header className="flex items-baseline justify-between rule-strong pt-3">
        <div className="flex items-center gap-3">
          <Logo variant="glyph" className="size-5 text-foreground -mb-0.5" />
          <p className="font-display text-h2 tracking-tight">Inspector</p>
        </div>
        <p className="eyebrow text-muted-foreground">
          {API_BASE_URL.replace(/^https?:\/\//, "")}
        </p>
      </header>

      {/* Cover */}
      <main className="grid grid-cols-12 items-center gap-12 max-w-[1200px] mx-auto w-full">
        {/* Editorial cover copy */}
        <section className="col-span-7 pr-6">
          <p className="eyebrow text-[var(--vermillion)] mb-6">
            vol. iv · field manual
          </p>
          <h1 className="font-display-tight text-[5rem] leading-[0.92] tracking-tight text-foreground">
            A printed log
            <br />
            for what your
            <br />
            <span className="italic">strap</span> wrote down.
          </h1>
          <p className="font-display text-[1.25rem] italic text-muted-foreground mt-8 max-w-[460px] leading-snug">
            Vital readings, sleep architecture, and pipeline state — set in
            type, not chrome.
          </p>
        </section>

        {/* Auth form */}
        <section className="col-span-5">
          <div className="rule-strong pt-3">
            <p className="eyebrow text-muted-foreground mb-1">
              {mode === "signin" ? "credentials" : "new account"}
            </p>
            <h2 className="font-display text-[1.75rem] leading-tight tracking-tight">
              {mode === "signin" ? "Sign in" : "Create an account"}
            </h2>
          </div>
          <Form {...form}>
            <form className="space-y-6 mt-8" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="eyebrow text-muted-foreground">
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="font-mono text-base"
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
                    <FormLabel className="eyebrow text-muted-foreground">
                      Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete={
                          mode === "signin" ? "current-password" : "new-password"
                        }
                        className="font-mono text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 mt-2"
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? "Working…" : mode === "signin" ? "Sign in →" : "Create account →"}
              </Button>
            </form>
          </Form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin")
              setError(null)
            }}
            className="eyebrow text-muted-foreground hover:text-foreground mt-6"
          >
            {mode === "signin"
              ? "no account yet — create one →"
              : "← already have an account, sign in"}
          </button>

          {error && (
            <Alert variant="destructive" className="mt-6 rounded-none">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </section>
      </main>

      {/* Footer marginalia */}
      <footer className="flex items-baseline justify-between rule-hair pt-4 eyebrow text-muted-foreground">
        <span>noop · {new Date().getFullYear()}</span>
        <span>printed on paper, not pixels</span>
      </footer>
    </div>
  )
}
