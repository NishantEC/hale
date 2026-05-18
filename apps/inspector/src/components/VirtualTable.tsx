import { useRef, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { cn } from "@/lib/utils"

type VirtualTableProps<T> = {
  rows: T[]
  rowHeight: number
  renderRow: (row: T, index: number) => ReactElement
  renderHeader?: () => ReactNode
  className?: string
  maxHeight?: number
}

// Virtualised list with table-like semantics. Uses ARIA roles instead of
// real <table>/<tr>/<td> so we can absolutely-position rows for the
// virtualizer without losing column-width alignment between the header
// and the rows. Each row is a flex container; cells set width via style
// on the role="cell" element.
export function VirtualTable<T>({
  rows,
  rowHeight,
  renderRow,
  renderHeader,
  className,
  maxHeight = 600,
}: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  const totalHeight = virtualizer.getTotalSize()

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-auto rounded-xl border", className)}
      style={{ maxHeight }}
      role="table"
    >
      {renderHeader && (
        <div role="rowgroup" className="sticky top-0 bg-card z-10">
          {renderHeader()}
        </div>
      )}
      <div role="rowgroup" style={{ height: totalHeight, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index]
          const rendered = renderRow(row, virtualItem.index)
          if (!isValidElement(rendered)) return null
          const previousStyle =
            (rendered.props as { style?: React.CSSProperties }).style ?? {}
          const positionStyle: React.CSSProperties = {
            ...previousStyle,
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualItem.start}px)`,
          }
          return cloneElement(
            rendered as ReactElement<React.HTMLAttributes<HTMLElement>>,
            {
              key: virtualItem.key,
              "data-index": virtualItem.index,
              ref: virtualizer.measureElement,
              style: positionStyle,
              tabIndex: 0,
            } as React.HTMLAttributes<HTMLElement> & {
              "data-index": number
              ref: unknown
            },
          )
        })}
      </div>
    </div>
  )
}
