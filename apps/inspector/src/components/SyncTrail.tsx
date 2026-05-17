import type { ReactNode } from "react"

import { relativeTime } from "../format"

type Tone = "ok" | "warn" | "error" | "neutral"

const DOT: Record<Tone, string> = {
  ok: "bg-green",
  warn: "bg-yellow",
  error: "bg-red",
  neutral: "bg-text-2",
}
const LABEL_COLOR: Record<Tone, string> = {
  ok: "text-text-0",
  warn: "text-yellow",
  error: "text-red",
  neutral: "text-text-1",
}

export type TrailNode = {
  name: string
  detail: ReactNode
  timestamp: string | null
  tone: Tone
}

export function SyncTrail({ nodes }: { nodes: TrailNode[] }) {
  return (
    <div className="bg-surface-1 rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2">
        {nodes.map((node, i) => (
          <div key={node.name} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex flex-col items-start min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${DOT[node.tone]}`} />
                <span className={`text-[12px] font-semibold ${LABEL_COLOR[node.tone]}`}>
                  {node.name}
                </span>
              </div>
              <p className="text-text-2 text-[11px] mt-0.5 truncate w-full">{node.detail}</p>
              <p className="text-text-2 text-[10px] tabular-nums">
                {node.timestamp ? relativeTime(node.timestamp) : "—"}
              </p>
            </div>
            {i < nodes.length - 1 && (
              <div className="h-px flex-1 bg-border shrink-0 min-w-[24px]" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
