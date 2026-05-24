import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

// Per-day input fingerprint. Owned by the new Rust pipeline worker;
// NestJS reads it for observability and lets Postgres own the source
// of truth. See migration PipelineDayState1779950000000 for the why.
@Entity('pipeline_day_state')
@Index(['userId', 'dayDate'])
@Unique('UQ_pipeline_day_state_user_day', ['userId', 'dayDate'])
export class PipelineDayState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('date')
  dayDate: string;

  // max("updatedAt") of raw_sensor_records contributing to this day.
  // Drives per-day pipeline gating: a day re-derives iff
  // rawMaxUpdatedAt advanced past lastComputedAt's snapshot.
  @Column('timestamptz', { nullable: true })
  rawMaxUpdatedAt: Date | null;

  // Timestamp of the last successful re-derive for this day.
  @Column('timestamptz', { nullable: true })
  lastComputedAt: Date | null;

  // Monotonic counter — incremented on every successful re-derive.
  // Useful for cache-busting downstream consumers without timestamp math.
  @Column('integer', { default: 0 })
  computedRevision: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
