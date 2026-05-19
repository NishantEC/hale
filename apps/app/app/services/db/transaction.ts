import type { NoopDatabase } from "./index"

export type WriteTx = Parameters<Parameters<NoopDatabase["transaction"]>[0]>[0]

export function withWrite<T>(
  db: NoopDatabase,
  fn: (tx: WriteTx) => Promise<T>,
): Promise<T> {
  return db.transaction(fn)
}
