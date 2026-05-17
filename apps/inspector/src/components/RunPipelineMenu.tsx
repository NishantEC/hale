import { useCallback, useEffect, useRef, useState } from "react"

import type { PipelineRunOptions } from "../api"

// Action button + popover with the four useful run shapes. Used in the
// TopBar (default presets), on the Sleep tab (preset to "this night"),
// and on the Trends tab (preset to "this range").

type Preset =
  | { kind: "full"; label: string }
  | { kind: "lastDays"; days: number; label: string }
  | { kind: "day"; day: string; label: string }
  | { kind: "range"; from: string; to: string; label: string }

export function RunPipelineMenu({
  busy,
  presets,
  onRun,
  variant = "primary",
  label = "Pipeline",
}: {
  busy: boolean
  presets: Preset[]
  onRun: (opts: PipelineRunOptions) => void | Promise<void>
  variant?: "primary" | "secondary"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [force, setForce] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    firstItemRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
      if (e.key === "Tab") {
        const items = menuRef.current?.querySelectorAll<HTMLElement>(
          "button, input, [tabindex='0']",
        )
        if (!items?.length) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

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

  const variantClass =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent/85"
      : "bg-surface-2 border border-border text-text-0 hover:bg-surface-3"

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-busy={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors disabled:opacity-40 ${variantClass}`}
      >
        {busy ? "..." : label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} aria-hidden />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Pipeline run options"
            className="absolute right-0 top-full mt-1 z-40 w-64 bg-surface-2 border border-border-strong rounded-xl shadow-2xl p-2"
          >
            {presets.map((preset, i) => (
              <button
                key={i}
                ref={i === 0 ? firstItemRef : undefined}
                role="menuitem"
                type="button"
                onClick={async () => {
                  close()
                  await onRun(optsForPreset(preset))
                }}
                className="w-full text-left px-3 py-2 text-sm text-text-1 hover:bg-surface-3 hover:text-text-0 rounded-md cursor-pointer transition-colors"
              >
                {preset.label}
              </button>
            ))}
            <div className="mt-1 pt-2 border-t border-border">
              <label className="flex items-center gap-2 px-3 py-2 text-xs text-text-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="accent-accent"
                />
                Force recompute (bypass watermark)
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
