import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

export type Command = {
  id: string
  label: string
  hint?: string
  shortcut?: string
  group: "Navigate" | "Actions" | "Data" | "Date"
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      setQuery("")
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (triggerRef.current) {
      triggerRef.current.focus()
    }
  }, [open])

  const matches = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase().trim()
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    if (selected >= matches.length) setSelected(0)
  }, [matches.length, selected])

  if (!open) return null

  const grouped: { name: Command["group"]; items: { cmd: Command; absoluteIndex: number }[] }[] = []
  let abs = 0
  for (const cmd of matches) {
    let last = grouped[grouped.length - 1]
    if (!last || last.name !== cmd.group) {
      last = { name: cmd.group, items: [] }
      grouped.push(last)
    }
    last.items.push({ cmd, absoluteIndex: abs })
    abs++
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(matches.length - 1, s + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(0, s - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = matches[selected]
      if (cmd) {
        onClose()
        cmd.run()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl bg-surface-2 border border-border-strong rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or run a command..."
          className="w-full bg-transparent border-b border-border px-4 py-3 outline-none placeholder:text-text-2 text-[15px]"
          aria-label="Command palette query"
        />
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {matches.length === 0 ? (
            <p className="text-text-2 text-sm px-4 py-6 text-center">No commands match "{query}".</p>
          ) : (
            grouped.map((g) => (
              <div key={g.name} className="mb-2 last:mb-0">
                <p className="text-text-2 text-[10px] uppercase tracking-widest font-semibold px-4 py-1">{g.name}</p>
                {g.items.map(({ cmd, absoluteIndex }) => {
                  const isSelected = absoluteIndex === selected
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setSelected(absoluteIndex)}
                      onClick={() => {
                        onClose()
                        cmd.run()
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer ${
                        isSelected ? "bg-surface-3 text-text-0" : "text-text-1 hover:bg-surface-3 hover:text-text-0"
                      }`}
                    >
                      <span className="text-sm flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && <Hint>{cmd.hint}</Hint>}
                      {cmd.shortcut && <Kbd>{cmd.shortcut}</Kbd>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="text-text-2 text-xs">{children}</span>
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-surface border border-border text-text-1">
      {children}
    </kbd>
  )
}
