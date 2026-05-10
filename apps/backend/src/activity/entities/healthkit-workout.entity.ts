import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, UpdateDateColumn } from 'typeorm';

@Entity('healthkit_workouts')
@Index(['userId', 'startTime'])
@Unique(['userId', 'uuid'])
export class HealthkitWorkout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('varchar')
  uuid: string;

  @Column('varchar')
  activityName: string;

  @Column('timestamptz')
  startTime: Date;

  @Column('timestamptz')
  endTime: Date;

  @Column('double precision')
  durationMinutes: number;

  @Column('double precision', { nullable: true })
  totalEnergyKcal: number | null;

  @Column('double precision', { nullable: true })
  totalDistanceMeters: number | null;

  @Column('double precision', { nullable: true })
  averageHeartRate: number | null;

  @Column('varchar', { nullable: true })
  appleSource: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
