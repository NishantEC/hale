import { useRef, type ReactNode } from "react"

import { AnimatedBeam } from "@/components/magicui/animated-beam"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-muted-foreground",
}
const LABEL_COLOR: Record<Tone, string> = {
  ok: "text-foreground",
  warn: "text-warning",
  error: "text-destructive",
  neutral: "text-foreground",
}

export type TrailNode = {
  name: string
  detail: ReactNode
  timestamp: string | null
  tone: Tone
}

export function SyncTrail({ nodes }: { nodes: TrailNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  return (
    <Card className="p-4 relative">
      <div ref={containerRef} className="flex items-stretch gap-2 relative">
        {nodes.map((node, i) => (
          <div
            key={node.name}
            ref={(el) => {
              refs.current[i] = el
            }}
            className="flex flex-col items-start min-w-0 flex-1 z-10"
          >
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", DOT[node.tone])} />
              <span className={cn("text-[12px] font-semibold", LABEL_COLOR[node.tone])}>
                {node.name}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] mt-0.5 truncate w-full">
              {node.detail}
            </p>
            <p className="text-muted-foreground text-[10px] tabular-nums">
              {node.timestamp ? relativeTime(node.timestamp) : "—"}
            </p>
          </div>
        ))}

        {nodes.slice(0, -1).map((_, i) => (
          <AnimatedBeam
            key={`beam-${i}`}
            containerRef={containerRef}
            fromRef={{ current: refs.current[i] }}
            toRef={{ current: refs.current[i + 1] }}
            curvature={0}
            duration={3}
            gradientStartColor="var(--primary)"
            gradientStopColor="var(--primary)"
            pathColor="var(--border)"
            pathOpacity={0.4}
          />
        ))}
      </div>
    </Card>
  )
}
