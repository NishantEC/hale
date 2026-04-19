import { Entity, Column, PrimaryGeneratedColumn, Index, UpdateDateColumn } from 'typeorm';

@Entity('daily_metrics')
@Index(['userId', 'dayDate'])
export class DailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  dayDate: Date;

  @Column('double precision', { nullable: true })
  stressAverage: number;

  @Column('double precision', { nullable: true })
  spo2Average: number;

  @Column('double precision', { nullable: true })
  skinTempAvgCelsius: number;

  @Column('double precision', { nullable: true })
  skinTempDeltaCelsius: number;

  @Column('double precision', { nullable: true })
  strainScore: number;

  @Column('double precision', { nullable: true })
  sleepConsistencyScore: number;

  @Column('int', { default: 0 })
  detectedSleepNights: number;

  @Column('double precision', { nullable: true })
  lfHfRatioAverage: number;

  @Column('double precision', { nullable: true })
  recoveryIndex: number;

  @Column('double precision', { nullable: true })
  trainingLoadRatio: number;

  @Column('varchar', { nullable: true })
  trainingLoadRiskZone: string;

  @Column('int', { nullable: true })
  spo2DipCount: number;

  @Column('double precision', { nullable: true })
  odiPerHour: number;

  @Column('double precision', { nullable: true })
  lowestSpo2: number;

  @Column('double precision', { nullable: true })
  coreTemperatureEstimate: number;

  @Column('timestamptz', { nullable: true })
  circadianNadir: Date;

  @Column('double precision', { nullable: true })
  sleepArchitectureScore: number;

  @Column('double precision', { nullable: true })
  activeMinutes: number;

  @Column('int', { nullable: true })
  activityCount: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
