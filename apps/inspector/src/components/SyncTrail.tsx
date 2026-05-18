import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
  neutral: "bg-white/30",
}

export type TrailNode = {
  name: string
  detail: ReactNode
  timestamp: string | null
  tone: Tone
}

export function SyncTrail({ nodes }: { nodes: TrailNode[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {nodes.map((node, i) => (
        <Card key={node.name}>
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", DOT[node.tone])} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
              {String(i + 1).padStart(2, "0")} · {node.name}
            </span>
          </div>
          <p className="text-sm text-foreground mt-1 truncate font-medium">{node.detail}</p>
          <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {node.timestamp ? relativeTime(node.timestamp) : "—"}
          </p>
        </Card>
      ))}
    </div>
  )
}
