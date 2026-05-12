import type { Telemetry } from "../api"
import { Num, SectionHead } from "../components/primitives"
import { formatTime } from "../format"

export function TelemetryTab({
  telemetry,
  live,
  toggleLive,
}: {
  telemetry: Telemetry | null
  live: boolean
  toggleLive: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLive}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            live
              ? "bg-green-soft text-green"
              : "text-text-1 border border-border hover:border-border-strong"
          }`}
        >
          {live ? "Live · 5s" : "Auto-refresh off"}
        </button>
        {live && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-green"
            style={{ animation: "pulse 1.5s ease-in-out infinite" }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Num
          label="Device events"
          value={telemetry?.events.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.events.summary ?? {}).length} event types`}
        />
        <Num
          label="Realtime samples"
          value={telemetry?.realtime.totalCount ?? 0}
          sub={`${Object.keys(telemetry?.realtime.sessions ?? {}).length} sessions`}
        />
      </div>

      {telemetry && Object.keys(telemetry.events.summary).length > 0 && (
        <div>
          <SectionHead>Event breakdown</SectionHead>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
            {Object.entries(telemetry.events.summary).map(([name, count]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-text-1">{name}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-10">
        <div>
          <SectionHead>Recent events</SectionHead>
          <div className="mt-3 overflow-auto rounded-xl border border-border max-h-96">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>
                  {["Event", "Device", "Captured", "Received"].map((h) => (
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
                {telemetry?.events.recent.slice(0, 40).map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{e.eventName}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">
                      {e.deviceId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.capturedAt)}</td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(e.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <SectionHead>Recent samples</SectionHead>
          <div className="mt-3 overflow-auto rounded-xl border border-border max-h-96">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-1 z-10">
                <tr>
                  {["Type", "HR", "Session", "Captured"].map((h) => (
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
                {telemetry?.realtime.recent.slice(0, 40).map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="px-4 py-2.5">{s.dataType}</td>
                    <td className="px-4 py-2.5">{s.heartRate ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-text-1 text-xs">
                      {s.sessionId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-text-1">{formatTime(s.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {telemetry?.consoleLogs && (
        <>
          <div className="grid grid-cols-2 gap-8 mt-2">
            <Num
              label="Console logs"
              value={telemetry.consoleLogs.totalCount}
              sub="firmware output lines"
            />
          </div>

          {telemetry.consoleLogs.deviceInfo &&
            Object.keys(telemetry.consoleLogs.deviceInfo).length > 0 && (
              <div>
                <SectionHead>Device info (from logs)</SectionHead>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                  {Object.entries(telemetry.consoleLogs.deviceInfo).map(
                    ([k, v]) => (
                      <div key={k} className="flex items-baseline gap-2">
                        <span className="text-text-2 text-xs">{k}</span>
                        <span className="text-sm font-medium">{String(v)}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

          <div>
            <SectionHead>Recent console logs</SectionHead>
            <div className="mt-3 overflow-auto rounded-xl border border-border max-h-[32rem]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-surface-1 z-10">
                  <tr>
                    {["Level", "Message", "Time"].map((h) => (
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
                  {telemetry.consoleLogs.recent.map((l, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-1">
                      <td className="px-4 py-2 w-16">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            l.logLevel === "error"
                              ? "bg-red-soft text-red"
                              : l.logLevel === "warn"
                              ? "bg-yellow-soft text-yellow"
                              : "text-text-2"
                          }`}
                        >
                          {l.logLevel ?? "info"}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-pre-wrap break-all">
                        {l.message}
                      </td>
                      <td className="px-4 py-2 text-text-1 text-xs whitespace-nowrap">
                        {formatTime(l.capturedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
