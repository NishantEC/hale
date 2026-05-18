import { useState, useMemo, useCallback } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import type { RawRecords } from "../api"
import { SectionHead } from "../components/primitives"
import { VirtualTable } from "../components/VirtualTable"
import { formatNumber } from "../format"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const ROW_HEIGHT = 40

type ColumnKey =
  | "timestamp"
  | "hr"
  | "rr"
  | "skin"
  | "gravity"
  | "resp"
  | "spo2r"
  | "spo2ir"
  | "temp"

const COLUMNS: ReadonlyArray<{ key: ColumnKey; label: string; width: string }> = [
  { key: "timestamp", label: "Time", width: "14%" },
  { key: "hr", label: "HR", width: "9%" },
  { key: "rr", label: "RR avg", width: "10%" },
  { key: "skin", label: "Skin contact", width: "11%" },
  { key: "gravity", label: "Gravity", width: "12%" },
  { key: "resp", label: "Resp", width: "10%" },
  { key: "spo2r", label: "SpO2 R", width: "9%" },
  { key: "spo2ir", label: "SpO2 IR", width: "9%" },
  { key: "temp", label: "Skin temp", width: "16%" },
]

type RawRow = RawRecords["rows"][number]

function formatRowTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

type ParsedRange = { startMinutes: number; endMinutes: number } | null

function parseTimeRange(input: string): ParsedRange {
  const trimmed = input.trim()
  if (!trimmed) return null

  const toMinutes = (h: number, m: number) => h * 60 + m

  const rangeMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/)
  if (rangeMatch) {
    const [, sh1, sm1, sh2, sm2] = rangeMatch
    const [h1, m1, h2, m2] = [Number(sh1), Number(sm1), Number(sh2), Number(sm2)]
    if (h1 > 23 || m1 > 59 || h2 > 23 || m2 > 59) return null
    return { startMinutes: toMinutes(h1, m1), endMinutes: toMinutes(h2, m2) }
  }

  const singleMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (singleMatch) {
    const [, sh, sm] = singleMatch
    const [h, m] = [Number(sh), Number(sm)]
    if (h > 23 || m > 59) return null
    const start = toMinutes(h, m)
    return { startMinutes: start, endMinutes: start + 60 }
  }

  return null
}

function rowInRange(row: RawRow, range: ParsedRange): boolean {
  if (!range) return true
  const d = new Date(row.timestamp)
  const minutes = d.getHours() * 60 + d.getMinutes()
  const { startMinutes, endMinutes } = range
  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes <= endMinutes
  }
  return minutes >= startMinutes || minutes <= endMinutes
}

function valueFor(row: RawRow, key: ColumnKey): string {
  switch (key) {
    case "hr":
      return formatNumber(row.heartRate)
    case "rr":
      return formatNumber(row.rrAverageMs, 1)
    case "skin":
      return row.skinContact == null ? "—" : row.skinContact ? "yes" : "no"
    case "gravity":
      return formatNumber(row.gravityMagnitude, 3)
    case "resp":
      return formatNumber(row.respRateRaw, 2)
    case "spo2r":
      return formatNumber(row.spo2Red)
    case "spo2ir":
      return formatNumber(row.spo2IR)
    case "temp":
      return formatNumber(row.skinTempRaw, 2)
    default:
      return ""
  }
}

export function RawTab({
  raw,
  date,
}: {
  raw: RawRecords | null
  date: string
}) {
  const [filterInput, setFilterInput] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const inputIsNonEmpty = filterInput.trim().length > 0
  const parsedRange = useMemo(() => parseTimeRange(filterInput), [filterInput])
  const inputInvalid = inputIsNonEmpty && parsedRange === null

  const filteredRows = useMemo(() => {
    if (!raw) return []
    if (!parsedRange) return raw.rows
    return raw.rows.filter((r) => rowInRange(r, parsedRange))
  }, [raw, parsedRange])

  const handleCopy = useCallback((row: RawRow) => {
    const text = JSON.stringify(row, null, 2)
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Row JSON copied to clipboard")
      })
      .catch(() => {})
  }, [])

  const renderHeader = useCallback(
    () => (
      <div role="row" className="flex border-b">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            role="columnheader"
            className="px-4 py-3 text-left text-muted-foreground font-medium text-xs uppercase tracking-wider shrink-0"
            style={{ width: col.width }}
          >
            {col.label}
          </div>
        ))}
      </div>
    ),
    [],
  )

  const renderRow = useCallback(
    (row: RawRow) => {
      const isHovered = hoveredId === row.id
      return (
        <div
          role="row"
          className="flex items-center border-b border-border/50 hover:bg-muted/50 focus:outline-none focus:bg-muted/50 transition-colors"
          onMouseEnter={() => setHoveredId(row.id)}
          onMouseLeave={() => setHoveredId(null)}
          onFocus={() => setHoveredId(row.id)}
          onBlur={() => setHoveredId(null)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "c") {
              e.preventDefault()
              handleCopy(row)
            }
          }}
          style={{ height: ROW_HEIGHT }}
        >
          {COLUMNS.map((col) => {
            if (col.key === "timestamp") {
              return (
                <div
                  key={col.key}
                  role="cell"
                  className="px-4 text-foreground whitespace-nowrap shrink-0"
                  style={{ width: col.width }}
                >
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {formatRowTime(row.timestamp)}
                    <Copy
                      aria-hidden
                      className={cn(
                        "size-3 text-muted-foreground transition-opacity shrink-0",
                        isHovered ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </span>
                </div>
              )
            }
            return (
              <div
                key={col.key}
                role="cell"
                className="px-4 text-foreground tabular-nums shrink-0 truncate"
                style={{ width: col.width }}
              >
                {valueFor(row, col.key)}
              </div>
            )
          })}
        </div>
      )
    },
    [hoveredId, handleCopy],
  )

  const totalCount = raw?.count ?? 0
  const filterActive = inputIsNonEmpty && parsedRange !== null

  const rowCountLabel = filterActive
    ? `${filteredRows.length} of ${totalCount} rows · ${date}`
    : `${totalCount} rows · ${date}`

  if (raw?.count === 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Raw sensor records</SectionHead>
          <span className="text-muted-foreground text-sm">{date}</span>
        </div>
        <Alert>
          <AlertDescription>
            No sensor records for {date}. Select a different date or check that the strap synced.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionHead>Raw sensor records</SectionHead>
        <span className="text-muted-foreground text-sm">{rowCountLabel}</span>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="Filter by time — e.g. 02:00-03:00 or 14:30"
              aria-invalid={inputInvalid || undefined}
              className={cn(
                "w-72",
                inputInvalid && "border-destructive focus-visible:ring-destructive/20",
              )}
            />
            {filterActive && (
              <Button variant="ghost" size="sm" onClick={() => setFilterInput("")}>
                Clear
              </Button>
            )}
          </div>
          {inputInvalid && (
            <p className="text-xs text-destructive">
              Use HH:MM or HH:MM-HH:MM (24-hour). Example: 02:00-03:30
            </p>
          )}
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <VirtualTable
            rows={filteredRows}
            rowHeight={ROW_HEIGHT}
            renderHeader={renderHeader}
            renderRow={renderRow}
            maxHeight={window.innerHeight - 260}
          />
          <p className="px-6 py-3 text-xs text-muted-foreground">
            Focus a row, then press{" "}
            <kbd className="font-mono bg-muted border border-border rounded px-1 py-0.5">Cmd C</kbd>{" "}
            to copy the record as JSON.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
