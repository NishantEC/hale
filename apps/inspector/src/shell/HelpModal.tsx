import { useEffect, useRef } from "react"

type Shortcut = { keys: string; action: string }

const NAV: Shortcut[] = [
  { keys: "1 – 7", action: "Jump to tab" },
  { keys: "⌘ K", action: "Open command palette" },
  { keys: "?", action: "Show this help" },
  { keys: "Esc", action: "Close any modal or menu" },
]

const ACTIONS: Shortcut[] = [
  { keys: "R", action: "Refresh data" },
  { keys: "P", action: "Open run-pipeline menu" },
  { keys: "L", action: "Toggle live tail" },
  { keys: "/", action: "Focus current tab's search" },
]

const DATE: Shortcut[] = [
  { keys: "[", action: "Previous day" },
  { keys: "]", action: "Next day" },
  { keys: "T", action: "Jump to today" },
  { keys: "D", action: "Focus date picker" },
]

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      requestAnimationFrame(() => closeRef.current?.focus())
    } else if (triggerRef.current) {
      triggerRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div
        className="w-full max-w-md bg-surface-2 border border-border-strong rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="text-text-2 hover:text-text-0 cursor-pointer text-xl leading-none"
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <Section title="Navigation" items={NAV} />
        <Section title="Actions" items={ACTIONS} />
        <Section title="Date" items={DATE} />
      </div>
    </div>
  )
}

function Section({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-text-2 text-[10px] uppercase tracking-widest font-semibold mb-2">
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((s) => (
          <div key={s.keys} className="flex items-center justify-between text-sm">
            <span className="text-text-1">{s.action}</span>
            <kbd className="text-xs font-mono px-2 py-0.5 rounded-md bg-surface border border-border text-text-0">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
