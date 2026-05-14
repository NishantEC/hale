import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('command_responses')
@Index(['userId', 'capturedAt'])
export class CommandResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('varchar')
  deviceId: string;

  @Column('int')
  command: number;

  @Column('varchar')
  commandName: string;

  @Column('int')
  sequence: number;

  @Column('bytea', { nullable: true })
  rawPayload: Buffer | null;

  @Column('timestamptz')
  capturedAt: Date;

  @CreateDateColumn()
  receivedAt: Date;
}
