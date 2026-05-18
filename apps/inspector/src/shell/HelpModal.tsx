import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-card backdrop-blur-lg border border-white/10 rounded-[14px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Reference for keyboard shortcuts available in the inspector
          </DialogDescription>
        </DialogHeader>
        <Section title="Navigation" items={NAV} />
        <Section title="Actions" items={ACTIONS} />
        <Section title="Date" items={DATE} />
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <section>
      <p className="eyebrow text-[var(--accent-cyan)] mb-2">{title}</p>
      <div className="space-y-1">
        {items.map((s) => (
          <div
            key={s.keys}
            className="flex items-center justify-between rule-hair-b py-1.5 last:border-b-0"
          >
            <span className="text-sm">{s.action}</span>
            <kbd className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-foreground tabular-nums">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </section>
  )
}
