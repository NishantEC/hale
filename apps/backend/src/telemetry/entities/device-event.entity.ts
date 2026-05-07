import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('device_events')
@Index(['userId', 'capturedAt'])
export class DeviceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('varchar')
  deviceId: string;

  @Column('int')
  eventNumber: number;

  @Column('varchar')
  eventName: string;

  @Column('bytea', { nullable: true })
  rawPayload: Buffer | null;

  @Column('timestamptz')
  capturedAt: Date;

  @CreateDateColumn()
  receivedAt: Date;
}
