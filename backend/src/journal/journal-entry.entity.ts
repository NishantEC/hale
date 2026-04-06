import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('journal_entries')
@Index(['userId', 'timestamp'])
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column()
  factorTag: string;

  @Column('int')
  intensity: number;

  @Column('text', { default: '' })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
