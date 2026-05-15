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

  @Column('integer', { nullable: true })
  flightsCount: number;

  @Column('double precision', { nullable: true })
  elevationGainMeters: number;

  @Column('double precision', { nullable: true })
  distanceMeters: number;

  @Column('varchar', { nullable: true })
  externalSource: string;

  @Column('varchar', { default: 'detected' })
  source: string;

  @Column('varchar', { nullable: true })
  userConfirmedType: string | null;

  @Column('timestamptz', { nullable: true })
  dismissedAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
