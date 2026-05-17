import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import type { RawRecords } from "../api"
import { SectionHead } from "../components/primitives"
import { VirtualTable } from "../components/VirtualTable"
import { formatNumber } from "../format"

const ROW_HEIGHT = 40

const COLUMNS = [
  { key: "timestamp",   label: "Time" },
  { key: "hr",          label: "HR" },
  { key: "rr",          label: "RR avg" },
  { key: "skin",        label: "Skin contact" },
  { key: "gravity",     label: "Gravity" },
  { key: "resp",        label: "Resp" },
  { key: "spo2r",       label: "SpO2 R" },
  { key: "spo2ir",      label: "SpO2 IR" },
  { key: "temp",        label: "Skin temp" },
] as const

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

function CopyIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      className={`inline-block ml-1.5 text-text-2 transition-opacity ${visible ? "opacity-100" : "opacity-0"} shrink-0`}
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

type CopiedState = { id: string; timeoutId: ReturnType<typeof setTimeout> } | null

export function RawTab({
  raw,
  date,
}: {
  raw: RawRecords | null
  date: string
}) {
  const [filterInput, setFilterInput] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopiedState>(null)
  const copiedRef = useRef<CopiedState>(null)

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
    navigator.clipboard.writeText(text).then(() => {
      if (copiedRef.current) clearTimeout(copiedRef.current.timeoutId)
      const timeoutId = setTimeout(() => {
        setCopied(null)
        copiedRef.current = null
      }, 1800)
      const next = { id: row.id, timeoutId }
      copiedRef.current = next
      setCopied(next)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    return () => { if (copiedRef.current) clearTimeout(copiedRef.current.timeoutId) }
  }, [])

  const renderHeader = useCallback(() => (
    <tr>
      {COLUMNS.map((col) => (
        <th
          key={col.key}
          className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border"
        >
          {col.label}
        </th>
      ))}
    </tr>
  ), [])

  const renderRow = useCallback((row: RawRow) => {
    const isHovered = hoveredId === row.id
    const isCopied = copied?.id === row.id
    return (
      <tr
        className="border-b border-border/50 hover:bg-surface-1 transition-colors focus:outline-none focus:bg-surface-1"
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
      >
        <td className="px-4 py-2.5 text-text-1 whitespace-nowrap" style={{ width: "14%" }}>
          <span className="flex items-center">
            {formatRowTime(row.timestamp)}
            {isCopied
              ? <span className="ml-1.5 text-[11px] text-green font-medium">copied</span>
              : <CopyIcon visible={isHovered} />
            }
          </span>
        </td>
        <td className="px-4 py-2.5" style={{ width: "9%" }}>{formatNumber(row.heartRate)}</td>
        <td className="px-4 py-2.5" style={{ width: "10%" }}>{formatNumber(row.rrAverageMs, 1)}</td>
        <td className="px-4 py-2.5" style={{ width: "11%" }}>
          {row.skinContact == null ? "—" : row.skinContact ? "yes" : "no"}
        </td>
        <td className="px-4 py-2.5" style={{ width: "12%" }}>{formatNumber(row.gravityMagnitude, 3)}</td>
        <td className="px-4 py-2.5" style={{ width: "10%" }}>{formatNumber(row.respRateRaw, 2)}</td>
        <td className="px-4 py-2.5" style={{ width: "9%" }}>{formatNumber(row.spo2Red)}</td>
        <td className="px-4 py-2.5" style={{ width: "9%" }}>{formatNumber(row.spo2IR)}</td>
        <td className="px-4 py-2.5" style={{ width: "10%" }}>{formatNumber(row.skinTempRaw, 2)}</td>
      </tr>
    )
  }, [hoveredId, copied, handleCopy])

  if (raw?.count === 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <SectionHead>Raw sensor records</SectionHead>
          <span className="text-text-2 text-sm">{date}</span>
        </div>
        <div className="py-16 text-center text-text-2 text-sm">
          No sensor records for {date}. Select a different date or check that the strap synced.
        </div>
      </div>
    )
  }

  const totalCount = raw?.count ?? 0
  const filterActive = inputIsNonEmpty && parsedRange !== null

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionHead>Raw sensor records</SectionHead>
        <span className="text-text-2 text-sm">
          {filterActive
            ? `${filteredRows.length} of ${totalCount} rows · ${date}`
            : `${totalCount} rows · ${date}`}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder="Filter by time — e.g. 02:00-03:00 or 14:30"
            className={[
              "w-72 px-3 py-1.5 text-sm rounded-lg border bg-surface-1 text-text-1",
              "placeholder:text-text-2 outline-none focus:ring-1 transition-colors",
              inputInvalid
                ? "border-red/60 focus:ring-red/40"
                : "border-border focus:ring-border focus:border-text-2",
            ].join(" ")}
          />
          {filterActive && (
            <button
              onClick={() => setFilterInput("")}
              className="text-xs text-text-2 hover:text-text-1 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {inputInvalid && (
          <p className="mt-1 text-xs text-red/80">
            Use HH:MM or HH:MM-HH:MM (24-hour). Example: 02:00-03:30
          </p>
        )}
      </div>

      <VirtualTable
        rows={filteredRows}
        rowHeight={ROW_HEIGHT}
        renderHeader={renderHeader}
        renderRow={renderRow}
        maxHeight={window.innerHeight - 220}
      />

      <p className="mt-2 text-xs text-text-2">
        Focus a row, then press{" "}
        <kbd className="font-mono bg-surface-2 border border-border rounded px-1 py-0.5">Cmd C</kbd>{" "}
        to copy the record as JSON.
      </p>
    </div>
  )
}
