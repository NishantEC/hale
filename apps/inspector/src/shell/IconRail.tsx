import { Database, LogOut } from "lucide-react"
import type { ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { RAIL_WIDTH } from "./tokens"

export type RailTab = {
  id: string
  label: string
  icon: ReactNode
  shortcut: string
  badge?: number
  dot?: "warn" | "ok" | "error"
}

const DOT_BG: Record<NonNullable<RailTab["dot"]>, string> = {
  warn: "bg-warning",
  ok: "bg-success",
  error: "bg-destructive",
}

export function IconRail({
  tabs,
  active,
  onSelect,
  onSeed,
  onLogout,
}: {
  tabs: RailTab[]
  active: string
  onSelect: (id: string) => void
  onSeed: () => void
  onLogout: () => void
}) {
  return (
    <nav
      className="flex flex-col items-center bg-background shrink-0 py-3"
      style={{ width: RAIL_WIDTH }}
    >
      <div className="flex-1 flex flex-col gap-1 w-full px-2">
        {tabs.map((t) => {
          const isActive = active === t.id
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-label={`${t.label} (${t.shortcut})`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center justify-center h-10 rounded-lg cursor-pointer transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm bg-primary" />
                  )}
                  {t.icon}
                  {t.badge != null && t.badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 text-[10px] bg-primary text-primary-foreground rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center font-semibold leading-none">
                      {t.badge > 99 ? "99+" : t.badge}
                    </span>
                  )}
                  {t.dot && (
                    <span
                      className={cn(
                        "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
                        DOT_BG[t.dot],
                      )}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span className="font-medium">{t.label}</span>{" "}
                <span className="text-muted-foreground text-xs ml-1">{t.shortcut}</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="flex flex-col gap-1 w-full px-2 pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSeed}
              aria-label="Seed demo data"
              className="flex items-center justify-center h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer transition-colors"
            >
              <Database className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Seed demo data</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="flex items-center justify-center h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer transition-colors"
            >
              <LogOut className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
