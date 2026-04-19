// Per-table observable: repositories call notifyTable() after writes; screens
// subscribe via createObservable() (typically wrapped by useDbQuery).

type Subscriber = () => void

const subscribers = new Map<string, Set<Subscriber>>()

export function createObservable(tableName: string, subscriber: Subscriber): () => void {
  if (!subscribers.has(tableName)) subscribers.set(tableName, new Set())
  subscribers.get(tableName)!.add(subscriber)
  return () => subscribers.get(tableName)?.delete(subscriber)
}

export function notifyTable(tableName: string): void {
  const set = subscribers.get(tableName)
  if (!set) return
  for (const sub of set) sub()
}
