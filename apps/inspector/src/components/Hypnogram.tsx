import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as RME,
  type ReactNode,
} from "react"

import { formatTime } from "../format"

// Hypnogram visualization — port of the react-native-sleep-stages
// reference component. Renders epoch-by-epoch sleep stage timeline
// with hover tooltip and dashed hour columns.

const STAGES = {
  awake: { pos: 0, label: "Awake", color: "#FE8A73" },
  rem: { pos: 1, label: "REM", color: "#3FB1E7" },
  core: { pos: 2, label: "Core", color: "#1B81FE" },
  deep: { pos: 3, label: "Deep", color: "#403EA7" },
} as const
const STAGE_KEYS = ["awake", "rem", "core", "deep"] as const

const DEFAULT_CHART_HEIGHT = 260
const MARGIN = 16
const BAR_WIDTH = 2
const DASH_HEIGHT = 3

// SVG corner paths for the rounded bar terminations (top & bottom).
const CORNER_TOP =
  "M6 7V15H5C5 15 5.30874 11.8133 4.02284 10.107C2.73695 8.40073 0 8 0 8V7H6Z"
const CORNER_BOTTOM =
  "M6 8V0H5C5 0 5.28401 3.15824 4 5C2.71599 6.84176 0 7 0 7V8H6Z"

type StageKey = keyof typeof STAGES
type Segment = {
  id: number
  type: StageKey
  fromMin: number
  toMin: number
}

function normalizeStage(s: string): StageKey {
  const k = s.toLowerCase()
  if (k === "light") return "core"
  if (k === "sws") return "deep"
  if (k in STAGES) return k as StageKey
  return "core"
}

function buildSegments(epochs: { stage: string }[]): Segment[] {
  if (!epochs.length) return []
  const out: Segment[] = []
  let current = normalizeStage(epochs[0].stage)
  let start = 0
  for (let i = 1; i < epochs.length; i++) {
    const next = normalizeStage(epochs[i].stage)
    if (next !== current) {
      out.push({ id: out.length, type: current, fromMin: start, toMin: i })
      current = next
      start = i
    }
  }
  out.push({ id: out.length, type: current, fromMin: start, toMin: epochs.length })
  return out
}

function lerp(v: number, a: number, b: number, c: number, d: number): number {
  return b === a ? c : c + ((v - a) / (b - a)) * (d - c)
}

