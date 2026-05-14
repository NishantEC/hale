import { useEffect, useState } from "react"

import { openDatabase } from "@/services/db"
import { listDeadLetters, queueDepth } from "@/services/db/repositories/outboundQueue"

export type OutboundQueueStats = { depth: number; deadCount: number }

export function useOutboundQueueStats(): OutboundQueueStats {
  const [stats, setStats] = useState<OutboundQueueStats>({ depth: 0, deadCount: 0 })

  useEffect(() => {
    let mounted = true

    const tick = async () => {
      try {
        const db = openDatabase()
        const [depth, deadLetters] = await Promise.all([queueDepth(db), listDeadLetters(db)])
        if (mounted) setStats({ depth, deadCount: deadLetters.length })
      } catch (err) {
        console.warn("[useOutboundQueueStats] fetch failed", err)
      }
    }

    void tick()
    const id = setInterval(tick, 4000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return stats
}
