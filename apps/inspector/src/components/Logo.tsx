import { cn } from "@/lib/utils"

const NOOP_PATH =
  "M433.7969 416.7578L369.5391 720L309.1094 720L393.0547 325.4297L449.3828 325.4297L588.8359 628.6719L590.2031 628.6719L654.4609 325.4297L714.8906 325.4297L630.9453 720L574.3438 720L435.1641 416.7578"

// The Noop "N" — outlined SF NS Italic path, identical to the mobile
// app icon. Two render modes:
//   "glyph": bare letterform on transparent, sized via className.
//            Inherits color from currentColor (use text-foreground).
//   "badge": rounded-square chip with bg + foreground swap, matches
//            the app icon at small scale.
export function Logo({
  variant = "glyph",
  className,
  title = "Noop",
}: {
  variant?: "glyph" | "badge"
  className?: string
  title?: string
}) {
  if (variant === "badge") {
    return (
      <span
        role="img"
        aria-label={title}
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-foreground text-background overflow-hidden",
          className,
        )}
      >
        <svg
          viewBox="0 0 1024 1024"
          className="size-full"
          aria-hidden
        >
          <path d={NOOP_PATH} fill="currentColor" />
        </svg>
      </span>
    )
  }

  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label={title}
      className={cn("text-foreground", className)}
    >
      <title>{title}</title>
      <path d={NOOP_PATH} fill="currentColor" />
    </svg>
  )
}
