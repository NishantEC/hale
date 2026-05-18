import { useMemo } from "react"
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

import type { RawRecords, SleepNight } from "../api"
import { HYPNOGRAM_STAGES } from "./Hypnogram"
import { SectionHead } from "./primitives"

// Stage × HR scatter. Joins epoch stage labels with raw HR samples on
// nearest-timestamp within an epoch window (default 30s). Lets you spot
// classifier vs biometric disagreement at a glance — e.g. if Deep
// epochs cluster at higher HR than Awake epochs, the classifier likely
// inverted the signal.

const STAGE_ORDER = ["deep", "core", "rem", "awake"] as const
type StageKey = (typeof STAGE_ORDER)[number]

function normalize(s: string): StageKey | null {
  const k = s.toLowerCase()
  if (k === "light") return "core"
  if (k === "sws") return "deep"
  if ((STAGE_ORDER as readonly string[]).includes(k)) return k as StageKey
  return null
}

type ScatterPoint = { hr: number; stageIndex: number; stage: StageKey; ts: number }

const EPOCH_WINDOW_MS = 30_000

export function StageHrScatter({
  sleep,
  raw,
}: {
  sleep: SleepNight | null
  raw: RawRecords | null
}) {
  const points = useMemo<ScatterPoint[]>(() => {
    if (!sleep?.epochTimeline?.length || !raw?.rows?.length) return []

    const epochs = sleep.epochTimeline
      .map((e) => ({
        t: Date.parse(e.timestamp),
        stage: normalize(e.stage),
      }))
      .filter((e): e is { t: number; stage: StageKey } => e.stage !== null && !Number.isNaN(e.t))
      .sort((a, b) => a.t - b.t)

    if (epochs.length === 0) return []

    const rows = raw.rows
      .map((r) => ({ t: Date.parse(r.timestamp), hr: r.heartRate }))
      .filter((r) => !Number.isNaN(r.t) && r.hr > 0)
      .sort((a, b) => a.t - b.t)

    // Two-pointer join: for each raw row, find the epoch whose start is
    // within EPOCH_WINDOW_MS before it.
    const out: ScatterPoint[] = []
    let ei = 0
    for (const row of rows) {
      while (ei < epochs.length - 1 && epochs[ei + 1].t <= row.t) ei++
      const ep = epochs[ei]
      if (row.t - ep.t > EPOCH_WINDOW_MS || row.t < ep.t) continue
      out.push({
        hr: row.hr,
        stage: ep.stage,
        stageIndex: STAGE_ORDER.indexOf(ep.stage),
        ts: row.t,
      })
    }
    return out
  }, [sleep, raw])

  const byStage = useMemo(() => {
    const map: Record<StageKey, ScatterPoint[]> = { deep: [], core: [], rem: [], awake: [] }
    for (const p of points) map[p.stage].push(p)
    return map
  }, [points])

  if (points.length === 0) {
    return (
      <div>
        <SectionHead>Stage × HR scatter</SectionHead>
        <div className="mt-3 bg-card border border-border rounded-2xl p-6 text-muted-foreground text-sm">
          Need both an epoch timeline and raw HR samples to plot. Try running the pipeline for
          this date and/or sync the strap.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionHead>Stage × HR scatter</SectionHead>
        <span className="text-muted-foreground text-xs">
          {points.length} epoch×HR pairs · expect HR to drop from Awake to Deep
        </span>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <XAxis
              type="number"
              dataKey="hr"
              name="HR"
              unit="bpm"
              domain={["dataMin - 3", "dataMax + 3"]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              label={{
                value: "Heart rate (bpm)",
                position: "insideBottom",
                fill: "var(--muted-foreground)",
                fontSize: 11,
                dy: 10,
              }}
            />
            <YAxis
              type="number"
              dataKey="stageIndex"
              domain={[-0.5, 3.5]}
              ticks={[0, 1, 2, 3]}
              tickFormatter={(v) => STAGE_ORDER[v]?.toUpperCase() ?? ""}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              width={56}
            />
            <ZAxis range={[20, 20]} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.15)" }}
              contentStyle={{
                background: "var(--muted)",
                border: "1px solid var(--ring)",
                borderRadius: 12,
                fontSize: 13,
              }}
              formatter={(value, name) => {
                if (name === "stageIndex") return [STAGE_ORDER[Number(value)] ?? value, "stage"]
                return [`${Math.round(Number(value))} bpm`, "HR"]
              }}
            />
            {STAGE_ORDER.map((stage) => (
              <Scatter
                key={stage}
                name={stage}
                data={byStage[stage]}
                fill={HYPNOGRAM_STAGES[stage].color}
                fillOpacity={0.55}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
