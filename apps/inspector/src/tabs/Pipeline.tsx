import { useState } from "react"
import type {
  PipelineResults,
  PipelineRunOptions,
  PipelineRunRow,
  PipelineRunsHistory,
  PipelineState,
} from "../api"
import { PipelineRunDrawer } from "../components/PipelineRunDrawer"
import { PipelineRunsChart } from "../components/PipelineRunsChart"
import { Num, Pill, Row, SectionHead } from "../components/primitives"
import { StatusBadge, type StatusTone } from "../components/StatusBadge"
import { formatDuration, formatTimestamp, relativeTime } from "../format"

export function PipelineTab({
  state,
  results,
  runs,
  date,
  onRunPipeline,
}: {
  state: PipelineState | null
  results: PipelineResults | null
  runs: PipelineRunsHistory | null
  date: string
  onRunPipeline: (opts: PipelineRunOptions) => void
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const selectedRun: PipelineRunRow | null =
    selectedRunId != null
      ? (runs?.runs.find((r) => r.id === selectedRunId) ?? null)
      : null

  const hero = computeHeroStatus(state, () => onRunPipeline({ day: date }))

  return (
    <div className="space-y-12">
      <div>
        <StatusBadge
          tone={hero.tone}
          label={hero.label}
          detail={hero.detail}
          action={hero.action}
          size="lg"
        />
        {hero.watermarkDetail && (
          <div className="mt-3 bg-surface-1 border border-border rounded-xl px-4 py-3 text-[13px] space-y-0">
            <Row
              k="Input high-water mark (prev run)"
              v={formatTimestamp(state?.state?.lastInputMaxUpdatedAt)}
              dense
              highlight="warn"
            />
            <Row
              k="Current input high-water mark"
              v={formatTimestamp(state?.currentMaxUpdatedAt)}
              dense
            />
          </div>
        )}
      </div>

      <PipelineStateBlock state={state} />
      <PipelineRunsChart
        history={runs}
        onRunClick={(id) => setSelectedRunId(id)}
      />
      <PipelineResultsBlock results={results} />

      {selectedRun && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelectedRunId(null)}
          />
          <PipelineRunDrawer
            run={selectedRun}
            onClose={() => setSelectedRunId(null)}
            onRunPipeline={onRunPipeline}
          />
        </>
      )}
    </div>
  )
}

function computeHeroStatus(
  state: PipelineState | null,
  onRun: () => void,
): {
  tone: StatusTone
  label: string
  detail: string
  watermarkDetail: boolean
  action?: { label: string; onClick: () => void }
} {
  if (!state) {
    return {
      tone: "neutral",
      label: "Pipeline state loading…",
      detail: "Fetching pipeline state from backend.",
      watermarkDetail: false,
    }
  }
  if (!state.state) {
    return {
      tone: "error",
      label: "Pipeline: never run",
      detail: "Scores and stages will be empty until you run it.",
      watermarkDetail: false,
      action: { label: "Run", onClick: onRun },
    }
  }
  if (state.isDirty) {
    return {
      tone: "warn",
      label: "Pipeline: dirty",
      detail: "Inputs changed since last run — output is stale.",
      watermarkDetail: true,
      action: { label: "Run", onClick: onRun },
    }
  }
  const lastRun = state.state.lastRunAt
  const dur = state.state.lastRunDurationMs
  return {
    tone: "ok",
    label: "Pipeline: clean",
    detail: [
      lastRun ? `Last run ${relativeTime(lastRun)}` : null,
      dur ? `· duration ${formatDuration(dur)}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    watermarkDetail: false,
  }
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
          status={!hasRun ? "error" : undefined}
        />
        <Num
          label="Last duration"
          value={formatDuration(s?.lastRunDurationMs)}
          sub="end-to-end"
        />
        <Num
          label="Sensor records (45d)"
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
              dense
            />
            <Row
              k="Input high-water mark (prev run)"
              v={
                s?.lastInputMaxUpdatedAt
                  ? formatTimestamp(s.lastInputMaxUpdatedAt)
                  : "—"
              }
              dense
            />
            <Row
              k="Current input high-water mark"
              v={
                state?.currentMaxUpdatedAt
                  ? formatTimestamp(state.currentMaxUpdatedAt)
                  : "—"
              }
              dense
              highlight={dirty ? "warn" : undefined}
            />
            <Row
              k="Window start"
              v={state?.windowStart ? formatTimestamp(state.windowStart) : "—"}
              dense
            />
          </div>
        </div>
        <div>
          <SectionHead>Input freshness</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="Sensor records — latest insert"
              v={formatTimestamp(inputs?.rawSensorRecords.latestUpdatedAt)}
              dense
            />
            <Row
              k="Sensor records — latest timestamp"
              v={formatTimestamp(inputs?.rawSensorRecords.latestTimestamp)}
              dense
            />
            <Row
              k="Signal samples — latest insert"
              v={formatTimestamp(inputs?.signalSamples.latestUpdatedAt)}
              dense
            />
            <Row
              k="Signal samples — latest timestamp"
              v={formatTimestamp(inputs?.signalSamples.latestTimestamp)}
              dense
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
          label="Sensor records"
          value={results?.rawRecordCount ?? 0}
          sub="total ingested"
        />
        <Num
          label="Sleep detections"
          value={results?.results.sleepDetections.length ?? 0}
          sub="persisted"
          status={!results?.results.sleepDetections.length ? "warn" : undefined}
        />
        <Num
          label="Sleep stages"
          value={results?.results.sleepStages.length ?? 0}
          sub="persisted"
          status={!results?.results.sleepStages.length ? "warn" : undefined}
        />
        <Num
          label="Daily scores"
          value={results?.results.dailyScores.length ?? 0}
          sub="persisted"
          status={!results?.results.dailyScores.length ? "warn" : undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-16 mt-8">
        <div>
          <SectionHead>Tables</SectionHead>
          <div className="mt-4 space-y-0">
            <Row
              k="Night features"
              v={String(results?.results.nightFeatures.length ?? 0)}
              dense
            />
            <Row
              k="Daily metrics"
              v={String(results?.results.dailyMetrics.length ?? 0)}
              dense
            />
            <Row
              k="Typical ranges"
              v={results?.results.typicalRanges ? "Present" : "Missing"}
              dense
              highlight={!results?.results.typicalRanges ? "stale" : undefined}
            />
            <Row
              k="Baseline"
              v={results?.results.baselineProfile ? "Present" : "Missing"}
              dense
              highlight={!results?.results.baselineProfile ? "stale" : undefined}
            />
            <Row
              k="Sleep plan"
              v={results?.results.sleepPlan ? "Present" : "Missing"}
              dense
            />
            <Row
              k="Journal correlations"
              v={String(results?.results.journalCorrelations.length ?? 0)}
              dense
            />
          </div>
        </div>
        <div>
          <SectionHead>Time range</SectionHead>
          <div className="mt-4 space-y-0">
            <Row k="Earliest" v={formatTimestamp(results?.earliestRawTimestamp)} dense />
            <Row k="Latest" v={formatTimestamp(results?.latestRawTimestamp)} dense />
          </div>
        </div>
      </div>
    </div>
  )
}
