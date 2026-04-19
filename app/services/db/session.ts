// Session-scoped active user id. Set on login, cleared on logout.
// Every repository write stamps userId on the row; wipeDatabase uses
// this on logout to prevent cross-user data leakage.

let activeUserId: string | null = null

export function setActiveUserId(userId: string | null): void {
  activeUserId = userId
}

export function getActiveUserId(): string {
  if (!activeUserId) throw new Error("No active user — call setActiveUserId before DB writes")
  return activeUserId
}

export function peekActiveUserId(): string | null {
  return activeUserId
}
