import { useEffect, useRef, useState } from "react"
import { createObservable } from "./observable"

export function useDbQuery<T>(
  tableDeps: string[],
  queryFn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): { data: T | null; isLoading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const tick = useRef(0)

  const refetch = () => {
    const myTick = ++tick.current
    setLoading(true)
    queryFn()
      .then((value) => {
        if (myTick !== tick.current) return
        setData(value)
        setError(null)
      })
      .catch((err) => {
        if (myTick !== tick.current) return
        setError(err)
      })
      .finally(() => {
        if (myTick !== tick.current) return
        setLoading(false)
      })
  }

  useEffect(() => {
    refetch()
    const unsubs = tableDeps.map((name) => createObservable(name, refetch))
    return () => {
      for (const u of unsubs) u()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, isLoading, error, refetch }
}
