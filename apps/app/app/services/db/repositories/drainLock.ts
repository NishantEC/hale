import { eq, sql } from "drizzle-orm"
import type { NoopDatabase } from "../index"
import { drainLock } from "../schema"

export const DRAIN_LOCK_NAME = "uplink"
export const DEFAULT_DRAIN_LOCK_TTL_MS = 60_000

export interface DrainLockHandle {
  holder: string
  expiresAt: number
}

// Acquire a drain lock that survives across JS contexts (foreground +
// Expo background task). Returns null when another holder owns a
// non-expired lock; otherwise atomically writes the new lease and
// returns its expiry. Callers MUST release via releaseDrainLock — or
// the lock will simply expire after `ttlMs`.
export async function acquireDrainLock(
  db: NoopDatabase,
  holder: string,
  opts: { ttlMs?: number; now?: () => number } = {},
): Promise<DrainLockHandle | null> {
  const ttl = opts.ttlMs ?? DEFAULT_DRAIN_LOCK_TTL_MS
  const now = opts.now ?? Date.now
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(drainLock)
      .where(eq(drainLock.name, DRAIN_LOCK_NAME))

    const t = now()
    if (current && current.expiresAt > t) {
      // Still held by another holder. (We don't recursively re-acquire
      // for the same holder: callers should not re-enter.)
      return null
    }

    const expiresAt = t + ttl
    if (current) {
      await tx
        .update(drainLock)
        .set({ acquiredAt: t, expiresAt, holder })
        .where(eq(drainLock.name, DRAIN_LOCK_NAME))
    } else {
      await tx.insert(drainLock).values({
        name: DRAIN_LOCK_NAME,
        acquiredAt: t,
        expiresAt,
        holder,
      })
    }
    return { holder, expiresAt }
  })
  return result
}

export async function releaseDrainLock(
  db: NoopDatabase,
  holder: string,
): Promise<void> {
  // Only release if we still hold it — guards against releasing a lock
  // we stole back after expiry.
  await db
    .update(drainLock)
    .set({ expiresAt: 0 })
    .where(sql`${drainLock.name} = ${DRAIN_LOCK_NAME} AND ${drainLock.holder} = ${holder}`)
}

export async function peekDrainLock(
  db: NoopDatabase,
): Promise<DrainLockHandle | null> {
  const [row] = await db
    .select()
    .from(drainLock)
    .where(eq(drainLock.name, DRAIN_LOCK_NAME))
  if (!row) return null
  if (row.expiresAt <= Date.now()) return null
  return { holder: row.holder, expiresAt: row.expiresAt }
}
