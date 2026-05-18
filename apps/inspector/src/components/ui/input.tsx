import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--accent-cyan)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/40",
        "aria-invalid:border-[var(--accent-magenta)] aria-invalid:ring-[var(--accent-magenta)]/40",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
