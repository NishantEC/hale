type Subscriber = () => void

const subscribers = new Map<string, Set<Subscriber>>()

export function createObservable(tableName: string, subscriber: Subscriber): () => void {
  if (!subscribers.has(tableName)) subscribers.set(tableName, new Set())
  subscribers.get(tableName)!.add(subscriber)
  return () => subscribers.get(tableName)?.delete(subscriber)
}

export function notifyTable(tableName: string): void {
  const set = subscribers.get(tableName)
  if (!set || set.size === 0) return
  // Snapshot to avoid issues if a subscriber unsubscribes during dispatch.
  const snapshot = Array.from(set)
  queueMicrotask(() => {
    for (const sub of snapshot) {
      try {
        sub()
      } catch (err) {
        console.warn("[observable] subscriber threw", err)
      }
    }
  })
}
