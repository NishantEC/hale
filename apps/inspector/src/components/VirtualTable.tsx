import { useRef, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

type VirtualTableProps<T> = {
  rows: T[]
  rowHeight: number
  renderRow: (row: T, index: number) => ReactElement
  renderHeader?: () => ReactNode
  className?: string
  maxHeight?: number
}

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
      className={`overflow-auto rounded-xl border border-border ${className ?? ""}`}
      style={{ maxHeight }}
    >
      <table className="w-full text-sm border-collapse">
        {renderHeader && (
          <thead className="sticky top-0 bg-surface-1 z-10">
            {renderHeader()}
          </thead>
        )}
        <tbody style={{ height: totalHeight, display: "block", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index]
            const rendered = renderRow(row, virtualItem.index)
            const positionStyle: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
              display: "table",
              tableLayout: "fixed",
            }
            if (isValidElement(rendered)) {
              return cloneElement(rendered as ReactElement<React.HTMLAttributes<HTMLTableRowElement>>, {
                key: virtualItem.key,
                "data-index": virtualItem.index,
                ref: virtualizer.measureElement,
                style: {
                  ...(rendered.props as React.HTMLAttributes<HTMLTableRowElement>).style,
                  ...positionStyle,
                },
                tabIndex: 0,
              } as React.HTMLAttributes<HTMLTableRowElement> & { "data-index": number; ref: unknown })
            }
            return null
          })}
        </tbody>
      </table>
    </div>
  )
}
