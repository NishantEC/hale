import * as React from "react"

import { cn } from "@/lib/utils"

type AccentKey = "cyan" | "magenta" | "lime" | "amber"

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
        "relative flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        accent &&
          "after:content-[''] after:absolute after:left-6 after:right-6 after:bottom-2 after:h-[1.5px] after:rounded-[1px] after:bg-[var(--card-accent)] after:opacity-60 pb-8",
        className
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
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
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
