// Sentry init for the React Native app. No-ops when EXPO_PUBLIC_SENTRY_DSN
// is unset so dev builds stay quiet. The dynamic require keeps the @sentry
// dependency optional — if it isn't installed yet, init silently skips so
// the app boots without it.

type SentryModule = {
  init: (opts: Record<string, unknown>) => void
  captureException: (err: unknown) => void
}

let sentry: SentryModule | null = null

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return
  try {
    // require() so the import doesn't fail builds before the user has
    // added @sentry/react-native to dependencies. Once installed, this
    // resolves to the real module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sentry = require("@sentry/react-native") as SentryModule
    sentry.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
      release: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
      tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      enableNative: true,
      enableAutoSessionTracking: true,
    })
  } catch (err) {
    // @sentry/react-native not installed yet — that's fine.
    console.warn("[sentry] init skipped:", (err as Error)?.message)
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return
  try {
    // captureException supports a second `captureContext` arg in @sentry/react-native
    ;(sentry.captureException as any)(err, context ? { extra: context } : undefined)
  } catch {
    // swallow — Sentry should never break the caller
  }
}
