import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('varchar')
  userId: string;

  @Column('date', { nullable: true })
  dateOfBirth: string | null;

  /** 'male' | 'female' | 'other' | null. Used as a hazard-model input. */
  @Column('varchar', { nullable: true })
  biologicalSex: string | null;

  @Column('double precision', { nullable: true })
  heightCm: number | null;

  @Column('double precision', { nullable: true })
  weightKg: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