export function Hypnogram({
  epochs,
  height = DEFAULT_CHART_HEIGHT,
  cursorMs,
  onCursorChange,
}: {
  epochs: Array<{ timestamp: string; stage: string }>
  height?: number
  cursorMs?: number | null
  onCursorChange?: (ms: number | null) => void
}) {
  const CHART_HEIGHT = height
  const ROW_HEIGHT = (CHART_HEIGHT - MARGIN) / 4
  const BAR_HEIGHT = ROW_HEIGHT * 0.45
  const BAR_OFFSET = BAR_HEIGHT * 0.8

  const ref = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [cursor, setCursor] = useState<{
    x: number
    seg: Segment
    durationMin: number
    from: string
    to: string
    nowLabel: string
  } | null>(null)
  const segments = useMemo(() => buildSegments(epochs), [epochs])
  const total = epochs.length

  const firstEpochMs = epochs[0] ? Date.parse(epochs[0].timestamp) : null
  const lastEpochMs = epochs[epochs.length - 1] ? Date.parse(epochs[epochs.length - 1].timestamp) : null
  const totalMs = firstEpochMs != null && lastEpochMs != null ? lastEpochMs - firstEpochMs : 0

  // External cursor (from cross-chart controller) → x position in this chart.
  const externalX =
    cursorMs != null && firstEpochMs != null && lastEpochMs != null && containerWidth > 0 &&
    cursorMs >= firstEpochMs && cursorMs <= lastEpochMs
      ? ((cursorMs - firstEpochMs) / Math.max(1, totalMs)) * containerWidth
      : null

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onMouseMove = useCallback(
    (e: RME) => {
      if (!containerWidth || !segments.length) return
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - r.left, containerWidth))
      const min = lerp(x, 0, containerWidth, 0, total)
      const seg =
        segments.find((s) => min >= s.fromMin && min < s.toMin) ??
        (min <= segments[0].fromMin
          ? segments[0]
          : segments[segments.length - 1])
      const durationMin = seg.toMin - seg.fromMin
      const nowEpoch = epochs[Math.max(0, Math.min(Math.floor(min), epochs.length - 1))]
      const nowMs = nowEpoch ? Date.parse(nowEpoch.timestamp) : null
      setCursor({
        x,
        seg,
        durationMin,
        from: epochs[seg.fromMin] ? formatTime(epochs[seg.fromMin].timestamp) : "",
        to: epochs[Math.min(seg.toMin, epochs.length - 1)]
          ? formatTime(epochs[Math.min(seg.toMin, epochs.length - 1)].timestamp)
          : "",
        nowLabel: nowEpoch ? formatTime(nowEpoch.timestamp) : "",
      })
      if (nowMs != null) onCursorChange?.(nowMs)
    },
    [containerWidth, segments, total, epochs, onCursorChange],
  )

  const onMouseLeave = useCallback(() => {
    setCursor(null)
    onCursorChange?.(null)
  }, [onCursorChange])

  // The SVG <defs> + mask geometry only depends on segments and the
  // chart-width-derived constants. Memoising lifts the 4× segments.map
  // work off the cursor-move render path.
  const defs = useMemo<ReactNode>(() => {
    if (!containerWidth || !segments.length) return null
    return (
      <defs>
        <linearGradient id="hg" x1="0" y1="0.2" x2="0" y2="0.95">
          {STAGE_KEYS.map((k) => (
            <stop
              key={k}
              offset={STAGES[k].pos / 4}
              stopColor={STAGES[k].color}
              stopOpacity={0.3}
            />
          ))}
        </linearGradient>
        <mask id="hm">
          {segments.map((s) => {
            const top = STAGES[s.type].pos * ROW_HEIGHT + BAR_OFFSET
            const left = lerp(s.fromMin, 0, total, 0, containerWidth) - BAR_WIDTH
            const width = lerp(s.toMin - s.fromMin, 0, total, 0, containerWidth) + BAR_WIDTH
            return (
              <rect
                key={`b${s.id}`}
                x={left}
                y={top}
                width={Math.max(width, 4)}
                height={BAR_HEIGHT}
                rx={8}
                fill="white"
              />
            )
          })}
          {segments.map((s, i) => {
            if (i === 0) return null
            const prev = segments[i - 1]
            if (prev.type === s.type) return null
            const top = STAGES[s.type].pos * ROW_HEIGHT + BAR_OFFSET
            const left = lerp(s.fromMin, 0, total, 0, containerWidth) - BAR_WIDTH
            const lineHeight =
              (ROW_HEIGHT - BAR_HEIGHT) *
              Math.abs(STAGES[s.type].pos - STAGES[prev.type].pos)
            const y =
              STAGES[prev.type].pos > STAGES[s.type].pos
                ? top + BAR_HEIGHT / 2
                : top - lineHeight + BAR_HEIGHT / 2
            return (
              <rect
                key={`lc${s.id}`}
                x={left}
                y={y}
                width={BAR_WIDTH}
                height={lineHeight}
                fill="white"
              />
            )
          })}
          {segments.map((s, i) => {
            if (i === segments.length - 1) return null
            const next = segments[i + 1]
            if (next.type === s.type) return null
            const top = STAGES[s.type].pos * ROW_HEIGHT + BAR_OFFSET
            const left = lerp(s.fromMin, 0, total, 0, containerWidth) - BAR_WIDTH
            const barWidth = lerp(s.toMin - s.fromMin, 0, total, 0, containerWidth) + BAR_WIDTH
            const lineHeight =
              (ROW_HEIGHT - BAR_HEIGHT) *
              Math.abs(STAGES[s.type].pos - STAGES[next.type].pos)
            const y =
              STAGES[next.type].pos > STAGES[s.type].pos
                ? top + BAR_HEIGHT / 2
                : top - lineHeight + BAR_HEIGHT / 2
            return (
              <rect
                key={`rc${s.id}`}
                x={left + barWidth - BAR_WIDTH}
                y={y}
                width={BAR_WIDTH}
                height={lineHeight}
                fill="white"
              />
            )
          })}
          {segments.map((s, i) => {
            const parts: ReactNode[] = []
            const top = STAGES[s.type].pos * ROW_HEIGHT + BAR_OFFSET
            const left = lerp(s.fromMin, 0, total, 0, containerWidth) - BAR_WIDTH
            const barWidth = lerp(s.toMin - s.fromMin, 0, total, 0, containerWidth) + BAR_WIDTH
            if (i > 0 && segments[i - 1].type !== s.type && barWidth > 8) {
              const prevAbove = STAGES[segments[i - 1].type].pos > STAGES[s.type].pos
              parts.push(
                <g
                  key={`cl${s.id}`}
                  transform={`translate(${left + 1.3}, ${
                    top - 7.2 + (prevAbove ? BAR_HEIGHT - 1 : 1)
                  }) rotate(180, 3, 7.5)`}
                >
                  <path d={CORNER_TOP} fill="white" />
                  <path d={CORNER_BOTTOM} fill="white" />
                </g>,
              )
            }
            if (i < segments.length - 1 && segments[i + 1].type !== s.type && barWidth > 8) {
              const nextAbove = STAGES[segments[i + 1].type].pos > STAGES[s.type].pos
              parts.push(
                <g
                  key={`cr${s.id}`}
                  transform={`translate(${left + barWidth - 7.3}, ${
                    top - 7.2 + (nextAbove ? BAR_HEIGHT - 1 : 1)
                  })`}
                >
                  <path d={CORNER_TOP} fill="white" />
                  <path d={CORNER_BOTTOM} fill="white" />
                </g>,
              )
            }
            return parts
          })}
        </mask>
      </defs>
    )
  }, [segments, containerWidth, total, ROW_HEIGHT, BAR_HEIGHT, BAR_OFFSET])

  if (!segments.length)
    return (
      <p className="text-muted-foreground py-10 text-center">
        No epoch timeline available.
      </p>
    )

  const firstHour = epochs[0] ? new Date(epochs[0].timestamp).getHours() : 0
  const lastHour = epochs[epochs.length - 1]
    ? new Date(epochs[epochs.length - 1].timestamp).getHours() + 1
    : 8
  const hourCount =
    lastHour > firstHour ? lastHour - firstHour : 24 - firstHour + lastHour
  const hours = Array.from({ length: hourCount }, (_, i) => (firstHour + i) % 24)

  return (
    <div>
      <div
        ref={ref}
        className="relative select-none"
        style={{
          height: CHART_HEIGHT,
          borderLeft: "1px solid rgba(255,255,255,0.12)",
          borderRight: "1px solid rgba(255,255,255,0.12)",
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {containerWidth > 0 && (
          <>
            {STAGE_KEYS.map((key, i) => (
              <div
                key={key}
                className="absolute left-0 right-0"
                style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                {i > 0 && (
                  <div
                    className="absolute top-0 left-0 right-0"
                    style={{
                      height: 0.5,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
                <span
                  className="absolute text-muted-foreground pointer-events-none"
                  style={{ fontSize: 11, left: 5, top: 5 }}
                >
                  {STAGES[key].label}
                </span>
              </div>
            ))}

            {hours.map((_, i) => {
              const colW = containerWidth / hours.length
              if (i >= hours.length - 1) return null
              return (
                <div
                  key={`dh${i}`}
                  className="absolute top-0"
                  style={{
                    left: colW * (i + 1),
                    width: 0.5,
                    height: CHART_HEIGHT,
                  }}
                >
                  {Array.from({
                    length: Math.floor(CHART_HEIGHT / (DASH_HEIGHT * 2)),
                  }).map((_, di) => (
                    <div
                      key={di}
                      style={{
                        width: 1,
                        height: DASH_HEIGHT,
                        marginTop: DASH_HEIGHT,
                        background: "rgba(255,255,255,0.08)",
                      }}
                    />
                  ))}
                </div>
              )
            })}

            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={containerWidth}
              height={CHART_HEIGHT}
              style={{ overflow: "visible" }}
            >
              {defs}
              <rect
                x={0}
                y={0}
                width={containerWidth}
                height={CHART_HEIGHT}
                fill="url(#hg)"
                mask="url(#hm)"
              />
            </svg>

            {segments.map((s) => {
              const top =
                STAGES[s.type].pos * ROW_HEIGHT + BAR_OFFSET + BAR_WIDTH
              const left = lerp(s.fromMin, 0, total, 0, containerWidth)
              const width =
                lerp(s.toMin - s.fromMin, 0, total, 0, containerWidth) -
                BAR_WIDTH
              return (
                <div
                  key={`bar${s.id}`}
                  className="absolute"
                  style={{ top, left, width: Math.max(width, 1) }}
                >
                  <div
                    style={{
                      height: BAR_HEIGHT - BAR_WIDTH * 2,
                      borderRadius: 6,
                      backgroundColor: STAGES[s.type].color,
                      minWidth: 1,
                    }}
                  />
                </div>
              )
            })}

            {externalX != null && cursor == null && (
              <div
                className="absolute top-0 pointer-events-none"
                style={{
                  left: externalX,
                  width: 1.5,
                  height: CHART_HEIGHT,
                  backgroundColor: "var(--primary)",
                  opacity: 0.6,
                }}
              />
            )}

            {cursor && (
              <>
                <div
                  className="absolute top-0 pointer-events-none"
                  style={{
                    left: cursor.x,
                    width: 2.5,
                    height: CHART_HEIGHT,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    borderRadius: 1,
                  }}
                />
                <div
                  className="absolute pointer-events-none bg-muted rounded-xl px-3 py-2.5 border border-ring shadow-lg"
                  style={{
                    left: Math.max(0, Math.min(cursor.x - 70, containerWidth - 150)),
                    top: 8,
                  }}
                >
                  <p className="text-foreground text-sm font-semibold tabular-nums">
                    {cursor.nowLabel}
                  </p>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mt-1">
                    {cursor.seg.type === "awake"
                      ? "Awake"
                      : `${STAGES[cursor.seg.type].label} sleep`}
                  </p>
                  <p>
                    <span className="text-xl font-semibold">
                      {cursor.durationMin}
                    </span>
                    <span className="text-muted-foreground text-xs"> min</span>
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {cursor.from} – {cursor.to}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className="flex justify-between mt-2 px-0.5">
        {hours.map((h, i) => (
          <span key={i} className="text-muted-foreground text-xs">
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  )
}

export { STAGES as HYPNOGRAM_STAGES }
