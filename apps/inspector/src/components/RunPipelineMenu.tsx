import { useState } from "react"

import type { PipelineRunOptions } from "@/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Preset =
  | { kind: "full"; label: string }
  | { kind: "lastDays"; days: number; label: string }
  | { kind: "day"; day: string; label: string }
  | { kind: "range"; from: string; to: string; label: string }

export function RunPipelineMenu({
  busy,
  presets,
  onRun,
  variant = "default",
  label = "Pipeline",
}: {
  busy: boolean
  presets: Preset[]
  onRun: (opts: PipelineRunOptions) => void | Promise<void>
  variant?: "default" | "secondary"
  label?: string
}) {
  const [force, setForce] = useState(false)

  const optsForPreset = (p: Preset): PipelineRunOptions => {
    const base: PipelineRunOptions = force ? { force: true } : {}
    if (p.kind === "full") return base
    if (p.kind === "lastDays") {
      const to = new Date()
      const from = new Date(to.getTime() - p.days * 24 * 60 * 60 * 1000)
      return { ...base, from: from.toISOString(), to: to.toISOString() }
    }
    if (p.kind === "day") return { ...base, day: p.day }
    return { ...base, from: p.from, to: p.to }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          disabled={busy}
          aria-busy={busy}
          className="cursor-pointer"
        >
          {busy ? "..." : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Run pipeline</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {presets.map((preset, i) => (
          <DropdownMenuItem
            key={i}
            onSelect={async () => {
              await onRun(optsForPreset(preset))
            }}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={force}
          onCheckedChange={(c) => setForce(c === true)}
          onSelect={(e) => e.preventDefault()}
        >
          Force recompute (bypass watermark)
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
