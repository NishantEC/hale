import { Entity, Column, PrimaryGeneratedColumn, Index, UpdateDateColumn } from 'typeorm';

@Entity('sleep_stages')
@Index(['userId', 'nightDate'])
export class SleepStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('int', { default: 0 })
  remMinutes: number;

  @Column('int', { default: 0 })
  coreMinutes: number;

  @Column('int', { default: 0 })
  deepMinutes: number;

  @Column('int', { default: 0 })
  awakeMinutes: number;

  @Column('int', { default: 0 })
  unknownMinutes: number;

  @Column('double precision', { default: 0 })
  confidence: number;

  @Column({ default: 'Strap' })
  source: string;

  @Column('jsonb', { nullable: true })
  epochTimeline: object;

  @Column('int', { default: 1 })
  epochMinutes: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
