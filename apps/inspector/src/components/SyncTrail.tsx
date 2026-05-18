import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { relativeTime } from "@/format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--sage)]",
  warn: "bg-[var(--warning)]",
  error: "bg-[var(--vermillion)]",
  neutral: "bg-foreground/30",
}

const LABEL_COLOR: Record<Tone, string> = {
  ok: "text-foreground",
  warn: "text-foreground",
  error: "text-[var(--vermillion)]",
  neutral: "text-foreground",
}

export type TrailNode = {
  name: string
  detail: ReactNode
  timestamp: string | null
  tone: Tone
}

/**
 * Sync trail — Field Manual style. A horizontal printed timeline.
 * No fill, no rounded corners; just nodes connected by hairlines with
 * vermillion progress dashes filling between solid nodes.
 */
export function SyncTrail({ nodes }: { nodes: TrailNode[] }) {
  return (
    <div className="relative">
      {/* The rail itself — single hairline across the middle of the row */}
      <div className="absolute left-2 right-2 top-2 h-px bg-foreground/15" aria-hidden />

      <div className="grid grid-cols-4 gap-2 relative">
        {nodes.map((node, i) => (
          <div key={node.name} className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  "size-1.5 rounded-full ring-4 ring-paper relative z-10",
                  DOT[node.tone],
                )}
              />
              <span className="eyebrow text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <p
              className={cn(
                "font-display text-base leading-tight tracking-tight",
                LABEL_COLOR[node.tone],
              )}
            >
              {node.name}
            </p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {node.detail}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground tabular-nums mt-1">
              {node.timestamp ? relativeTime(node.timestamp) : "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
