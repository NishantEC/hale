import type { PipelineResults, PipelineState } from "../api"
import { Num, Pill, Row, SectionHead } from "../components/primitives"
import { formatDuration, formatTimestamp, relativeTime } from "../format"

// The Pipeline tab now has two parts:
//   1) STATE  — incremental watermark from /debug/pipeline-state. Shows
//      whether the next run would skip (no new input) or recompute, plus
//      last-run-at / duration / max input updatedAt.
//   2) OUTPUT — counts from /debug/pipeline-results (existing behavior).
// State first because it's the actionable signal — when you tap "Run
// Pipeline Now" in the sidebar, you can compare lastRunAt before/after
// and confirm the run actually executed.

export function PipelineTab({
  state,
  results,
}: {
  state: PipelineState | null
  results: PipelineResults | null
}) {
  return (
    <div className="space-y-12">
      <PipelineStateBlock state={state} />
      <PipelineResultsBlock results={results} />
    </div>
  )
}

function PipelineStateBlock({ state }: { state: PipelineState | null }) {
  const s = state?.state ?? null
  const hasRun = s != null
  const dirty = state?.isDirty ?? false
  const inputs = state?.inputs

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionHead>Pipeline state</SectionHead>
        {hasRun ? (
          dirty ? (
            <Pill tone="yellow">DIRTY — would recompute</Pill>
          ) : (
            <Pill tone="green">CLEAN — would skip</Pill>
          )
        ) : (
          <Pill tone="neutral">never run</Pill>
        )}
      </div>

      <div className="grid grid-cols-4 gap-8 mt-4">
        <Num
          label="Last run"
          value={s?.lastRunAt ? relativeTime(s.lastRunAt) : "—"}
          sub={s?.lastRunAt ? formatTimestamp(s.lastRunAt) : "no runs yet"}
        />
        <Num
          label="Last duration"
          value={formatDuration(s?.lastRunDurationMs)}
          sub="end-to-end"
        />
        <Num
          label="Raw rows (45d)"
          value={inputs?.rawSensorRecords.count ?? 0}
          sub={
            inputs?.rawSensorRecords.latestTimestamp
              ? `latest ${relativeTime(inputs.rawSensorRecords.latestTimestamp)}`
              : "—"
          }
        />
        <Num
          label="Signal samples (45d)"
          value={inputs?.signalSamples.count ?? 0}
          sub={
            inputs?.signalSamples.latestTimestamp
              ? `latest ${relativeTime(inputs.signalSamples.latestTimestamp)}`
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8">
        <div>
          <SectionHead>Watermark</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="Last run at"
              v={s?.lastRunAt ? formatTimestamp(s.lastRunAt) : "—"}
            />
            <Row
              k="Last input max"
              v={
                s?.lastInputMaxUpdatedAt
                  ? formatTimestamp(s.lastInputMaxUpdatedAt)
                  : "—"
              }
            />
            <Row
              k="Current input max"
              v={
                state?.currentMaxUpdatedAt
                  ? formatTimestamp(state.currentMaxUpdatedAt)
                  : "—"
              }
            />
            <Row
              k="Window start"
              v={state?.windowStart ? formatTimestamp(state.windowStart) : "—"}
            />
          </div>
        </div>
        <div>
          <SectionHead>Input freshness</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="Raw — latest insert"
              v={formatTimestamp(inputs?.rawSensorRecords.latestUpdatedAt)}
            />
            <Row
              k="Raw — latest timestamp"
              v={formatTimestamp(inputs?.rawSensorRecords.latestTimestamp)}
            />
            <Row
              k="Signal — latest insert"
              v={formatTimestamp(inputs?.signalSamples.latestUpdatedAt)}
            />
            <Row
              k="Signal — latest timestamp"
              v={formatTimestamp(inputs?.signalSamples.latestTimestamp)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PipelineResultsBlock({ results }: { results: PipelineResults | null }) {
  return (
    <div>
      <SectionHead>Output</SectionHead>
      <div className="grid grid-cols-4 gap-8 mt-4">
        <Num
          label="Raw records"
          value={results?.rawRecordCount ?? 0}
          sub="total ingested"
        />
        <Num
          label="Detections"
          value={results?.results.sleepDetections.length ?? 0}
          sub="persisted"
        />
        <Num
          label="Stages"
          value={results?.results.sleepStages.length ?? 0}
          sub="persisted"
        />
        <Num
          label="Scores"
          value={results?.results.dailyScores.length ?? 0}
          sub="persisted"
        />
      </div>
      <div className="grid grid-cols-2 gap-16 mt-8">
        <div>
          <SectionHead>Tables</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="Night features"
              v={String(results?.results.nightFeatures.length ?? 0)}
            />
            <Row
              k="Daily metrics"
              v={String(results?.results.dailyMetrics.length ?? 0)}
            />
            <Row
              k="Typical ranges"
              v={results?.results.typicalRanges ? "Present" : "Missing"}
            />
            <Row
              k="Baseline"
              v={results?.results.baselineProfile ? "Present" : "Missing"}
            />
            <Row
              k="Sleep plan"
              v={results?.results.sleepPlan ? "Present" : "Missing"}
            />
            <Row
              k="Journal corr."
              v={String(results?.results.journalCorrelations.length ?? 0)}
            />
          </div>
        </div>
        <div>
          <SectionHead>Time range</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Earliest" v={formatTimestamp(results?.earliestRawTimestamp)} />
            <Row k="Latest" v={formatTimestamp(results?.latestRawTimestamp)} />
          </div>
        </div>
      </div>
    </div>
  )
}
