import { Entity, Column, PrimaryGeneratedColumn, Index, UpdateDateColumn } from 'typeorm';

@Entity('activity_detections')
@Index(['userId', 'startTime'])
export class ActivityDetection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  startTime: Date;

  @Column('timestamptz')
  endTime: Date;

  @Column('double precision')
  durationMinutes: number;

  @Column('varchar')
  activityType: string;

  @Column('varchar')
  intensity: string;

  @Column('double precision')
  confidence: number;

  @Column('double precision')
  heartRateAvg: number;

  @Column('double precision')
  heartRateMax: number;

  @Column('double precision')
  strainScore: number;

  @Column('double precision', { nullable: true })
  cadenceHz: number;

  @Column('varchar', { default: 'detected' })
  source: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
