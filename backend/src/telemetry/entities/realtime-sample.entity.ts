import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('realtime_samples')
@Index(['userId', 'capturedAt'])
@Index(['userId', 'sessionId'])
export class RealtimeSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('varchar')
  deviceId: string;

  @Column('varchar')
  sessionId: string;

  @Column('varchar')
  dataType: 'hr' | 'raw';

  @Column('int', { nullable: true })
  heartRate: number | null;

  @Column('jsonb', { nullable: true })
  rawFields: Record<string, any> | null;

  @Column('bytea', { nullable: true })
  rawPayload: Buffer | null;

  @Column('timestamptz')
  capturedAt: Date;

  @CreateDateColumn()
  receivedAt: Date;
}
