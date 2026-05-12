import { Entity, Column, PrimaryColumn } from 'typeorm';

// Per-user watermark used to skip pipeline runs when the inputs haven't
// changed. `lastInputMaxUpdatedAt` is the max(updatedAt) observed across
// raw_sensor_records + signal_samples for this user the last time the
// pipeline ran to completion. If a fresh query returns the same value,
// runPipeline returns early without doing CPU or DB work.
@Entity('pipeline_state')
export class PipelineState {
  @PrimaryColumn('varchar')
  userId: string;

  @Column('timestamptz')
  lastRunAt: Date;

  @Column('timestamptz', { nullable: true })
  lastInputMaxUpdatedAt: Date | null;

  @Column('integer', { default: 0 })
  lastRunDurationMs: number;
}
