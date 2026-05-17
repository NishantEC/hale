export class AuthError extends Error {
  readonly kind = "auth" as const
}

export class ServerError extends Error {
  readonly kind = "server" as const
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class NetworkError extends Error {
  readonly kind = "network" as const
}

export class ParseError extends Error {
  readonly kind = "parse" as const
}

export type ApiError = AuthError | ServerError | NetworkError | ParseError

export function classifyError(e: unknown): ApiError {
  if (
    e instanceof AuthError ||
    e instanceof ServerError ||
    e instanceof NetworkError ||
    e instanceof ParseError
  ) {
    return e
  }
  if (e instanceof TypeError && /fetch|network|failed/i.test(e.message)) {
    return new NetworkError(e.message)
  }
  return new ServerError(e instanceof Error ? e.message : String(e), 0)
}

export function isAuthError(e: unknown): e is AuthError {
  return e instanceof AuthError
}
