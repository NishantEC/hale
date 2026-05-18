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
      <DialogContent className="max-w-md rounded-none bg-paper p-0 border-0 shadow-none">
        <div className="px-6 py-5 rule-strong">
          <DialogHeader>
            <p className="eyebrow text-muted-foreground mb-1">
              reference · keyboard
            </p>
            <DialogTitle className="font-display text-h1 leading-tight tracking-tight">
              Shortcuts
            </DialogTitle>
            <DialogDescription className="sr-only">
              Reference for keyboard shortcuts available in the inspector
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-6">
          <Section title="Navigation" items={NAV} />
          <Section title="Actions" items={ACTIONS} />
          <Section title="Date" items={DATE} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <section>
      <p className="eyebrow text-[var(--vermillion)] mb-3 rule-hair pt-3">
        {title}
      </p>
      <div className="space-y-0">
        {items.map((s) => (
          <div
            key={s.keys}
            className="flex items-center justify-between py-2 rule-hair-b last:border-b-0"
          >
            <span className="text-sm text-foreground">{s.action}</span>
            <kbd className="font-mono text-xs px-2 py-0.5 bg-foreground/[0.06] border border-foreground/15 text-foreground tabular-nums">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </section>
  )
}
