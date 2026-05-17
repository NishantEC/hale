import type { ReactNode } from "react"

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
  warn: "bg-yellow",
  ok: "bg-green",
  error: "bg-red",
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
      className="flex flex-col items-center border-r border-border bg-surface shrink-0 py-3"
      style={{ width: RAIL_WIDTH }}
    >
      <div className="flex-1 flex flex-col gap-1 w-full px-2">
        {tabs.map((t) => {
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-label={`${t.label} (${t.shortcut})`}
              title={`${t.label} (${t.shortcut})`}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center justify-center h-10 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-surface-2 text-text-0"
                  : "text-text-1 hover:bg-surface-1 hover:text-text-0"
              }`}
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
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${DOT_BG[t.dot]}`}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1 w-full px-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onSeed}
          aria-label="Seed demo data"
          title="Seed demo data"
          className="flex items-center justify-center h-10 rounded-lg text-text-2 hover:text-text-0 hover:bg-surface-1 cursor-pointer transition-colors"
        >
          <svg
            className="w-[18px] h-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
          className="flex items-center justify-center h-10 rounded-lg text-text-2 hover:text-text-0 hover:bg-surface-1 cursor-pointer transition-colors"
        >
          <svg
            className="w-[18px] h-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
            />
          </svg>
        </button>
      </div>
    </nav>
  )
}
