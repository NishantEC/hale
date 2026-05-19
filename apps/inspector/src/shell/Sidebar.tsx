import { Database, LogOut } from "lucide-react"
import type { ReactNode } from "react"

import { Logo } from "../components/Logo"
import { cn } from "@/lib/utils"

export type SidebarTab = {
  id: string
  label: string
  shortcut: string
  icon: ReactNode
  badge?: number
  dot?: "ok" | "warn" | "error"
}

const DOT_CLASS: Record<NonNullable<SidebarTab["dot"]>, string> = {
  ok: "bg-[var(--accent-lime)]",
  warn: "bg-[var(--accent-amber)]",
  error: "bg-[var(--accent-magenta)]",
}

export function Sidebar({
  tabs,
  active,
  onSelect,
  apiHost,
  onSeed,
  onLogout,
}: {
  tabs: SidebarTab[]
  active: string
  onSelect: (id: string) => void
  apiHost: string
  onSeed: () => void
  onLogout: () => void
}) {
  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-card/40 backdrop-blur-lg border-r border-white/[0.06] h-screen sticky top-0">
      {/* identity */}
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Logo variant="glyph" className="size-5 text-foreground" />
          <span className="text-sm font-semibold tracking-tight">Inspector</span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-1 tabular-nums truncate">
          {apiHost}
        </p>
      </div>

      {/* tab list */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto" aria-label="Inspector sections">
        <ul className="space-y-0.5">
          {tabs.map((t) => {
            const isActive = active === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors relative",
                    isActive
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]",
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm bg-[var(--accent-cyan)]"
                    />
                  )}
                  <span
                    className={cn(
                      "shrink-0 inline-flex",
                      isActive ? "text-[var(--accent-cyan)]" : "text-muted-foreground",
                    )}
                  >
                    {t.icon}
                  </span>
                  <span className="flex-1 text-left">{t.label}</span>
                  {t.dot && (
                    <span className={cn("size-1.5 rounded-full", DOT_CLASS[t.dot])} />
                  )}
                  {t.badge != null && t.badge > 0 && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded">
                      {t.badge > 999 ? "999+" : t.badge}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
                    {t.shortcut}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* footer actions */}
      <div className="px-2 py-3 border-t border-white/[0.06] space-y-0.5">
        <button
          type="button"
          onClick={onSeed}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
        >
          <Database className="size-4" />
          <span>Seed demo data</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
        >
          <LogOut className="size-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
