import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('baseline_profiles')
export class BaselineProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  userId: string;

  @Column('double precision', { default: 0 })
  restingHeartRate: number;

  @Column('double precision', { default: 0 })
  rmssd: number;

  @Column('double precision', { default: 0 })
  sdnn: number;

  @Column('int', { default: 0 })
  nightsUsed: number;

  @Column('double precision', { nullable: true })
  maxHeartRate: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
