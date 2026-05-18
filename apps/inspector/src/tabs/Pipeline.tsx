import { useMemo, useState } from "react"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDuration, formatTimestamp, relativeTime } from "../format"
import { ChevronDown, ChevronUp } from "lucide-react"

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
    <div className="space-y-10">
      <SectionHead
        n="00"
        kicker="Every batch run that produced sleep stages and daily scores."
        meta="/debug/pipeline"
      >
        Pipeline
      </SectionHead>

      <section>
        <StatusBadge
          tone={hero.tone}
          label={hero.label}
          detail={hero.detail}
          action={hero.action}
          size="lg"
        />
        {hero.watermarkDetail && (
          <div className="mt-4 rule-hair pt-3">
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
      </section>

      <section>
        <SectionHead n={1} kicker="The state of the pipeline at this instant.">
          State
        </SectionHead>
        <div className="mt-6">
          <PipelineStateBlock state={state} />
        </div>
      </section>

      <section>
        <SectionHead n={2} kicker="Click a bar to open the drill-in.">
          Recent runs
        </SectionHead>
        <div className="mt-6">
          <PipelineRunsChart
            history={runs}
            onRunClick={(id) => setSelectedRunId(id)}
          />
        </div>
      </section>

      {runs && runs.runs.length > 0 && (
        <section>
          <SectionHead n={3} kicker="Click a row to open the detail drawer.">
            Run history
          </SectionHead>
          <div className="mt-6">
            <PipelineRunsTable
              rows={runs.runs}
              onRowClick={(id) => setSelectedRunId(id)}
            />
          </div>
        </section>
      )}

      <section>
        <SectionHead n="A" kicker="Most recent pipeline output, by section.">
          Results
        </SectionHead>
        <div className="mt-6">
          <PipelineResultsBlock results={results} />
        </div>
      </section>

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pipeline state</CardTitle>
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
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-8">
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Watermark</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Input freshness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

type SortCol = "startedAt" | "durationMs" | "detections" | "sleepStages" | "features"
type SortDir = "asc" | "desc"

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronDown className="ml-1 h-3 w-3 opacity-30 inline" />
  return dir === "asc"
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
}

function PipelineRunsTable({
  rows,
  onRowClick,
}: {
  rows: PipelineRunRow[]
  onRowClick: (id: string) => void
}) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({
    col: "startedAt",
    dir: "desc",
  })

  function handleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" },
    )
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aVal: number
      let bVal: number
      switch (sort.col) {
        case "startedAt":
          aVal = new Date(a.startedAt).getTime()
          bVal = new Date(b.startedAt).getTime()
          break
        case "durationMs":
          aVal = a.skipped ? -1 : a.durationMs
          bVal = b.skipped ? -1 : b.durationMs
          break
        case "detections":
          aVal = a.detections
          bVal = b.detections
          break
        case "sleepStages":
          aVal = a.sleepStages
          bVal = b.sleepStages
          break
        case "features":
          aVal = a.features
          bVal = b.features
          break
      }
      return sort.dir === "asc" ? aVal - bVal : bVal - aVal
    })
  }, [rows, sort])

  function headProps(col: SortCol) {
    return {
      className: "cursor-pointer select-none",
      onClick: () => handleSort(col),
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead {...headProps("startedAt")}>
            Started <SortIcon active={sort.col === "startedAt"} dir={sort.dir} />
          </TableHead>
          <TableHead {...headProps("durationMs")}>
            Duration <SortIcon active={sort.col === "durationMs"} dir={sort.dir} />
          </TableHead>
          <TableHead {...headProps("detections")}>
            Detections <SortIcon active={sort.col === "detections"} dir={sort.dir} />
          </TableHead>
          <TableHead {...headProps("sleepStages")}>
            Sleep stages <SortIcon active={sort.col === "sleepStages"} dir={sort.dir} />
          </TableHead>
          <TableHead {...headProps("features")}>
            Features <SortIcon active={sort.col === "features"} dir={sort.dir} />
          </TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((run) => (
          <TableRow
            key={run.id}
            className="cursor-pointer"
            onClick={() => onRowClick(run.id)}
          >
            <TableCell className="font-mono text-xs">{formatTimestamp(run.startedAt)}</TableCell>
            <TableCell>{run.skipped ? "skipped" : formatDuration(run.durationMs)}</TableCell>
            <TableCell>{run.detections}</TableCell>
            <TableCell>{run.sleepStages}</TableCell>
            <TableCell>{run.features}</TableCell>
            <TableCell>
              {run.skipped ? (
                <Badge variant="outline" className="text-muted-foreground">skipped</Badge>
              ) : run.forced ? (
                <Badge variant="outline" className="border-warning/60 text-warning bg-warning/10">forced</Badge>
              ) : (
                <Badge variant="outline" className="border-success/60 text-success bg-success/10">ok</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PipelineResultsBlock({ results }: { results: PipelineResults | null }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-8">
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time range</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <Row k="Earliest" v={formatTimestamp(results?.earliestRawTimestamp)} dense />
            <Row k="Latest" v={formatTimestamp(results?.latestRawTimestamp)} dense />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
