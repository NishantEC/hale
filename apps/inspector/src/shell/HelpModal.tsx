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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
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
    <div className="mb-2 last:mb-0">
      <p className="text-muted-foreground text-[10px] uppercase tracking-widest font-semibold mb-2">
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((s) => (
          <div key={s.keys} className="flex items-center justify-between text-sm">
            <span className="text-foreground">{s.action}</span>
            <kbd className="text-xs font-mono px-2 py-0.5 rounded-md bg-muted border text-foreground">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
