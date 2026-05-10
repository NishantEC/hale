import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, UpdateDateColumn } from 'typeorm';

@Entity('healthkit_daily_summaries')
@Index(['userId', 'dayDate'])
@Unique(['userId', 'dayDate'])
export class HealthkitDailySummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('date')
  dayDate: string;

  @Column('integer', { nullable: true })
  steps: number | null;

  @Column('double precision', { nullable: true })
  activeEnergyKcal: number | null;

  @Column('double precision', { nullable: true })
  exerciseMinutes: number | null;

  @Column('double precision', { nullable: true })
  standMinutes: number | null;

  @Column('double precision', { nullable: true })
  walkingDistanceMeters: number | null;

  @Column('integer', { nullable: true })
  flightsClimbed: number | null;

  @Column('double precision', { nullable: true })
  restingHeartRate: number | null;

  @Column('double precision', { nullable: true })
  hrvSdnnMs: number | null;

  @Column('double precision', { nullable: true })
  oxygenSaturationAverage: number | null;

  @Column('double precision', { nullable: true })
  respiratoryRateAverage: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
