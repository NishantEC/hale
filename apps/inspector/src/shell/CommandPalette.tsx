import { Fragment } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

export type Command = {
  id: string
  label: string
  hint?: string
  shortcut?: string
  group: "Navigate" | "Actions" | "Data" | "Date"
  run: () => void
}

const GROUP_ORDER: Command["group"][] = ["Navigate", "Actions", "Data", "Date"]

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Command palette"
      description="Run an action or jump to a tab"
    >
      <CommandInput placeholder="Search or run a command..." />
      <CommandList>
        <CommandEmpty>No commands match.</CommandEmpty>
        {GROUP_ORDER.map((groupName, i) => {
          const items = commands.filter((c) => c.group === groupName)
          if (items.length === 0) return null
          return (
            <Fragment key={groupName}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={groupName}>
                {items.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.group} ${cmd.label} ${cmd.hint ?? ""}`}
                    onSelect={() => {
                      onClose()
                      cmd.run()
                    }}
                  >
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.hint && (
                      <span className="text-muted-foreground text-xs">{cmd.hint}</span>
                    )}
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Fragment>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
