import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('sleep_plans')
export class SleepPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  userId: string;

  @Column('int', { default: 480 })
  targetSleepMinutes: number;

  @Column('int', { default: 420 })
  wakeMinutes: number;

  @Column('boolean', { default: false })
  alarmEnabled: boolean;

  @Column('int', { default: 420 })
  alarmMinutes: number;

  @Column('boolean', { default: false })
  smartWakeEnabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
