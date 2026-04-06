import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

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
}
