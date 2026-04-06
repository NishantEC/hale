import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('night_features')
@Index(['userId', 'nightDate'])
export class NightFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  nightDate: Date;

  @Column('double precision', { default: 0 })
  restingHeartRate: number;

  @Column('double precision', { default: 0 })
  rmssd: number;

  @Column('double precision', { default: 0 })
  sdnn: number;

  @Column('double precision', { default: 0 })
  respiratoryRate: number;

  @Column('double precision', { default: 0 })
  continuity: number;

  @Column('double precision', { default: 0 })
  regularity: number;

  @Column('double precision', { default: 0 })
  validCoverage: number;

  @Column('double precision', { default: 0 })
  confidenceRaw: number;

  @Column('double precision', { default: 0 })
  sleepEstimateHours: number;

  @Column({ default: 'Unknown' })
  sourceBlend: string;
}
