import * as React from "react"
import { cn } from "@/lib/utils"
import type { AccentKey } from "@/components/primitives"

const ACCENT_VAR: Record<AccentKey, string> = {
  cyan: "var(--accent-cyan)",
  magenta: "var(--accent-magenta)",
  lime: "var(--accent-lime)",
  amber: "var(--accent-amber)",
}

function Card({
  className,
  accent,
  style,
  ...props
}: React.ComponentProps<"div"> & { accent?: AccentKey }) {
  const inlineStyle = accent
    ? ({ ["--card-accent" as never]: ACCENT_VAR[accent], ...style } as React.CSSProperties)
    : style
  return (
    <div
      data-slot="card"
      data-accent={accent}
      style={inlineStyle}
      className={cn(
        "relative flex flex-col gap-2 rounded-[14px] bg-card backdrop-blur-lg border border-white/[0.06] p-3.5 text-card-foreground",
        accent &&
          "after:content-[''] after:absolute after:left-3.5 after:right-3.5 after:bottom-1.5 after:h-[1.5px] after:rounded-[1px] after:bg-[var(--card-accent)] after:opacity-75 pb-5",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-baseline gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-sm font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center", className)} {...props} />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
