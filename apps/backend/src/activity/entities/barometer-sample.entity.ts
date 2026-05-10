import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('barometer_samples')
@Index(['userId', 'timestamp'])
export class BarometerSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  userId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column('double precision')
  pressureHpa: number;

  @Column('double precision', { nullable: true })
  relativeAltitudeMeters: number | null;
}
