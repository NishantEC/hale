import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

@Entity('console_logs')
@Index(['userId', 'capturedAt'])
export class ConsoleLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('varchar')
  deviceId: string;

  @Column('text')
  message: string;

  @Column('varchar', { nullable: true })
  logLevel: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column('timestamptz')
  capturedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
