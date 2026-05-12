import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity('raw_sensor_records')
@Index(['userId', 'timestamp'])
@Index(['userId', 'updatedAt'])
export class RawSensorRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column('double precision', { default: 0 })
  heartRate: number;

  @Column('double precision', { nullable: true })
  rrAverageMs: number;

  @Column('double precision', { nullable: true })
  spo2Red: number;

  @Column('double precision', { nullable: true })
  spo2IR: number;

  @Column('double precision', { nullable: true })
  skinTempRaw: number;

  @Column('double precision', { nullable: true })
  gravityMagnitude: number;

  @Column('double precision', { nullable: true })
  gravityX: number;

  @Column('double precision', { nullable: true })
  gravityY: number;

  @Column('double precision', { nullable: true })
  gravityZ: number;

  @Column('double precision', { nullable: true })
  respRateRaw: number;

  @Column('boolean', { nullable: true })
  skinContact: boolean;

  @Column('double precision', { nullable: true })
  ppgGreen: number;

  @Column('double precision', { nullable: true })
  ppgRedIr: number;

  @Column('double precision', { nullable: true })
  ambientLight: number;

  @Column('double precision', { nullable: true })
  ledDrive1: number;

  @Column('double precision', { nullable: true })
  ledDrive2: number;

  @Column('double precision', { nullable: true })
  signalQuality: number;

  // Bumped on every insert (default NOW()) and on every ON CONFLICT merge
  // (see upsertRawSensorRows). Powers incremental-pipeline change
  // detection: the pipeline state row stores max(updatedAt) at last run,
  // and a fresh run is skipped if the current max hasn't advanced.
  @UpdateDateColumn()
  updatedAt: Date;
}
