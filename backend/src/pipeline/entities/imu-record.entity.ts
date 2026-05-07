import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('imu_records')
@Index(['userId', 'timestamp'])
export class ImuRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column('double precision')
  accelX: number;

  @Column('double precision')
  accelY: number;

  @Column('double precision')
  accelZ: number;

  @Column('double precision')
  gyroX: number;

  @Column('double precision')
  gyroY: number;

  @Column('double precision')
  gyroZ: number;

  @Column('varchar', { default: 'realtime' })
  source: string;
}
