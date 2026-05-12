import type { RawRecords } from "../api"
import { SectionHead } from "../components/primitives"
import { formatNumber, formatTimestamp } from "../format"

const COLUMNS = [
  "Timestamp",
  "HR",
  "RR avg",
  "Skin",
  "Gravity",
  "Resp",
  "SpO2 R",
  "SpO2 IR",
  "Temp",
] as const

export function RawTab({
  raw,
  date,
}: {
  raw: RawRecords | null
  date: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionHead>Raw sensor records</SectionHead>
        <span className="text-text-2 text-sm">
          {raw?.count ?? 0} rows · {date}
        </span>
      </div>
      <div
        className="overflow-auto rounded-xl border border-border"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-surface-1 z-10">
            <tr>
              {COLUMNS.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-text-2 font-medium text-xs uppercase tracking-wider border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {raw?.rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/50 hover:bg-surface-1 transition-colors"
              >
                <td className="px-4 py-2.5 text-text-1">
                  {formatTimestamp(r.timestamp)}
                </td>
                <td className="px-4 py-2.5">{formatNumber(r.heartRate)}</td>
                <td className="px-4 py-2.5">
                  {formatNumber(r.rrAverageMs, 1)}
                </td>
                <td className="px-4 py-2.5">
                  {r.skinContact == null ? "—" : r.skinContact ? "Y" : "N"}
                </td>
                <td className="px-4 py-2.5">
                  {formatNumber(r.gravityMagnitude, 3)}
                </td>
                <td className="px-4 py-2.5">
                  {formatNumber(r.respRateRaw, 2)}
                </td>
                <td className="px-4 py-2.5">{formatNumber(r.spo2Red)}</td>
                <td className="px-4 py-2.5">{formatNumber(r.spo2IR)}</td>
                <td className="px-4 py-2.5">
                  {formatNumber(r.skinTempRaw, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
