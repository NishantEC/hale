import { Entity, Column, PrimaryGeneratedColumn, Index, UpdateDateColumn } from 'typeorm';

@Entity('sleep_detections')
@Index(['userId', 'nightDate'])
export class SleepDetection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('timestamptz', { nullable: true })
  bedtime: Date;

  @Column('timestamptz', { nullable: true })
  wakeTime: Date;

  @Column('double precision', { default: 0 })
  durationHours: number;

  @Column('int', { default: 0 })
  interruptionCount: number;

  @Column('double precision', { default: 0 })
  continuity: number;

  @Column('double precision', { default: 0 })
  regularity: number;

  @Column('double precision', { default: 0 })
  validCoverage: number;

  @Column('double precision', { default: 0 })
  confidence: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
