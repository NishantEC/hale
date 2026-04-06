import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('signal_samples')
@Index(['userId', 'timestamp'])
export class SignalSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column({ default: 'strap' })
  source: string;

  @Column('double precision', { nullable: true })
  heartRate: number;

  @Column('double precision', { nullable: true })
  ibiMs: number;

  @Column('double precision', { nullable: true })
  motionScore: number;

  @Column('double precision', { nullable: true })
  qualityScore: number;
}
