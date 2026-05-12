import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// History row per `/pipeline/run` completion. The aggregate
// `pipeline_state` table tracks only the latest run; this one captures
// every run so we can chart stage-timing regressions over time and see
// when a recent change made the pipeline slower.
//
// Inserted as the very last write in runPipeline (after the
// transactional prune+upsert + state row). On a skipped run
// (incremental short-circuit) we still insert a row with skipped=true
// so the cadence is visible in the inspector.
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
}
