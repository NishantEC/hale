import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('daily_scores')
@Index(['userId', 'dayDate'])
export class DailyScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  dayDate: Date;

  @Column('int', { default: 0 })
  dailyBalance: number;

  @Column('int', { default: 0 })
  loadPressure: number;

  @Column('double precision', { default: 0 })
  sleepReserveHours: number;

  @Column({ default: 'Low' })
  confidence: string;

  @Column({ default: 'Steady' })
  recommendation: string;

  @Column('text', { default: '' })
  detail: string;
}
