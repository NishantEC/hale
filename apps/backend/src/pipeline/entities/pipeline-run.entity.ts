import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// History + job-state row per `/pipeline/run`. Inserted with
// status='queued' at POST time, flipped to 'running' when the
// async worker picks it up, and finalized to 'succeeded' / 'failed'
// when runPipeline completes (codex adversarial review 2026-05-21,
// finding #3). Lets the controller return 202 + runId without
// holding the HTTP request open for the full compute.
@Entity('pipeline_runs')
@Index(['userId', 'startedAt'])
export class PipelineRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  startedAt: Date;

  @Column('integer')
  durationMs: number;

  @Column('boolean', { default: false })
  skipped: boolean;

  // Per-stage milliseconds emitted by the pipeline's mark() instrumentation.
  // Shape: { fetch: number; "sleep-detect": number; ...; write: number }.
  @Column('jsonb', { nullable: true })
  stages: Record<string, number> | null;

  // Output sizes — used for "was anything actually computed?" quick read.
  @Column('integer', { default: 0 })
  detections: number;

  @Column('integer', { default: 0 })
  sleepStages: number;

  @Column('integer', { default: 0 })
  features: number;

  // The window this run targeted. Null on legacy rows pre-window
  // support and on full 45-day runs (windowFrom = now-45d, windowTo =
  // now is the implicit default and isn't persisted explicitly).
  @Column('timestamptz', { nullable: true })
  windowFrom: Date | null;

  @Column('timestamptz', { nullable: true })
  windowTo: Date | null;

  // True when the run bypassed the watermark short-circuit (i.e. the
  // user clicked "Force recompute"). Lets the inspector distinguish a
  // genuine "had to recompute" run from a user-triggered re-run.
  @Column('boolean', { default: false })
  forced: boolean;

  // Async-job state. Set to 'queued' at POST time, advanced by the
  // async worker. Older rows backfilled to 'succeeded' by the
  // PipelineRunAsyncStatus migration.
  @Column('varchar', { length: 16, default: 'succeeded' })
  status: 'queued' | 'running' | 'succeeded' | 'failed';

  @Column('timestamptz', { nullable: true })
  completedAt: Date | null;

  @Column('text', { nullable: true })
  error: string | null;
}
