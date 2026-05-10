import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface HealthspanContributor {
  /** Internal key, e.g. 'sleepConsistency', 'vo2max', 'rhr'. */
  key: string;
  /** Display label, e.g. 'Sleep Consistency'. */
  label: string;
  /** Section bucket, e.g. 'Sleep', 'Strain', 'Fitness'. */
  section: 'Sleep' | 'Strain' | 'Fitness';
  /** Current 30-day average value, in the metric's native units. */
  thirtyDayValue: number | null;
  /** Current 6-month average value, in the metric's native units. */
  sixMonthValue: number | null;
  /** Units string (e.g. '%', 'h', 'bpm', 'ml/kg/min'). */
  unitsLabel: string;
  /** Min/max axis values for the bar visualization. */
  axisLo: number;
  axisHi: number;
  /** 'higher' = higher is better; 'lower' = lower is better. */
  direction: 'higher' | 'lower';
  /** Estimated impact on noopAge in years. Negative = younger. */
  impactYears: number;
}

@Entity('health_assessments')
@Index(['userId', 'weekStart'], { unique: true })
export class HealthAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('date')
  weekStart: string;

  @Column('double precision')
  chronologicalAge: number;

  @Column('double precision')
  noopAge: number;

  @Column('double precision', { nullable: true })
  paceOfAging: number | null;

  @Column('jsonb', { default: () => `'[]'::jsonb` })
  contributors: HealthspanContributor[];

  @Column('varchar', { nullable: true })
  coachingTitle: string | null;

  @Column('text', { nullable: true })
  coachingBody: string | null;

  @CreateDateColumn()
  generatedAt: Date;
}
