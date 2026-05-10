import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('motion_activity_samples')
@Index(['userId', 'timestamp'])
export class MotionActivitySample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  /** stationary | walking | running | automotive | cycling | unknown */
  @Column('varchar')
  activity: string;

  /** low | medium | high */
  @Column('varchar')
  confidence: string;
}
